import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as fs from 'fs';
import { getErrorMessage } from './utils';

export class CacheManager {
  async restore(key: string, path: string, restoreKeys?: readonly string[]): Promise<boolean> {
    try {
      const mutableRestoreKeys = restoreKeys ? [...restoreKeys] : undefined;
      const cacheKey = await cache.restoreCache([path], key, mutableRestoreKeys);
      if (cacheKey) {
        core.info(`Cache restored for ${path} with key: ${cacheKey}`);
        return fs.existsSync(path);
      }
      return false;
    } catch (error) {
      core.warning(`Failed to restore cache for key ${key}: ${getErrorMessage(error)}`); // Use imported function
      return false;
    }
  }

  async save(key: string, path: string): Promise<void> {
    if (!fs.existsSync(path)) {
      core.warning(`Cache file '${path}' does not exist. Cannot save cache with key ${key}.`);
      return;
    }
    core.info(`Saving cache for ${path} with key: ${key}`);
    try {
      await cache.saveCache([path], key);
      core.info(`Cache saved successfully for key: ${key}`);
    } catch (error) {
      const message = getErrorMessage(error); // Use imported function
      if (error instanceof cache.ValidationError || error instanceof cache.ReserveCacheError) {
        core.warning(`Cache save warning for key ${key}: ${message}`);
      } else {
        core.warning(`Failed to save cache for key ${key}: ${message}`);
      }
    }
  }
}
