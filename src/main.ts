import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { formatDuration, intervalToDuration } from 'date-fns';
import * as path from 'path';

import { getImageDigest, loadImageFromTar, pullImage, saveImageToTar } from './docker-command';
import { ComposeService, getComposeServicesFromFiles } from './docker-compose-file';
import { sanitizePathComponent } from './path-utils';
import { getCurrentPlatformInfo, parsePlatformString } from './platform';

/**
 * Result of processing a single Docker service
 */
type ServiceProcessingResult = {
  readonly success: boolean;
  readonly restoredFromCache: boolean;
  readonly imageName: string;
  readonly cacheKey: string;
  readonly digest: string | undefined;
  readonly platform: string | undefined;
  readonly error?: string;
};

/**
 * Generates a unique cache key for a Docker image
 *
 * @param cacheKeyPrefix - Prefix to use for the cache key
 * @param imageName - Docker image name (without tag)
 * @param imageTag - Docker image tag
 * @param servicePlatform - Platform string (e.g. 'linux/amd64') or undefined
 * @param digest - Image digest
 * @returns A unique cache key string
 */
function generateCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  servicePlatform: string | undefined,
  digest: string
): string {
  // Sanitize components to ensure valid cache key
  const sanitizedImageName = sanitizePathComponent(imageName);
  const sanitizedImageTag = sanitizePathComponent(imageTag);
  const sanitizedDigest = sanitizePathComponent(digest);

  // Use provided platform or get current platform
  const platform = servicePlatform ? parsePlatformString(servicePlatform) : getCurrentPlatformInfo();
  const sanitizedOs = sanitizePathComponent(platform?.os || 'none');
  const sanitizedArch = sanitizePathComponent(platform?.arch || 'none');
  const sanitizedVariant = sanitizePathComponent(platform?.variant || 'none');

  return `${cacheKeyPrefix}-${sanitizedImageName}-${sanitizedImageTag}-${sanitizedOs}-${sanitizedArch}-${sanitizedVariant}-${sanitizedDigest}`;
}

/**
 * Generates filesystem path for storing Docker image tar file
 *
 * @param imageName - Docker image name (without tag)
 * @param imageTag - Docker image tag
 * @param servicePlatform - Platform string (e.g. 'linux/amd64') or undefined
 * @param digest - Image digest
 * @returns Absolute path to the tar file
 */
function generateTarPath(
  imageName: string,
  imageTag: string,
  servicePlatform: string | undefined,
  digest: string
): string {
  const tarFileName = generateCacheKey('', imageName, imageTag, servicePlatform, digest);
  return path.join(process.env.RUNNER_TEMP || '/tmp', `${tarFileName}.tar`);
}

/**
 * Processes a single Docker Compose service:
 * - Tries to restore from cache
 * - If cache miss, pulls and caches the image
 * - Handles various error conditions
 *
 * @param service - The Docker Compose service to process
 * @param cacheKeyPrefix - Prefix to use for the cache key
 * @returns Result object with status and metadata
 */
