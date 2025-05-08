import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { formatDuration, intervalToDuration } from 'date-fns';
import { chain } from 'lodash';
import * as path from 'path';

import { getImageDigest, getImageSize, loadImageFromTar, pullImage, saveImageToTar } from './docker-command';
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
  readonly error: string | undefined;
  readonly imageSize: number | undefined;
};

/**
 * Formats a file size in bytes to a human-readable string
 *
 * @param sizeInBytes - Size in bytes
 * @returns Human-readable size string (e.g. "10.5 MB")
 */
function formatFileSize(sizeInBytes: number | undefined): string {
  if (sizeInBytes === undefined) {
    return 'N/A';
  }

  if (sizeInBytes === 0) {
    return '0 Bytes';
  }

  const units = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
  const i = Math.floor(Math.log(sizeInBytes) / Math.log(1024));

  // Ensure we don't exceed the units array bounds
  const unitIndex = Math.min(i, units.length - 1);

  // Format with 2 decimal places and trim trailing zeros
  // Use array access with validation to prevent ESLint warning
  const unit = units[unitIndex as keyof typeof units] || units[0];

  return `${(sizeInBytes / Math.pow(1024, unitIndex)).toFixed(2).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1')} ${unit}`;
}

/**
 * Formats the time difference between start and end timestamps into a human-readable duration string
 *
 * @param startTime - Start timestamp in milliseconds
 * @param endTime - End timestamp in milliseconds
 * @returns Human-readable duration string (e.g. "1 hour 2 minutes 3 seconds")
 */
function formatExecutionTime(startTime: number, endTime: number): string {
  const duration = intervalToDuration({
    start: 0,
    end: endTime - startTime,
  });

  return formatDuration(duration, {
    format: ['hours', 'minutes', 'seconds'],
    zero: false,
    delimiter: ' ',
  });
}

/**
 * Generates a unique cache key for a Docker image
 *
 * @param cacheKeyPrefix - Prefix to use for the cache key
 * @param imageName - Docker image name (without tag)
 * @param imageTag - Docker image tag
 * @param imageDigest - Image digest
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined
 * @returns A unique cache key string
 */
function generateCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  imageDigest: string,
  servicePlatformString: string | undefined
): string {
  // Sanitize components to ensure valid cache key
  const sanitizedImageName = sanitizePathComponent(imageName);
  const sanitizedImageTag = sanitizePathComponent(imageTag);
  const sanitizedDigest = sanitizePathComponent(imageDigest);

  // Use provided platform or get current platform
  const platformInfo = servicePlatformString ? parsePlatformString(servicePlatformString) : getCurrentPlatformInfo();
  const sanitizedOs = sanitizePathComponent(platformInfo?.os || 'none');
  const sanitizedArch = sanitizePathComponent(platformInfo?.arch || 'none');
  const sanitizedVariant = sanitizePathComponent(platformInfo?.variant || 'none');

  return `${cacheKeyPrefix}-${sanitizedImageName}-${sanitizedImageTag}-${sanitizedOs}-${sanitizedArch}-${sanitizedVariant}-${sanitizedDigest}`;
}

/**
 * Generates filesystem path for storing Docker image tar file
 *
 * @param imageName - Docker image name (without tag)
 * @param imageTag - Docker image tag
 * @param imageDigest - Image digest
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined
 * @returns Absolute path to the tar file
 */
function generateTarPath(
  imageName: string,
  imageTag: string,
  imageDigest: string,
  servicePlatformString: string | undefined
): string {
  const tarFileName = generateCacheKey('', imageName, imageTag, imageDigest, servicePlatformString);
  return path.join(process.env.RUNNER_TEMP || '/tmp', `${tarFileName}.tar`);
}

/**
 * Processes a single Docker Compose service:
 * - Tries to restore from cache
 * - If cache miss, pulls and caches the image
 * - Handles various error conditions
 *
 * @param serviceDefinition - The Docker Compose service to process
 * @param cacheKeyPrefix - Prefix to use for the cache key
 * @returns Result object with status and metadata
 */
