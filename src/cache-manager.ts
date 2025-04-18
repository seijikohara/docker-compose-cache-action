import * as fs from 'fs';
import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { getErrorMessage } from './errors';

/**
 * Manages GitHub Actions cache operations for Docker images.
 * Provides a wrapper around the @actions/cache module with enhanced:
 * - Error handling and reporting
 * - File existence validation
 * - Detailed logging for cache operations
 */
export class CacheManager {
  /**
   * Restores a cached file from the GitHub Actions cache
   * @param key Primary cache key
   * @param path Path to restore the cached file to
   * @param restoreKeys Optional fallback cache keys
   * @returns True if cache was successfully restored, otherwise false
   */
  async restore(key: string, path: string, restoreKeys?: readonly string[]): Promise<boolean> {
    try {
      const mutableRestoreKeys = restoreKeys ? [...restoreKeys] : undefined;
      const cacheKey = await cache.restoreCache([path], key, mutableRestoreKeys);

      if (!cacheKey) {
        core.info(`Cache not found for key: ${key}`);
        return false;
      }

      core.info(`Cache restored for ${path} with key: ${cacheKey}`);
      if (!fs.existsSync(path)) {
        core.warning(`Cache key '${cacheKey}' was found, but the file '${path}' is missing after restore.`);
        return false;
      }
      return true;
    } catch (error: unknown) {
      core.warning(`Failed to restore cache for key ${key}: ${getErrorMessage(error)}`);
      return false;
    }
  }

  /**
   * Saves a file to the GitHub Actions cache
   * @param key Cache key to save under
   * @param path Path of the file to cache
   */
  async save(key: string, path: string): Promise<void> {
    if (!fs.existsSync(path)) {
      core.warning(`Cache file or directory '${path}' does not exist. Cannot save cache with key ${key}.`);
      return;
    }

    core.info(`Attempting to save cache for path ${path} with key: ${key}`);
    try {
      await cache.saveCache([path], key);
      core.info(`Cache saved successfully for key: ${key}`);
    } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (error instanceof cache.ValidationError || error instanceof cache.ReserveCacheError) {
        core.warning(`Cache save warning for key ${key}: ${message}`);
      } else {
        core.warning(`Failed to save cache for key ${key}: ${message}`);
      }
    }
  }
}
