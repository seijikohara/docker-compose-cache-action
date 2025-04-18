import { CacheManager } from './cache-manager';
import { DockerBuildxCommand } from './docker/docker-buildx-command';
import { DockerCommand } from './docker/docker-command';
/**
 * Main runner class for the Docker Compose Cache action.
 * Coordinates the entire caching workflow:
 * 1. Parses Docker Compose files to identify images
 * 2. Fetches remote image digests to validate caches
 * 3. Restores images from cache when valid
 * 4. Pulls and caches images when needed
 */
export declare class ActionRunner {
    private readonly composeFiles;
    private readonly excludeImages;
    private readonly cacheKeyPrefix;
    private readonly dockerCommand;
    private readonly cacheManager;
    private readonly dockerBuildxCommand;
    /**
     * Creates a new ActionRunner with the necessary dependencies
     * @param dockerCommand Docker command executor
     * @param cacheManager Cache manager for GitHub Actions cache
     * @param dockerBuildxCommand Docker buildx command executor
     */
    constructor(dockerCommand: DockerCommand, cacheManager: CacheManager, dockerBuildxCommand: DockerBuildxCommand);
    /**
     * Determines which compose files to use based on input or defaults
     * @param input User-provided file paths from action input
     * @returns Array of validated file paths
     */
    private determineComposeFiles;
    /**
     * Tries to find a default compose file
     * @returns Path to found file or undefined
     */
    private findDefaultComposeFile;
    /**
     * Generates cache key for an image
     * @param imageName Image name
     * @param platform Target platform
     * @param digest Image digest
     * @returns Cache key string
     */
    private generateCacheKey;
    /**
     * Generates filesystem path for cached image
     * @param imageName Image name
     * @param platform Target platform
     * @param digest Image digest
     * @returns Path for tar file
     */
    private generateCachePath;
    /**
     * Main execution method for the action
     * @returns Promise that resolves when all operations are complete
     */
    run(): Promise<void>;
}
