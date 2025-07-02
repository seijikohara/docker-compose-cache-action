/**
 * @fileoverview Image processing logic for Docker Compose services.
 * Handles image pulling, caching, and cache restoration with manifest validation.
 */

import * as core from '@actions/core';

import {
  generateCacheKey,
  generateManifestCacheKey,
  generateManifestPath,
  generateTarPath,
  readManifestFromFile,
  restoreFromCache,
  saveManifestToCache,
  saveToCache,
} from './cache';
import {
  DockerImageManifest,
  inspectImageLocal,
  inspectImageRemote,
  loadImageFromTar,
  pullImage,
  saveImageToTar,
} from './docker-command';
import { ComposeService } from './docker-compose-file';

/**
 * Result of processing a single Docker service.
 */
export type ServiceResult = {
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
 * Result of pulling and saving an image.
 */
type ImageOperationResult = {
  readonly success: boolean;
  readonly imageSize?: number;
  readonly error?: string;
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
 */
export async function processService(
  serviceDefinition: ComposeService,
  cacheKeyPrefix: string,
  skipLatestCheck: boolean
): Promise<ServiceResult> {
  const completeImageName = serviceDefinition.image;
  const [imageNameWithoutTag, imageTagOrLatest = 'latest'] = completeImageName.split(':');

  // Get image manifest with digest for cache key generation
  const manifest = await inspectImageRemote(completeImageName);
  if (!manifest || !manifest.digest) {
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
    serviceDefinition.platform
  );
  const imageTarPath = generateTarPath(imageNameWithoutTag, imageTagOrLatest, serviceDefinition.platform);
  const manifestCacheKey = generateManifestCacheKey(
    cacheKeyPrefix,
    imageNameWithoutTag,
    imageTagOrLatest,
    serviceDefinition.platform
  );
  const manifestPath = generateManifestPath(imageNameWithoutTag, imageTagOrLatest, serviceDefinition.platform);

  if (serviceDefinition.platform) {
    core.info(`Using platform ${serviceDefinition.platform} for ${completeImageName}`);
  }
  core.info(`Cache key for ${completeImageName}: ${imageCacheKey}`);
  core.debug(`Cache path: ${imageTarPath}`);

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
