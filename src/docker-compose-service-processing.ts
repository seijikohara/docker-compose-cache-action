/**
 * @fileoverview Image processing logic for Docker Compose services.
 * Handles image pulling, caching, and cache restoration with manifest validation.
 */

import * as core from '@actions/core';

import {
  generateCacheKey,
  generateCacheKeyPrefix,
  generateManifestCacheKey,
  generateManifestPath,
  generateTarPath,
  readManifestFromFile,
  restoreFromCache,
  saveManifestToCache,
  saveToCache,
} from './cache';
import {
  type DockerImageManifest,
  inspectImageLocal,
  inspectImageRemote,
  loadImageFromTar,
  pullImage,
  saveImageToTar,
} from './docker-command';
import type { ComposeService } from './docker-compose-file';

/**
 * Result of processing a single Docker service.
 */
export type ServiceResult = {
  readonly success: boolean;
  readonly restoredFromCache: boolean;
  readonly imageName: string;
  readonly cacheKey: string;
  readonly digest?: string | undefined;
  readonly platform?: string | undefined;
  readonly error?: string | undefined;
  readonly imageSize?: number | undefined;
};

/**
 * Result of pulling and saving an image.
 */
type ImageOperationResult = {
  readonly success: boolean;
  readonly imageSize?: number | undefined;
  readonly error?: string | undefined;
};

/**
 * Pulls an image and saves it to cache.
 */
async function pullAndCacheImage(
  completeImageName: string,
  platformString: string | undefined,
  imageCacheKey: string,
  manifestCacheKey: string,
  imageTarPath: string,
  manifestPath: string,
  imageDigest: string,
  manifest: DockerImageManifest
): Promise<ImageOperationResult> {
  // Pull the image
  if (!(await pullImage(completeImageName, platformString))) {
    return {
      success: false,
      error: `Failed to pull image: ${completeImageName}`,
    };
  }

  // Verify the digest matches after pull
  const newManifest = await inspectImageRemote(completeImageName);
  const newImageDigest = newManifest?.digest;
  if (newImageDigest !== imageDigest) {
    return {
      success: false,
      error: `Digest mismatch for ${completeImageName}: expected ${imageDigest}, got ${newImageDigest}`,
    };
  }

  // Save the image to tar file
  if (!(await saveImageToTar(completeImageName, imageTarPath))) {
    return {
      success: false,
      error: `Failed to save image to tar: ${completeImageName}`,
    };
  }

  // Save manifest to cache
  await saveManifestToCache(manifest, manifestPath, manifestCacheKey);

  // Save image tar to cache
  const cacheResult = await saveToCache([imageTarPath], imageCacheKey);
  if (cacheResult.success) {
    core.info(`Cached ${completeImageName} with key ${imageCacheKey}`);
  }

  // Get image size
  const inspectInfo = await inspectImageLocal(completeImageName);

  return {
    success: true,
    imageSize: inspectInfo?.Size,
  };
}

/**
 * Attempts to restore from cache using prefix matching when registry is unavailable.
 * This is a fallback mechanism for when digest cannot be retrieved from the registry.
 *
 * @param completeImageName - Full image name with tag
 * @param imageNameWithoutTag - Image name without tag
 * @param imageTag - Image tag
 * @param platform - Optional platform string
 * @param cacheKeyPrefix - Prefix for cache keys
 * @returns Promise resolving to ServiceResult if cache found, undefined otherwise
 */
async function tryRestoreFromCacheWithoutDigest(
  completeImageName: string,
  imageNameWithoutTag: string,
  imageTag: string,
  platform: string | undefined,
  cacheKeyPrefix: string
): Promise<ServiceResult | undefined> {
  // Generate cache key prefix without digest for fallback matching
  const cacheKeyPrefixWithoutDigest = generateCacheKeyPrefix(cacheKeyPrefix, imageNameWithoutTag, imageTag, platform);

  // Generate tar path without digest (we'll use a temporary path for restoration)
  const fallbackTarPath = generateTarPath(imageNameWithoutTag, imageTag, platform, 'fallback');

  // Try to restore using prefix matching
  const cacheResult = await restoreFromCache(
    [fallbackTarPath],
    `${cacheKeyPrefixWithoutDigest}-fallback`, // This won't match exactly
    [cacheKeyPrefixWithoutDigest] // But this prefix will match any cached version
  );

  if (!cacheResult.success) {
    return undefined;
  }

  // Load image from cache
  const loadSuccess = await loadImageFromTar(fallbackTarPath);
  if (!loadSuccess) {
    core.debug(`Failed to load image from fallback cache: ${completeImageName}`);
    return undefined;
  }

  // Get image size after successful load
  const inspectInfo = await inspectImageLocal(completeImageName);
  const imageSize = inspectInfo?.Size;

  return {
    success: true,
    restoredFromCache: true,
    imageName: completeImageName,
    cacheKey: cacheResult.cacheKey || '',
    digest: undefined,
    platform,
    imageSize,
  };
}

