export declare class ActionRunner {
    private readonly composeFiles;
    private readonly excludeImages;
    private readonly cacheKeyPrefix;
    private readonly dockerCommand;
    private readonly cacheManager;
    private readonly remoteRegistry;
    private readonly skopeoInstaller;
    constructor();
    private determineComposeFiles;
    private findDefaultComposeFile;
    private calculateFilesHash;
    private generateCacheKey;
    private generateCachePath;
    run(): Promise<void>;
}
