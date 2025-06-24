import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';

import {
  DockerManifest,
  inspectImageLocal,
  inspectImageRemote,
  loadImageFromTar,
  pullImage,
  saveImageToTar,
} from './docker-command';
import { ComposeService, getComposeFilePathsToProcess, getComposeServicesFromFiles } from './docker-compose-file';
import { formatExecutionTime, formatFileSize } from './format';
import { sanitizePathComponent } from './path-utils';
import { getCurrentPlatformInfo, parseOciPlatformString } from './platform';

/**
 * Result of processing a single Docker service.
 */
type ServiceProcessingResult = {
  readonly success: boolean;
  readonly restoredFromCache: boolean;
  readonly imageName: string;
  readonly cacheKey: string;
  readonly digest?: string;
  readonly platform?: string;
  readonly error?: string;
  readonly imageSize?: number;
};

/**
 * Output item for image list summary.
 */
type ImageListOutputItem = {
  readonly name: string;
  readonly platform: string;
  readonly status: string;
  readonly size: number;
  readonly digest: string;
  readonly processingTimeMs: number;
  readonly cacheKey: string;
};

/**
 * Output type for image list summary.
 */
type ImageListOutput = ReadonlyArray<ImageListOutputItem>;

/**
 * Sets the standard output values for the action.
 * Ensures consistent output formats and proper type handling for GitHub Actions outputs.
 *
 * @param cacheHit - Indicates if all images were restored from cache.
 * @param imageList - List of processed images with their details, or undefined if none.
 */
function setActionOutputs(cacheHit: boolean, imageList: ImageListOutput | undefined): void {
  core.setOutput('cache-hit', cacheHit.toString());
  core.setOutput('image-list', JSON.stringify(imageList || []));
}

/**
 * Generates a unique cache key for a Docker image.
 * The key is based on image name, tag, and platform information.
 *
 * @param cacheKeyPrefix - Prefix to use for the cache key.
 * @param imageName - Docker image name (without tag).
 * @param imageTag - Docker image tag.
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined.
 * @returns A unique cache key string for the image.
 */
function generateCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  // Sanitize components to ensure valid cache key
  const sanitizedImageName = sanitizePathComponent(imageName);
  const sanitizedImageTag = sanitizePathComponent(imageTag);

  // Use provided platform or get current platform
  const platformInfo = servicePlatformString ? parseOciPlatformString(servicePlatformString) : getCurrentPlatformInfo();
  const sanitizedOs = sanitizePathComponent(platformInfo?.os || 'none');
  const sanitizedArch = sanitizePathComponent(platformInfo?.arch || 'none');
  const sanitizedVariant = sanitizePathComponent(platformInfo?.variant || 'none');

  return `${cacheKeyPrefix}-${sanitizedImageName}-${sanitizedImageTag}-${sanitizedOs}-${sanitizedArch}-${sanitizedVariant}`;
}

/**
 * Generates a manifest cache key for a Docker image.
 * Appends a manifest suffix to the standard cache key.
 *
 * @param cacheKeyPrefix - Prefix to use for the cache key.
 * @param imageName - Docker image name (without tag).
 * @param imageTag - Docker image tag.
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined.
 * @returns A unique cache key string with manifest suffix.
 */
function generateManifestCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  return `${generateCacheKey(cacheKeyPrefix, imageName, imageTag, servicePlatformString)}-manifest`;
}

/**
 * Returns the temp directory for storing cache files.
 * Uses the RUNNER_TEMP environment variable or falls back to '/tmp'.
 *
 * @returns The absolute path to the temp directory.
 */
function getRunnerTempDir(): string {
  return process.env.RUNNER_TEMP || '/tmp';
}

/**
 * Generates the filesystem path for storing a Docker image tar file.
 *
 * @param imageName - Docker image name (without tag).
 * @param imageTag - Docker image tag.
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined.
 * @returns Absolute path to the tar file.
 */