/**
 * Processes cache hit scenario with optional manifest validation.
 */
async function processCacheHit(
  completeImageName: string,
  imageTarPath: string,
  manifestPath: string,
  manifestCacheHitKey: string | undefined,
  skipLatestCheck: boolean,
  imageDigest: string,
  platform: string | undefined
): Promise<ServiceResult> {
  // Load image from cache
  const loadSuccess = await loadImageFromTar(imageTarPath);
  if (!loadSuccess) {
    return {
      success: false,
      restoredFromCache: false,
      imageName: completeImageName,
      cacheKey: '',
      digest: imageDigest,
      platform,
      error: `Failed to load image from cache: ${completeImageName}`,
    };
  }

  // Get image size after successful load
  const inspectInfo = await inspectImageLocal(completeImageName);
  const imageSize = inspectInfo?.Size;

  // If skip latest check is enabled, return immediately
  if (skipLatestCheck) {
    core.info(`Skipped latest check for ${completeImageName}, using cached version`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: completeImageName,
      cacheKey: '',
      digest: imageDigest,
      platform,
      imageSize,
    };
  }

  // Skip manifest check if no manifest cache hit
  if (!manifestCacheHitKey) {
    core.debug(`No manifest cache for ${completeImageName}`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: completeImageName,
      cacheKey: '',
      digest: imageDigest,
      platform,
      imageSize,
    };
  }

  // Perform manifest validation
  const [cachedManifest, remoteManifest] = await Promise.all([
    readManifestFromFile(manifestPath),
    inspectImageRemote(completeImageName),
  ]);

  // Skip if manifest can't be loaded or no current manifest
  if (!cachedManifest || !remoteManifest) {
    core.debug(`Cannot compare manifests for ${completeImageName}: missing data`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: completeImageName,
      cacheKey: '',
      digest: imageDigest,
      platform,
      imageSize,
    };
  }

  // If manifests match, return success
  if (cachedManifest.digest === remoteManifest.digest) {
    core.debug(`Manifest match confirmed for ${completeImageName}`);
    return {
      success: true,
      restoredFromCache: true,
      imageName: completeImageName,
      cacheKey: '',
      digest: imageDigest,
      platform,
      imageSize,
    };
  }

  // Handle manifest mismatch - pull fresh image
  core.info(`Manifest mismatch detected for ${completeImageName}, pulling fresh image`);
  const pullSuccess = await pullImage(completeImageName, platform);
  if (!pullSuccess) {
    core.warning(`Failed to pull updated image ${completeImageName}`);
  }

  return {
    success: true,
    restoredFromCache: true,
    imageName: completeImageName,
    cacheKey: '',
    digest: imageDigest,
    platform,
    imageSize,
  };
}

/**
 * Processes a single Docker Compose service.
 * Tries to restore from cache, if cache miss, pulls and caches the image.
 *
 * @param serviceDefinition - The Docker Compose service to process
 * @param cacheKeyPrefix - Prefix for cache keys
 * @param skipLatestCheck - Whether to skip digest verification
 * @param forceRefresh - Whether to ignore existing cache and pull fresh images
 */
