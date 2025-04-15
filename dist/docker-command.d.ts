export declare class DockerCommand {
    pull(image: string): Promise<void>;
    load(filePath: string): Promise<void>;
    save(filePath: string, images: readonly string[]): Promise<void>;
    getDigest(imageName: string): Promise<string | null>;
}