function generateTarPath(imageName: string, imageTag: string, servicePlatformString: string | undefined): string {
  const tarFileName = generateCacheKey('', imageName, imageTag, servicePlatformString);
  return path.join(getRunnerTempDir(), `${tarFileName}.tar`);
}

/**
 * Generates the filesystem path for storing a Docker image manifest file.
 *
 * @param imageName - Docker image name (without tag).
 * @param imageTag - Docker image tag.
 * @param servicePlatformString - Platform string (e.g. 'linux/amd64') or undefined.
 * @returns Absolute path to the manifest file.
 */
function generateManifestPath(imageName: string, imageTag: string, servicePlatformString: string | undefined): string {
  const manifestFileName = generateCacheKey('', imageName, imageTag, servicePlatformString);
  return path.join(getRunnerTempDir(), `${manifestFileName}-manifest.json`);
}

/**
 * Saves a Docker manifest to a JSON file.
 *
 * @param manifest - Docker manifest to save.
 * @param manifestPath - Path to save the manifest JSON.
 * @returns Promise resolving to true if successful, false otherwise.
 */
async function saveManifestToJson(manifest: DockerManifest, manifestPath: string): Promise<boolean> {
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  } catch (error) {
    core.warning(`Failed to save manifest to ${manifestPath}: ${error}`);
    return false;
  }
}

/**
 * Loads a Docker manifest from a JSON file.
 *
 * @param manifestPath - Path to the manifest JSON file.
 * @returns Promise resolving to DockerManifest if successful, or undefined if loading fails.
 */
async function loadManifestFromJson(manifestPath: string): Promise<DockerManifest | undefined> {
  try {
    const manifestJson = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(manifestJson) as DockerManifest;
  } catch (error) {
    core.debug(`Failed to load manifest from ${manifestPath}: ${error}`);
    return undefined;
  }
}

/**
 * Pulls and caches a Docker image, saving both the image tar and manifest to cache.
 *
 * @param fullImageName - Complete image name with tag.
 * @param platformString - Platform string (e.g. 'linux/amd64') or undefined.
 * @param serviceCacheKey - Cache key for the image tarball.
 * @param manifestCacheKey - Cache key for the manifest file.
 * @param imageTarPath - Path to save the image tarball.
 * @param manifestPath - Path to save the manifest JSON.
 * @param imageDigest - Known image digest.
 * @param manifest - Docker manifest object.
 * @returns Promise resolving to a ServiceProcessingResult object.
 */