export async function processService(
  serviceDefinition: ComposeService,
  cacheKeyPrefix: string,
  skipLatestCheck: boolean,
  forceRefresh = false
): Promise<ServiceResult> {
  const completeImageName = serviceDefinition.image;
  const [imageNamePart, imageTagOrLatest = 'latest'] = completeImageName.split(':');

  // Guard against undefined or empty image name
  if (!imageNamePart) {
    return {
      success: false,
      restoredFromCache: false,
      imageName: completeImageName,
      cacheKey: '',
      digest: undefined,
      platform: serviceDefinition.platform,
      error: `Invalid image name format: ${completeImageName}`,
    };
  }
  const imageNameWithoutTag = imageNamePart;

  // Get image manifest with digest for cache key generation
  const manifest = await inspectImageRemote(completeImageName);
  if (!manifest || !manifest.digest) {
    // Registry unavailable - try fallback to cached version if skip-digest-verification is enabled
    if (skipLatestCheck && !forceRefresh) {
      const fallbackResult = await tryRestoreFromCacheWithoutDigest(
        completeImageName,
        imageNameWithoutTag,
        imageTagOrLatest,
        serviceDefinition.platform,
        cacheKeyPrefix
      );

      if (fallbackResult) {
        core.warning(
          `Registry unavailable for ${completeImageName}. Using cached version. ` +
            `Image may be outdated. Enable network access or set force-refresh to pull fresh images.`
        );
        return fallbackResult;
      }
    }

    core.warning(`Could not get digest for ${completeImageName}, skipping cache`);
    return {
      success: false,
      restoredFromCache: false,
      imageName: completeImageName,
      cacheKey: '',
      digest: undefined,
      platform: serviceDefinition.platform,
      error: `Could not get digest for ${completeImageName}`,
    };
  }

  const imageDigest = manifest.digest;
  const imageCacheKey = generateCacheKey(
    cacheKeyPrefix,
    imageNameWithoutTag,
    imageTagOrLatest,
    serviceDefinition.platform,
    imageDigest
  );
  const imageTarPath = generateTarPath(imageNameWithoutTag, imageTagOrLatest, serviceDefinition.platform, imageDigest);
  const manifestCacheKey = generateManifestCacheKey(
    cacheKeyPrefix,
    imageNameWithoutTag,
    imageTagOrLatest,
    serviceDefinition.platform,
    imageDigest
  );
  const manifestPath = generateManifestPath(
    imageNameWithoutTag,
    imageTagOrLatest,
    serviceDefinition.platform,
    imageDigest
  );

  if (serviceDefinition.platform) {
    core.info(`Using platform ${serviceDefinition.platform} for ${completeImageName}`);
  }
  core.info(`Cache key for ${completeImageName}: ${imageCacheKey}`);
  core.debug(`Cache path: ${imageTarPath}`);

  // Skip cache restore if force refresh is enabled
  if (forceRefresh) {
    core.info(`Force refresh enabled for ${completeImageName}, pulling fresh image`);
    const pullResult = await pullAndCacheImage(
      completeImageName,
      serviceDefinition.platform,
      imageCacheKey,
      manifestCacheKey,
      imageTarPath,
      manifestPath,
      imageDigest,
      manifest
    );

    return {
      success: pullResult.success,
      restoredFromCache: false,
      imageName: completeImageName,
      cacheKey: imageCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: pullResult.error,
      imageSize: pullResult.imageSize,
    };
  }

  // Try to restore from cache first
  const [cacheResult, manifestCacheResult] = await Promise.all([
    restoreFromCache([imageTarPath], imageCacheKey),
    restoreFromCache([manifestPath], manifestCacheKey),
  ]);

  // If no cache hit, proceed to pull the image
  if (!cacheResult.success) {
    core.info(`Cache miss for ${completeImageName}, pulling and saving`);
    const pullResult = await pullAndCacheImage(
      completeImageName,
      serviceDefinition.platform,
      imageCacheKey,
      manifestCacheKey,
      imageTarPath,
      manifestPath,
      imageDigest,
      manifest
    );

    return {
      success: pullResult.success,
      restoredFromCache: false,
      imageName: completeImageName,
      cacheKey: imageCacheKey,
      digest: imageDigest,
      platform: serviceDefinition.platform,
      error: pullResult.error,
      imageSize: pullResult.imageSize,
    };
  }

  // Process cache hit
  core.info(`Cache hit for ${completeImageName}, loading from cache`);
  const result = await processCacheHit(
    completeImageName,
    imageTarPath,
    manifestPath,
    manifestCacheResult.cacheKey,
    skipLatestCheck,
    imageDigest,
    serviceDefinition.platform
  );

  return {
    ...result,
    cacheKey: imageCacheKey,
  };
}
