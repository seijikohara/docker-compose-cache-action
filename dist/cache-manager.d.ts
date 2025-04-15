export declare class CacheManager {
    restore(key: string, path: string, restoreKeys?: readonly string[]): Promise<boolean>;
    save(key: string, path: string): Promise<void>;
}
