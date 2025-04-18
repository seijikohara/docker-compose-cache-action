/**
 * Provides Docker CLI command wrappers for core Docker operations
 */
export declare class DockerCommand {
    /**
     * Pulls a Docker image from a registry
     * @param image Image name to pull
     * @throws Error on pull failure
     */
    pull(image: string): Promise<void>;
    /**
     * Loads a Docker image from a tar archive
     * @param filePath Path to the tar file
     * @throws Error on load failure
     */
    load(filePath: string): Promise<void>;
    /**
     * Saves a Docker image to a tar archive
     * @param filePath Path to save the tar file
     * @param images List of images to save (only first one is used)
     * @throws Error on save failure
     */
    save(filePath: string, images: readonly string[]): Promise<void>;
    /**
     * Gets the RepoDigest (manifest digest) of a locally available Docker image
     * @param imageName Name of the image to get digest for
     * @returns Digest string (sha256:...) or null if not found or on error
     */
    getDigest(imageName: string): Promise<string | null>;
}
