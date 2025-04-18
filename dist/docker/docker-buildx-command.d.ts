import { ImageManifestParser } from './image-manifest-parser';
/**
 * Handles Docker Buildx commands for inspecting remote image manifests
 */
export declare class DockerBuildxCommand {
    private readonly manifestParser;
    /**
     * Creates a new Docker Buildx command handler
     * @param manifestParser Parser for image manifests
     */
    constructor(manifestParser: ImageManifestParser);
    /**
     * Finds a specific platform digest in manifest list
     * @param manifests List of manifests to search
     * @param platform Target platform string (os/arch/variant)
     * @returns Digest string or null if not found
     */
    private findDigestForPlatform;
    /**
     * Gets the digest for a specific platform from a remote image
     * @param imageName Image name to inspect
     * @param platform Optional target platform, defaults to current host platform
     * @returns Digest string or null if not found/error
     */
    getRemoteDigest(imageName: string, platform?: string): Promise<string | null>;
}
