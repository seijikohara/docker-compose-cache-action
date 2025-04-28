import * as path from 'path';

import { actionCache, actionCore } from './actions-wrapper';
import { getImageDigest, loadImageFromTar, pullImage, saveImageToTar } from './docker-command';
import { ComposeService, getComposeServicesFromFiles } from './docker-compose-file';
import { sanitizePathComponent } from './path-utils';
import { getCurrentPlatformInfo, parsePlatformString, sanitizePlatformComponent } from './platform';

/**
 * Result of processing a single Docker service
 */
type ServiceProcessingResult = {
  readonly success: boolean;
  readonly restoredFromCache: boolean;
};

/**
 * Generates a cache key for the Docker image
 * @param cacheKeyPrefix - Prefix for the cache key
 * @param servicePlatform - Optional platform specified in the Docker Compose service
 * @param digest - Docker image digest
 * @returns Generated cache key
 */
function generateCacheKey(cacheKeyPrefix: string, servicePlatform: string | undefined, digest: string): string {
  // If service has a platform specified, use it; otherwise use the current environment's platform
  const platform = servicePlatform ? parsePlatformString(servicePlatform) : getCurrentPlatformInfo();

  const os = sanitizePlatformComponent(platform?.os);
  const arch = sanitizePlatformComponent(platform?.arch);
  const variant = sanitizePlatformComponent(platform?.variant);

  return `${cacheKeyPrefix}-${os}-${arch}-${variant}-${digest}`;
}

/**
 * Generates a path for tar file to store the Docker image
 * @param imageName - Name portion of the Docker image
 * @param imageTag - Tag portion of the Docker image
 * @returns Path to store the tar file
 */
function generateTarPath(imageName: string, imageTag: string): string {
  // Sanitize both image name and tag to avoid invalid directory paths
  const sanitizedImageName = sanitizePathComponent(imageName);
  const sanitizedImageTag = sanitizePathComponent(imageTag);
  return path.join(process.env.RUNNER_TEMP || '/tmp', `${sanitizedImageName}-${sanitizedImageTag}.tar`);
}

/**
 * Processes a single Docker service
 * @param service - Docker Compose service to process
 * @param cacheKeyPrefix - Prefix for cache key generation
 * @returns Result of processing the service
 */
async function processService(service: ComposeService, cacheKeyPrefix: string): Promise<ServiceProcessingResult> {
  const fullImageName = service.image;
  const [imageName, imageTag = 'latest'] = fullImageName.split(':');

  // Get image digest
  const digest = await getImageDigest(fullImageName);
  if (!digest) {
    actionCore.warning(`Could not get digest for ${fullImageName}, skipping cache`);
    return { success: false, restoredFromCache: false };
  }

  const cacheKey = generateCacheKey(cacheKeyPrefix, service.platform, digest);
  const cachePath = generateTarPath(imageName, imageTag);

  if (service.platform) {
    actionCore.info(`Using platform ${service.platform} for ${fullImageName}`);
  }
  actionCore.info(`Cache key for ${fullImageName}: ${cacheKey}`);
  actionCore.debug(`Cache path: ${cachePath}`);

  // Try to restore from cache
  const cacheHit = await actionCache.restoreCache([cachePath], cacheKey);

  if (cacheHit) {
    actionCore.info(`Cache hit for ${fullImageName}, loading from cache`);
    const loadSuccess = await loadImageFromTar(cachePath);
    return { success: loadSuccess, restoredFromCache: loadSuccess };
  }

  // Handle cache miss - Pull the image
  actionCore.info(`Cache miss for ${fullImageName}, pulling and saving`);
  const pullSuccess = await pullImage(fullImageName, service.platform);
  if (!pullSuccess) {
    actionCore.warning(`Failed to pull ${fullImageName}`);
    return { success: false, restoredFromCache: false };
  }

  // Verify the digest matches what we expect
  const newDigest = await getImageDigest(fullImageName);
  if (newDigest !== digest) {
    actionCore.warning(`Digest mismatch for ${fullImageName}: expected ${digest}, got ${newDigest}`);
    return { success: false, restoredFromCache: false };
  }

  // Save to tar
  const saveSuccess = await saveImageToTar(fullImageName, cachePath);
  if (!saveSuccess) {
    actionCore.warning(`Failed to save image to tar: ${fullImageName}`);
    return { success: false, restoredFromCache: false };
  }

  // Save to cache
  try {
    const cacheResult = await actionCache.saveCache([cachePath], cacheKey);
    const cacheSuccess = cacheResult !== -1;

    if (cacheSuccess) {
      actionCore.info(`Cached ${fullImageName} with key ${cacheKey}`);
    } else {
      actionCore.debug(`Cache was not saved for ${fullImageName} (cache ID: ${cacheResult})`);
    }

    // Even if the cache save fails, the overall operation is successful
    return { success: true, restoredFromCache: false };
  } catch (error) {
    // Handle known cache saving errors without failing the operation
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        actionCore.debug(`Cache already exists for ${fullImageName}: ${error.message}`);
      } else if (error.message.includes('unable to upload')) {
        actionCore.debug(`Unable to upload cache for ${fullImageName}: ${error.message}`);
      } else {
        actionCore.debug(`Error saving cache for ${fullImageName}: ${error.message}`);
      }
    } else {
      actionCore.debug(`Unknown error saving cache for ${fullImageName}: ${String(error)}`);
    }
    // Image was successfully processed despite cache issues
    return { success: true, restoredFromCache: false };
  }
}

/**
 * Main function that runs the GitHub Action
 */
export async function run(): Promise<void> {
  try {
    // Get inputs from action.yml
    const composeFilePaths: ReadonlyArray<string> = actionCore.getMultilineInput('compose-files');
    const excludeImageNames: ReadonlyArray<string> = actionCore.getMultilineInput('exclude-images');
    const cacheKeyPrefix = actionCore.getInput('cache-key-prefix') || 'docker-compose-image';

    // Get Docker Compose services
    const services = getComposeServicesFromFiles(composeFilePaths, excludeImageNames);

    if (services.length === 0) {
      actionCore.info('No Docker services found in compose files or all services were excluded');
      actionCore.setOutput('cache-hit', 'false');
      actionCore.setOutput('image-list', '');
      return;
    }

    // Output info about found services
    actionCore.info(`Found ${services.length} services to cache`);
    actionCore.setOutput('image-list', services.map((service) => service.image).join(' '));

    // Process services concurrently and track results
    const results = await Promise.all(services.map((service) => processService(service, cacheKeyPrefix)));

    // Aggregate results
    const totalServices = services.length;
    const servicesRestoredFromCache = results.filter((result) => result.restoredFromCache).length;
    const allServicesSuccessful = results.every((result) => result.success);
    const allServicesFromCache = servicesRestoredFromCache === totalServices && totalServices > 0;

    // Report cache status
    actionCore.info(`${servicesRestoredFromCache} of ${totalServices} services restored from cache`);
    actionCore.setOutput('cache-hit', allServicesFromCache.toString());

    // Report overall status
    if (allServicesSuccessful) {
      actionCore.info('Docker Compose Cache action completed successfully');
    } else {
      actionCore.info('Docker Compose Cache action completed with some services not fully processed');
    }
  } catch (error) {
    if (error instanceof Error) {
      actionCore.setFailed(error.message);
    } else {
      actionCore.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action
run();
