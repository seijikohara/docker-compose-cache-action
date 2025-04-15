import { SkopeoInstaller } from './skopeo-installer';
export declare class RemoteRegistryClient {
    private readonly skopeoInstaller;
    constructor(skopeoInstaller: SkopeoInstaller);
    getRemoteDigest(imageName: string): Promise<string | null>;
}