async function pullAndCacheImage(
  fullImageName: string,
  platformString: string | undefined,
  serviceCacheKey: string,
  manifestCacheKey: string,
  imageTarPath: string,
  manifestPath: string,
  imageDigest: string,
  manifest: DockerManifest
): Promise<ServiceProcessingResult> {
  // Pull the image
  if (!(await pullImage(fullImageName, platformString))) {
    core.warning(`Failed to pull ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: platformString,
      error: `Failed to pull image: ${fullImageName}`,
      imageSize: undefined,
    };
  }

  // Verify the digest matches after pull
  const newManifest = await inspectImageRemote(fullImageName);
  const newImageDigest = newManifest?.digest;
  if (newImageDigest !== imageDigest) {
    core.warning(`Digest mismatch for ${fullImageName}: expected ${imageDigest}, got ${newImageDigest}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: platformString,
      error: `Digest mismatch for ${fullImageName}: expected ${imageDigest}, got ${newImageDigest}`,
      imageSize: undefined,
    };
  }

  // Save the image to tar file
  if (!(await saveImageToTar(fullImageName, imageTarPath))) {
    core.warning(`Failed to save image to tar: ${fullImageName}`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: platformString,
      error: `Failed to save image to tar: ${fullImageName}`,
      imageSize: undefined,
    };
  }

  // Save manifest to json and cache
  if (manifest) {
    try {
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
      await cache.saveCache([manifestPath], manifestCacheKey);
      core.debug(`Cached manifest for ${fullImageName} with key ${manifestCacheKey}`);
    } catch (error) {
      core.debug(
        `Failed to save manifest for ${fullImageName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Save image tar to cache
  try {
    const cacheResultId = await cache.saveCache([imageTarPath], serviceCacheKey);
    if (cacheResultId !== -1) {
      core.info(`Cached ${fullImageName} with key ${serviceCacheKey}`);
    } else {
      core.debug(`Cache was not saved for ${fullImageName} (cache ID: ${cacheResultId})`);
    }
  } catch (error) {
    // Handle known cache saving errors - log but continue
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already exists')) {
      core.debug(`Cache already exists for ${fullImageName}: ${errorMessage}`);
    } else {
      core.debug(`Error saving cache for ${fullImageName}: ${errorMessage}`);
    }
  }

  // Get image size
  const inspectInfo = await inspectImageLocal(fullImageName);

  return {
    success: true,
    restoredFromCache: false,
    imageName: fullImageName,
    cacheKey: serviceCacheKey,
    digest: imageDigest,
    platform: platformString,
    error: undefined,
    imageSize: inspectInfo?.Size,
  };
}

/**
 * Processes a single Docker Compose service:
 * - Tries to restore from cache
 * - If cache miss, pulls and caches the image
 * - Handles various error conditions
 *
 * @param serviceDefinition - The Docker Compose service to process.
 * @param cacheKeyPrefix - Prefix to use for the cache key.
 * @param skipLatestCheck - Whether to skip checking for latest versions from registry.
 * @returns Promise resolving to a ServiceProcessingResult object with status and metadata.
 */
async function processService(
  serviceDefinition: ComposeService,
  cacheKeyPrefix: string,
  skipLatestCheck: boolean
): Promise<ServiceProcessingResult> {
  const fullImageName = serviceDefinition.image;
  const [baseImageName, imageTag = 'latest'] = fullImageName.split(':');

  // Get image manifest with digest for cache key generation
  const manifest = await inspectImageRemote(fullImageName);
  if (!manifest || !manifest.digest) {
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

  const imageDigest = manifest.digest;

  const serviceCacheKey = generateCacheKey(cacheKeyPrefix, baseImageName, imageTag, serviceDefinition.platform);
  const imageTarPath = generateTarPath(baseImageName, imageTag, serviceDefinition.platform);

  if (serviceDefinition.platform) {
    core.info(`Using platform ${serviceDefinition.platform} for ${fullImageName}`);
  }
  core.info(`Cache key for ${fullImageName}: ${serviceCacheKey}`);
  core.debug(`Cache path: ${imageTarPath}`);

  // Generate manifest cache key and path
  const manifestCacheKey = generateManifestCacheKey(
    cacheKeyPrefix,
    baseImageName,
    imageTag,
    serviceDefinition.platform
  );
  const manifestPath = generateManifestPath(baseImageName, imageTag, serviceDefinition.platform);

  // Try to restore from cache first
  const cacheHitKey = await cache.restoreCache([imageTarPath], serviceCacheKey);
  const manifestCacheHitKey = await cache.restoreCache([manifestPath], manifestCacheKey);

  // If no cache hit, proceed to pull the image
  if (!cacheHitKey) {
    core.info(`Cache miss for ${fullImageName}, pulling and saving`);
    return await pullAndCacheImage(
      fullImageName,
      serviceDefinition.platform,
      serviceCacheKey,
      manifestCacheKey,
      imageTarPath,
      manifestPath,
      imageDigest,
      manifest
    );
  }

  // Process cache hit
  core.info(`Cache hit for ${fullImageName}, loading from cache`);

  // If skip latest check is enabled, only restore from cache without checking registry
  if (skipLatestCheck) {
    const loadSuccess = await loadImageFromTar(imageTarPath);

    if (!loadSuccess) {
      return {
        success: false,
        restoredFromCache: false,
        imageName: fullImageName,
        cacheKey: serviceCacheKey,
        digest: imageDigest,
        platform: serviceDefinition.platform,
        error: `Failed to load image from cache: ${fullImageName}`,
        imageSize: undefined,
      };
    }

    // Get image size after successful load from cache
    const inspectInfo = await inspectImageLocal(fullImageName);
    core.info(`Skipped latest check for ${fullImageName}, using cached version`);

    return {
      success: true,
      restoredFromCache: true,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize: inspectInfo?.Size,
    };
  }

  // Restore image from cache and fetch remote manifest in parallel
  const [loadSuccess, remoteManifest] = await Promise.all([
    loadImageFromTar(imageTarPath),
    inspectImageRemote(fullImageName),
  ]);

  // If restoration fails, return immediately
  if (!loadSuccess) {
    return {
      success: false,
      restoredFromCache: false,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: `Failed to load image from cache: ${fullImageName}`,
      imageSize: undefined,
    };
  }

  // Get image size after successful load from cache
  const inspectInfo = await inspectImageLocal(fullImageName);
  const imageSize = inspectInfo?.Size;

  // Skip manifest check if no manifest cache hit
  if (!manifestCacheHitKey) {
    core.debug(`No manifest cache for ${fullImageName}`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  }

  // Load cached manifest
  const cachedManifest = await loadManifestFromJson(manifestPath);

  // Skip if manifest can't be loaded or no current manifest
  if (!cachedManifest || !remoteManifest) {
    core.debug(`Cannot compare manifests for ${fullImageName}: missing data`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  }

  // If manifests match, return success immediately
  if (cachedManifest.digest === remoteManifest.digest) {
    core.debug(`Manifest match confirmed for ${fullImageName}`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  }

  // Handle manifest mismatch
  core.info(`Manifest mismatch detected for ${fullImageName}, pulling fresh image`);

  // Pull the image to get the updated version
  const pullSuccess = await pullImage(fullImageName, serviceDefinition.platform);
  if (!pullSuccess) {
    core.warning(`Failed to pull updated image ${fullImageName}`);
    return {
      success: true, // Still consider this a success since the cached image is available
      restoredFromCache: true,
      imageName: fullImageName,
      cacheKey: serviceCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: undefined,
      imageSize,
    };
  }

  // Save fresh manifest
  const saveManifestSuccess = await saveManifestToJson(manifest, manifestPath);
  if (saveManifestSuccess) {
    await cache.saveCache([manifestPath], manifestCacheKey);
  }

  // Save the updated image to tar file
  const saveSuccess = await saveImageToTar(fullImageName, imageTarPath);
  if (saveSuccess) {
    await cache.saveCache([imageTarPath], serviceCacheKey);
    core.info(`Updated cached image for ${fullImageName}`);
  }

  // Get updated image size
  const updatedInspectInfo = await inspectImageLocal(fullImageName);

  return {
    success: true,
    restoredFromCache: true,
    imageName: fullImageName,
    cacheKey: serviceCacheKey,
    digest: imageDigest,
    platform: serviceDefinition.platform,
    error: undefined,
    imageSize: updatedInspectInfo?.Size,
  };
}

/**
 * Main function that runs the GitHub Action.
 * Handles all orchestration, output, and error management for the action.
 *
 * @returns Promise that resolves when the action completes.
 */
export async function run(): Promise<void> {
  // Record action start time
  const actionStartTime = performance.now();

  try {
    // Get action inputs from GitHub Actions environment
    const composeFilePaths: ReadonlyArray<string> = core.getMultilineInput('compose-files');
    const excludeImageNames: ReadonlyArray<string> = core.getMultilineInput('exclude-images');
    const cacheKeyPrefix = core.getInput('cache-key-prefix') || 'docker-compose-image';
    const skipLatestCheck = core.getBooleanInput('skip-latest-check');

    // Determine compose file paths
    const referencedComposeFiles = getComposeFilePathsToProcess(composeFilePaths);
    // Get service definitions (duplicates removed)
    const serviceDefinitions = getComposeServicesFromFiles(referencedComposeFiles, excludeImageNames);

    if (serviceDefinitions.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      setActionOutputs(false, []);
      return;
    }

    core.info(`Found ${serviceDefinitions.length} services to cache`);

    // Process all services concurrently for efficiency
    const processingResults = await Promise.all(
      serviceDefinitions.map(async (serviceDefinition) => {
        const processingStartTime = performance.now(); // Record start time
        const processingResult = await processService(serviceDefinition, cacheKeyPrefix, skipLatestCheck);
        const processingEndTime = performance.now(); // Record end time

        return {
          ...processingResult,
          processingDuration: processingEndTime - processingStartTime,
          humanReadableDuration: formatExecutionTime(processingStartTime, processingEndTime),
        };
      })
    );

    // Aggregate results for outputs and reporting
    const totalServiceCount = serviceDefinitions.length;
    const cachedServiceCount = processingResults.filter((result) => result.restoredFromCache).length;
    const allServicesSuccessful = processingResults.every((result) => result.success);
    const allServicesFromCache = cachedServiceCount === totalServiceCount && totalServiceCount > 0;

    // Create JSON representation for image-list output
    const imageListOutput = processingResults.map((result) => ({
      name: result.imageName,
      platform: result.platform || 'default',
      status: result.restoredFromCache ? 'Cached' : result.success ? 'Pulled' : 'Error',
      size: result.imageSize || 0,
      digest: result.digest || '',
      processingTimeMs: result.processingDuration || 0,
      cacheKey: result.cacheKey || '',
    }));

    core.info(`${cachedServiceCount} of ${totalServiceCount} services restored from cache`);
    setActionOutputs(allServicesFromCache, imageListOutput);

    // Record action end time and duration
    const actionEndTime = performance.now();
    const actionHumanReadableDuration = formatExecutionTime(actionStartTime, actionEndTime);

    // Create summary table for better visibility in the GitHub Actions UI
    core.summary
      .addHeading('Docker Compose Cache Results', 2)
      .addTable([
        [
          { data: 'Image Name', header: true },
          { data: 'Platform', header: true },
          { data: 'Status', header: true },
          { data: 'Size', header: true },
          { data: 'Processing Time', header: true },
          { data: 'Cache Key', header: true },
        ],
        ...processingResults.map((result) => {
          return [
            { data: result.imageName },
            { data: result.platform || 'default' },
            {
              data: result.restoredFromCache
                ? '✅ Cached'
                : result.success
                  ? '⬇️ Pulled'
                  : `❌ Error: ${result.error || 'Unknown'}`,
            },
            { data: formatFileSize(result.imageSize) },
            { data: result.humanReadableDuration },
            { data: result.cacheKey || 'N/A' },
          ];
        }),
      ])
      // Add summary information in a consistent markdown format
      .addHeading('Action summary', 3)
      .addTable([
        [
          { data: 'Metric', header: true },
          { data: 'Value', header: true },
        ],
        [{ data: 'Total Services' }, { data: `${totalServiceCount}` }],
        [{ data: 'Restored from Cache' }, { data: `${cachedServiceCount}/${totalServiceCount}` }],
        [{ data: 'Skip Latest Check' }, { data: skipLatestCheck ? '⏭️ Yes' : '🔍 No' }],
        [{ data: 'Total Execution Time' }, { data: actionHumanReadableDuration }],
      ])
      .addHeading('Referenced Compose Files', 3)
      .addList(
        referencedComposeFiles.map((filePath) => {
          const githubServerUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
          const githubRepository = process.env.GITHUB_REPOSITORY;
          const githubSha = process.env.GITHUB_SHA;

          if (githubRepository && githubSha) {
            return `[${filePath}](${githubServerUrl}/${githubRepository}/blob/${githubSha}/${filePath})`;
          }
          return filePath;
        })
      )
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