async function processService(
  serviceDefinition: ComposeService,
  cacheKeyPrefix: string
): Promise<ServiceProcessingResult> {
  const fullImageName = serviceDefinition.image;
  const [baseImageName, imageTag = 'latest'] = fullImageName.split(':');

  // Get image digest for cache key generation
  const imageDigest = await getImageDigest(fullImageName);
  if (!imageDigest) {
    core.warning(`Could not get digest for ${fullImageName}, skipping cache`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: '',
      digest: undefined,
      platform: serviceDefinition.platform,
      error: `Could not get digest for ${fullImageName}`,
      imageSize: undefined,
    };
  }

  const serviceCacheKey = generateCacheKey(
    cacheKeyPrefix,
    baseImageName,
    imageTag,
    imageDigest,
    serviceDefinition.platform
  );
  const imageTarPath = generateTarPath(baseImageName, imageTag, imageDigest, serviceDefinition.platform);

  if (serviceDefinition.platform) {
    core.info(`Using platform ${serviceDefinition.platform} for ${fullImageName}`);
  }
  core.info(`Cache key for ${fullImageName}: ${serviceCacheKey}`);
  core.debug(`Cache path: ${imageTarPath}`);

  // Try to restore from cache first
  const cacheHitKey = await cache.restoreCache([imageTarPath], serviceCacheKey);

  if (cacheHitKey) {
    core.info(`Cache hit for ${fullImageName}, loading from cache`);
    const loadSuccess = await loadImageFromTar(imageTarPath);

    // Get image size after loading from cache
    const imageSize = loadSuccess ? await getImageSize(fullImageName) : undefined;

    return {
      success: loadSuccess,
      restoredFromCache: loadSuccess,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: loadSuccess ? undefined : `Failed to load image from cache: ${fullImageName}`,
      imageSize,
    };
  }

  // Handle cache miss - pull the image
  core.info(`Cache miss for ${fullImageName}, pulling and saving`);
  const pullSuccess = await pullImage(fullImageName, serviceDefinition.platform);
  if (!pullSuccess) {
    core.warning(`Failed to pull ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: `Failed to pull image: ${fullImageName}`,
      imageSize: undefined,
    };
  }

  // Verify the digest matches after pull
  const newImageDigest = await getImageDigest(fullImageName);
  if (newImageDigest !== imageDigest) {
    core.warning(`Digest mismatch for ${fullImageName}: expected ${imageDigest}, got ${newImageDigest}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: `Digest mismatch for ${fullImageName}: expected ${imageDigest}, got ${newImageDigest}`,
      imageSize: undefined,
    };
  }

  // Save the image to tar file
  const saveSuccess = await saveImageToTar(fullImageName, imageTarPath);
  if (!saveSuccess) {
    core.warning(`Failed to save image to tar: ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: `Failed to save image to tar: ${fullImageName}`,
      imageSize: undefined,
    };
  }

  // Save to cache
  try {
    const cacheResultId = await cache.saveCache([imageTarPath], serviceCacheKey);
    const cacheSuccess = cacheResultId !== -1;

    if (cacheSuccess) {
      core.info(`Cached ${fullImageName} with key ${serviceCacheKey}`);
    } else {
      core.debug(`Cache was not saved for ${fullImageName} (cache ID: ${cacheResultId})`);
    }

    // Get image size after pulling
    const imageSize = await getImageSize(fullImageName);

    return {
      success: true,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  } catch (cacheError) {
    // Handle known cache saving errors gracefully without failing the operation
    if (cacheError instanceof Error) {
      if (cacheError.message.includes('already exists')) {
        core.debug(`Cache already exists for ${fullImageName}: ${cacheError.message}`);
      } else if (cacheError.message.includes('unable to upload')) {
        core.debug(`Unable to upload cache for ${fullImageName}: ${cacheError.message}`);
      } else {
        core.debug(`Error saving cache for ${fullImageName}: ${cacheError.message}`);
      }
    } else {
      core.debug(`Unknown error saving cache for ${fullImageName}: ${String(cacheError)}`);
    }

    // Get image size even if cache saving failed
    const imageSize = await getImageSize(fullImageName);

    return {
      success: true,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  }
}

/**
 * Main function that runs the GitHub Action
 *
 * @returns Promise that resolves when the action completes
 */
export async function run(): Promise<void> {
  // Record action start time
  const actionStartTime = performance.now();

  try {
    // Get action inputs from GitHub Actions environment
    const composeFilePaths: ReadonlyArray<string> = core.getMultilineInput('compose-files');
    const excludeImageNames: ReadonlyArray<string> = core.getMultilineInput('exclude-images');
    const cacheKeyPrefix = core.getInput('cache-key-prefix') || 'docker-compose-image';

    const serviceDefinitions = chain(getComposeServicesFromFiles(composeFilePaths, excludeImageNames))
      // Complete undefined platforms with getCurrentPlatformInfo()
      .map((serviceDefinition) => {
        if (serviceDefinition.platform !== undefined) {
          return serviceDefinition;
        }

        const platformInfo = getCurrentPlatformInfo();
        if (!platformInfo) {
          return serviceDefinition;
        }

        // Create platform string from platform info components
        const platformString = `${platformInfo.os}/${platformInfo.arch}${
          platformInfo.variant ? `/${platformInfo.variant}` : ''
        }`;

        return {
          ...serviceDefinition,
          platform: platformString,
        };
      })
      // Filter out duplicates by keeping only the first occurrence of each image+platform combination
      .uniqBy((serviceDefinition) => `${serviceDefinition.image}|${serviceDefinition.platform || 'default'}`)
      .value();

    if (serviceDefinitions.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      core.setOutput('cache-hit', 'false');
      core.setOutput('image-list', '');
      return;
    }

    core.info(`Found ${serviceDefinitions.length} services to cache`);
    core.setOutput('image-list', serviceDefinitions.map((service) => service.image).join(' '));

    // Process all services concurrently for efficiency
    const processingResults = await Promise.all(
      serviceDefinitions.map(async (serviceDefinition) => {
        const processingStartTime = performance.now(); // Record start time
        const processingResult = await processService(serviceDefinition, cacheKeyPrefix);
        const processingEndTime = performance.now(); // Record end time

        return {
          ...processingResult,
          humanReadableDuration: formatExecutionTime(processingStartTime, processingEndTime),
        };
      })
    );

    // Aggregate results for outputs and reporting
    const totalServiceCount = serviceDefinitions.length;
    const cachedServiceCount = processingResults.filter((result) => result.restoredFromCache).length;
    const allServicesSuccessful = processingResults.every((result) => result.success);
    const allServicesFromCache = cachedServiceCount === totalServiceCount && totalServiceCount > 0;

    core.info(`${cachedServiceCount} of ${totalServiceCount} services restored from cache`);
    core.setOutput('cache-hit', allServicesFromCache.toString());

    // Create summary table for better visibility in the GitHub Actions UI
    const summaryTable = core.summary.addHeading('Docker Compose Cache Results', 2).addTable([
      [
        { data: 'Image Name', header: true },
        { data: 'Platform', header: true },
        { data: 'Status', header: true },
        { data: 'Size', header: true },
        { data: 'Duration', header: true },
        { data: 'Cache Key', header: true },
      ],
      ...processingResults.map((result) => {
        return [
          `\`${result.imageName}\``,
          `\`${result.platform || 'default'}\``,
          result.restoredFromCache
            ? '✅ Cached'
            : result.success
              ? '⬇️ Pulled'
              : `❌ Error: ${result.error || 'Unknown'}`,
          formatFileSize(result.imageSize),
          result.humanReadableDuration,
          `\`${result.cacheKey || 'N/A'}\``,
        ];
      }),
    ]);

    // Record action end time and duration
    const actionEndTime = performance.now();
    const actionHumanReadableDuration = formatExecutionTime(actionStartTime, actionEndTime);

    summaryTable
      .addRaw('### Summary', true)
      .addRaw('| Metric | Value |', true)
      .addRaw('|--------|-------|', true)
      .addRaw(`| **Total Services** | ${totalServiceCount} |`, true)
      .addRaw(`| **Restored from Cache** | ${cachedServiceCount}/${totalServiceCount} |`, true)
      .addRaw(`| **Total Execution Time** | ${actionHumanReadableDuration} |`, true)
      .addHeading('Referenced Compose Files', 3)
      .addList(composeFilePaths.map((filePath) => `\`${filePath}\``))
      .write();

    core.info(`Action completed in ${actionHumanReadableDuration}`);

    if (allServicesSuccessful) {
      core.info('Docker Compose Cache action completed successfully');
    } else {
      core.info('Docker Compose Cache action completed with some services not fully processed');
    }
  } catch (actionError) {
    if (actionError instanceof Error) {
      core.setFailed(actionError.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action
run();
