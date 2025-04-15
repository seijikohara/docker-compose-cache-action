import { SkopeoInstaller } from './skopeo-installer';
export declare class RemoteRegistryClient {
    private readonly skopeoInstaller;
    constructor(skopeoInstaller: SkopeoInstaller);
    /**
     * Fetches the manifest digest for a specific image tag and platform from a remote registry.
     * @param imageName - The full image name including tag (e.g., "nginx:stable-alpine").
     * @param platform - Optional platform string (e.g., "linux/amd64").
     * @returns The sha256 digest string if successful, otherwise null.
     */
    getRemoteDigest(imageName: string, platform?: string): Promise<string | null>;
}
