/**
 * Restores cache from the provided paths
 *
 * @param paths - An array of file paths to restore from cache
 * @param primaryKey - Primary cache key to restore
 * @param restoreKeys - Optional fallback cache keys if primary key is not found
 * @returns The cache key that was restored, or undefined if cache miss
 */
export declare function restoreCache(paths: string[], primaryKey: string, restoreKeys?: string[]): Promise<string | undefined>;
/**
 * Saves cache from the provided paths
 *
 * @param paths - An array of file paths to cache
 * @param key - Cache key to save the paths with
 * @returns Cache id if successfully saved, -1 otherwise
 */
export declare function saveCache(paths: string[], key: string): Promise<number>;
