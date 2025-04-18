/**
 * Manages GitHub Actions cache operations for Docker images.
 * Provides a wrapper around the @actions/cache module with enhanced:
 * - Error handling and reporting
 * - File existence validation
 * - Detailed logging for cache operations
 */
export declare class CacheManager {
    /**
     * Restores a cached file from the GitHub Actions cache
     * @param key Primary cache key
     * @param path Path to restore the cached file to
     * @param restoreKeys Optional fallback cache keys
     * @returns True if cache was successfully restored, otherwise false
     */
    restore(key: string, path: string, restoreKeys?: readonly string[]): Promise<boolean>;
    /**
     * Saves a file to the GitHub Actions cache
     * @param key Cache key to save under
     * @param path Path of the file to cache
     */
    save(key: string, path: string): Promise<void>;
}