async function processService(service: ComposeService, cacheKeyPrefix: string): Promise<ServiceProcessingResult> {
  const fullImageName = service.image;
  const [imageName, imageTag = 'latest'] = fullImageName.split(':');

  // Get image digest for cache key generation
  const digest = await getImageDigest(fullImageName);
  if (!digest) {
    core.warning(`Could not get digest for ${fullImageName}, skipping cache`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: '',
      digest: undefined,
      platform: service.platform,
    };
  }

  const cacheKey = generateCacheKey(cacheKeyPrefix, imageName, imageTag, service.platform, digest);
  const cachePath = generateTarPath(imageName, imageTag, service.platform, digest);

  if (service.platform) {
    core.info(`Using platform ${service.platform} for ${fullImageName}`);
  }
  core.info(`Cache key for ${fullImageName}: ${cacheKey}`);
  core.debug(`Cache path: ${cachePath}`);

  // Try to restore from cache first
  const cacheHit = await cache.restoreCache([cachePath], cacheKey);

  if (cacheHit) {
    core.info(`Cache hit for ${fullImageName}, loading from cache`);
    const loadSuccess = await loadImageFromTar(cachePath);
    return {
      success: loadSuccess,
      restoredFromCache: loadSuccess,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  }

  // Handle cache miss - pull the image
  core.info(`Cache miss for ${fullImageName}, pulling and saving`);
  const pullSuccess = await pullImage(fullImageName, service.platform);
  if (!pullSuccess) {
    core.warning(`Failed to pull ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  }

  // Verify the digest matches after pull
  const newDigest = await getImageDigest(fullImageName);
  if (newDigest !== digest) {
    core.warning(`Digest mismatch for ${fullImageName}: expected ${digest}, got ${newDigest}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  }

  // Save the image to tar file
  const saveSuccess = await saveImageToTar(fullImageName, cachePath);
  if (!saveSuccess) {
    core.warning(`Failed to save image to tar: ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  }

  // Save to cache
  try {
    const cacheResult = await cache.saveCache([cachePath], cacheKey);
    const cacheSuccess = cacheResult !== -1;

    if (cacheSuccess) {
      core.info(`Cached ${fullImageName} with key ${cacheKey}`);
    } else {
      core.debug(`Cache was not saved for ${fullImageName} (cache ID: ${cacheResult})`);
    }

    return {
      success: true,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  } catch (error) {
    // Handle known cache saving errors gracefully without failing the operation
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        core.debug(`Cache already exists for ${fullImageName}: ${error.message}`);
      } else if (error.message.includes('unable to upload')) {
        core.debug(`Unable to upload cache for ${fullImageName}: ${error.message}`);
      } else {
        core.debug(`Error saving cache for ${fullImageName}: ${error.message}`);
      }
    } else {
      core.debug(`Unknown error saving cache for ${fullImageName}: ${String(error)}`);
    }
    return {
      success: true,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey,
      digest,
      platform: service.platform,
    };
  }
}

/**
 * Main function that runs the GitHub Action
 *
 * @returns Promise that resolves when the action completes
 */
export async function run(): Promise<void> {
  try {
    // Get action inputs from GitHub Actions environment
    const composeFilePaths: ReadonlyArray<string> = core.getMultilineInput('compose-files');
    const excludeImageNames: ReadonlyArray<string> = core.getMultilineInput('exclude-images');
    const cacheKeyPrefix = core.getInput('cache-key-prefix') || 'docker-compose-image';

    const services = getComposeServicesFromFiles(composeFilePaths, excludeImageNames)
      // Complete undefined platforms with getCurrentPlatformInfo()
      .map((service) => {
        if (service.platform !== undefined) {
          return service;
        }

        const platformInfo = getCurrentPlatformInfo();
        if (!platformInfo) {
          return service;
        }

        // Create platform string from platform info components
        const platformStr = `${platformInfo.os}/${platformInfo.arch}${
          platformInfo.variant ? `/${platformInfo.variant}` : ''
        }`;

        return {
          ...service,
          platform: platformStr,
        };
      })
      // Filter out duplicates by keeping only the first occurrence of each image+platform combination
      .filter((service, index, array) => {
        const key = `${service.image}|${service.platform || 'default'}`;
        return array.findIndex((s) => `${s.image}|${s.platform || 'default'}` === key) === index;
      });

    if (services.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      core.setOutput('cache-hit', 'false');
      core.setOutput('image-list', '');
      return;
    }

    core.info(`Found ${services.length} services to cache`);
    core.setOutput('image-list', services.map((service) => service.image).join(' '));

    // Process all services concurrently for efficiency
    const results = await Promise.all(
      services.map(async (service) => {
        const startTime = performance.now(); // Record start time
        const result = await processService(service, cacheKeyPrefix);
        const endTime = performance.now(); // Record end time
        const duration = intervalToDuration({
          start: 0,
          end: endTime - startTime,
        });

        return {
          ...result,
          humanReadableDuration: formatDuration(duration, {
            format: ['hours', 'minutes', 'seconds'],
            zero: false,
            delimiter: ' ',
          }),
        };
      })
    );

    // Aggregate results for outputs and reporting
    const totalServices = services.length;
    const servicesRestoredFromCache = results.filter((result) => result.restoredFromCache).length;
    const allServicesSuccessful = results.every((result) => result.success);
    const allServicesFromCache = servicesRestoredFromCache === totalServices && totalServices > 0;

    core.info(`${servicesRestoredFromCache} of ${totalServices} services restored from cache`);
    core.setOutput('cache-hit', allServicesFromCache.toString());

    // Create summary table for better visibility in the GitHub Actions UI
    const summary = core.summary.addHeading('Docker Compose Cache Results', 2).addTable([
      [
        { data: 'Image Name', header: true },
        { data: 'Platform', header: true },
        { data: 'Cache Hit', header: true },
        { data: 'Status', header: true },
        { data: 'Duration', header: true },
        { data: 'Cache Key', header: true },
      ],
      ...results.map((result) => {
        // Handle duration formatting

        return [
          result.imageName,
          result.platform || 'default',
          result.restoredFromCache ? '✅' : '❌',
          result.success ? 'Success' : 'Failed',
          result.humanReadableDuration,
          result.cacheKey || 'N/A',
        ];
      }),
    ]);

    summary
      .addRaw(`Total Services: ${totalServices}`, true)
      .addRaw(`Restored from Cache: ${servicesRestoredFromCache}/${totalServices}`, true)
      .write();

    if (allServicesSuccessful) {
      core.info('Docker Compose Cache action completed successfully');
    } else {
      core.info('Docker Compose Cache action completed with some services not fully processed');
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action
run();
