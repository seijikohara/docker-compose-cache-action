/**
 * @fileoverview Cache management utilities for Docker images and manifests.
 * Handles cache key generation, file path management, and cache operations.
 */
import { DockerImageManifest } from './docker-command';
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
export declare function getTempDirectory(): string;
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
 * @param targetPlatformString - Optional platform string (e.g., 'linux/amd64')
 * @returns Unique cache key string
 */
export declare function generateCacheKey(cacheKeyPrefix: string, imageName: string, imageTag: string, targetPlatformString: string | undefined): string;
/**
 * Generates a manifest cache key for a Docker image.
 * Appends a manifest suffix to the standard cache key.
 *
 * @param cacheKeyPrefix - Prefix for the cache key
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param targetPlatformString - Optional platform string
 * @returns Manifest-specific cache key string
 */
export declare function generateManifestCacheKey(cacheKeyPrefix: string, imageName: string, imageTag: string, targetPlatformString: string | undefined): string;
/**
 * Generates the filesystem path for storing a Docker image tar file.
 *
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param targetPlatformString - Optional platform string
 * @returns Full filesystem path for the tar file
 */
export declare function generateTarPath(imageName: string, imageTag: string, targetPlatformString: string | undefined): string;
/**
 * Generates the filesystem path for storing a Docker image manifest file.
 *
 * @param imageName - Docker image name
 * @param imageTag - Docker image tag
 * @param targetPlatformString - Optional platform string
 * @returns Full filesystem path for the manifest file
 */
export declare function generateManifestPath(imageName: string, imageTag: string, targetPlatformString: string | undefined): string;
/**
 * Writes a Docker manifest to a JSON file.
 *
 * @param manifest - Docker manifest object to save
 * @param manifestPath - Filesystem path where manifest should be saved
 * @returns Promise resolving to true if successful, false otherwise
 */
export declare function writeManifestToFile(manifest: DockerImageManifest, manifestPath: string): Promise<boolean>;
/**
 * Reads a Docker manifest from a JSON file.
 *
 * @param manifestPath - Filesystem path to the manifest file
 * @returns Promise resolving to the manifest object, or undefined if loading fails
 */
export declare function readManifestFromFile(manifestPath: string): Promise<DockerImageManifest | undefined>;
/**
 * Attempts to restore files from cache.
 *
 * @param targetFilePaths - Array of file paths to restore from cache
 * @param cacheKey - Cache key to search for
 * @returns Promise resolving to cache operation result
 */
export declare function restoreFromCache(targetFilePaths: readonly string[], cacheKey: string): Promise<CacheOperationResult>;
/**
 * Attempts to save files to cache.
 *
 * @param targetFilePaths - Array of file paths to save to cache
 * @param cacheKey - Cache key for the saved files
 * @returns Promise resolving to cache operation result
 */
export declare function saveToCache(targetFilePaths: readonly string[], cacheKey: string): Promise<CacheOperationResult>;
/**
 * Saves manifest to file and cache.
 * Combines manifest file writing with cache storage.
 *
 * @param manifest - Docker manifest to save
 * @param manifestPath - Filesystem path for the manifest file
 * @param manifestCacheKey - Cache key for the manifest
 * @returns Promise resolving to true if both operations succeed
 */
export declare function saveManifestToCache(manifest: DockerImageManifest, manifestPath: string, manifestCacheKey: string): Promise<boolean>;
