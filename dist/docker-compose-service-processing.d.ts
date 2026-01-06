/**
 * @fileoverview Image processing logic for Docker Compose services.
 * Handles image pulling, caching, and cache restoration with manifest validation.
 */
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
 * Processes a single Docker Compose service.
 * Tries to restore from cache, if cache miss, pulls and caches the image.
 *
 * @param serviceDefinition - The Docker Compose service to process
 * @param cacheKeyPrefix - Prefix for cache keys
 * @param skipLatestCheck - Whether to skip digest verification
 * @param forceRefresh - Whether to ignore existing cache and pull fresh images
 */
export declare function processService(serviceDefinition: ComposeService, cacheKeyPrefix: string, skipLatestCheck: boolean, forceRefresh?: boolean): Promise<ServiceResult>;
