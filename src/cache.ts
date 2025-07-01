/**
 * @fileoverview Cache management utilities for Docker images and manifests.
 * Handles cache key generation, file path management, and cache operations.
 */

import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as fs from 'fs/promises';
import * as path from 'path';

import { DockerImageManifest } from './docker-command';
import { sanitizePathComponent } from './file-utils';
import { getCurrentPlatformInfo, parseOciPlatformString } from './oci-platform';

/**
 * Default temp directory fallback when RUNNER_TEMP is not available.
 */
const DEFAULT_TEMP_DIR = '/tmp';

/**
 * File extensions for cached files.
 */
const CACHE_FILE_EXTENSIONS = {
  TAR: '.tar',
  MANIFEST: '-manifest.json',
} as const;

/**
 * Result of a cache operation.
 * Represents the outcome of cache save or restore operations.
 */
export type CacheOperationResult = {
  readonly success: boolean;
  readonly cacheKey?: string;
  readonly error?: string;
};

/**
 * Gets the temporary directory for storing cache files.
 * Uses the RUNNER_TEMP environment variable or falls back to '/tmp'.
 *
 * @returns Path to the temporary directory for cache file storage.
 */
export function getTempDirectory(): string {
  return process.env.RUNNER_TEMP || DEFAULT_TEMP_DIR;
}

/**
 * Generates a unique cache key for a Docker image.
 * The key is based on image name, tag, and platform information.
 *
 * Combines the provided prefix with sanitized image name, tag, and platform
 * components to create a unique, filesystem-safe cache key.
 *
 * @param cacheKeyPrefix - Prefix for the cache key (from action input)
 * @param imageName - Docker image name (e.g., 'nginx')
 * @param imageTag - Docker image tag (e.g., 'latest')
 * @param servicePlatformString - Optional platform string (e.g., 'linux/amd64')
 * @returns Unique cache key string
 */
export function generateCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  const sanitizedImageName = sanitizePathComponent(imageName);
  const sanitizedImageTag = sanitizePathComponent(imageTag);

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
 * @param cacheKeyPrefix - Prefix for the cache key
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param servicePlatformString - Optional platform string
 * @returns Manifest-specific cache key string
 */
export function generateManifestCacheKey(
  cacheKeyPrefix: string,
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  return `${generateCacheKey(cacheKeyPrefix, imageName, imageTag, servicePlatformString)}-manifest`;
}

/**
 * Generates the filesystem path for storing a Docker image tar file.
 *
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param servicePlatformString - Optional platform string
 * @returns Full filesystem path for the tar file
 */
export function generateTarPath(
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  const tarFileName = generateCacheKey('', imageName, imageTag, servicePlatformString);
  return path.join(getTempDirectory(), `${tarFileName}${CACHE_FILE_EXTENSIONS.TAR}`);
}

/**
 * Generates the filesystem path for storing a Docker image manifest file.
 *
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param servicePlatformString - Optional platform string
 * @returns Full filesystem path for the manifest file
 */
export function generateManifestPath(
  imageName: string,
  imageTag: string,
  servicePlatformString: string | undefined
): string {
  const manifestFileName = generateCacheKey('', imageName, imageTag, servicePlatformString);
  return path.join(getTempDirectory(), `${manifestFileName}${CACHE_FILE_EXTENSIONS.MANIFEST}`);
}

/**
 * Writes a Docker manifest to a JSON file.
 *
 * @param manifest - Docker manifest object to save
 * @param manifestPath - Filesystem path where manifest should be saved
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function writeManifestToFile(manifest: DockerImageManifest, manifestPath: string): Promise<boolean> {
  try {
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  } catch (error) {
    core.warning(`Failed to save manifest to ${manifestPath}: ${error}`);
    return false;
  }
}

/**
 * Reads a Docker manifest from a JSON file.
 *
 * @param manifestPath - Filesystem path to the manifest file
 * @returns Promise resolving to the manifest object, or undefined if loading fails
 */
export async function readManifestFromFile(manifestPath: string): Promise<DockerImageManifest | undefined> {
  try {
    const manifestJson = await fs.readFile(manifestPath, 'utf8');
    return JSON.parse(manifestJson) as DockerImageManifest;
  } catch (error) {
    core.debug(`Failed to load manifest from ${manifestPath}: ${error}`);
    return undefined;
  }
}

/**
 * Attempts to restore files from cache.
 *
 * @param filePaths - Array of file paths to restore from cache
 * @param cacheKey - Cache key to search for
 * @returns Promise resolving to cache operation result
 */
export async function restoreFromCache(filePaths: readonly string[], cacheKey: string): Promise<CacheOperationResult> {
  try {
    const cacheHitKey = await cache.restoreCache([...filePaths], cacheKey);
    return {
      success: !!cacheHitKey,
      cacheKey: cacheHitKey || undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.debug(`Failed to restore from cache: ${errorMessage}`);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Attempts to save files to cache.
 *
 * @param filePaths - Array of file paths to save to cache
 * @param cacheKey - Cache key for the saved files
 * @returns Promise resolving to cache operation result
 */
export async function saveToCache(filePaths: readonly string[], cacheKey: string): Promise<CacheOperationResult> {
  try {
    const cacheResultId = await cache.saveCache([...filePaths], cacheKey);
    if (cacheResultId !== -1) {
      core.debug(`Successfully cached with key ${cacheKey}`);
      return { success: true, cacheKey };
    } else {
      core.debug(`Cache was not saved (cache ID: ${cacheResultId})`);
      return { success: false, error: 'Cache save returned invalid ID' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('already exists')) {
      core.debug(`Cache already exists: ${errorMessage}`);
      return { success: true, cacheKey }; // Consider existing cache as success
    } else {
      core.debug(`Error saving cache: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }
}

/**
 * Saves manifest to file and cache.
 * Combines manifest file writing with cache storage.
 *
 * @param manifest - Docker manifest to save
 * @param manifestPath - Filesystem path for the manifest file
 * @param manifestCacheKey - Cache key for the manifest
 * @returns Promise resolving to true if both operations succeed
 */
export async function saveManifestToCache(
  manifest: DockerImageManifest,
  manifestPath: string,
  manifestCacheKey: string
): Promise<boolean> {
  const saveSuccess = await writeManifestToFile(manifest, manifestPath);
  if (saveSuccess) {
    const cacheResult = await saveToCache([manifestPath], manifestCacheKey);
    return cacheResult.success;
  }
  return false;
}
