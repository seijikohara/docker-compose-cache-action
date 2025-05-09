/**
 * Output information from Docker inspect command.
 *
 * This type maps the output of the docker inspect command.
 * Note that images pulled from remote repositories and images loaded via docker load
 * may have different values for RepoTags, RepoDigests, and Metadata.LastTagTime.
 */
type DockerInspectInfo = {
    readonly Id: string;
    readonly RepoTags: readonly string[];
    readonly RepoDigests: readonly string[];
    readonly Parent: string;
    readonly Comment: string;
    readonly Created: string;
    readonly Container: string;
    readonly DockerVersion: string;
    readonly Author: string;
    readonly Architecture: string;
    readonly Variant?: string;
    readonly Os: string;
    readonly Size: number;
    readonly VirtualSize: number;
    readonly ContainerConfig: {
        readonly Hostname: string;
        readonly Domainname: string;
        readonly User: string;
        readonly AttachStdin: boolean;
        readonly AttachStdout: boolean;
        readonly AttachStderr: boolean;
        readonly Tty: boolean;
        readonly OpenStdin: boolean;
        readonly StdinOnce: boolean;
        readonly Env?: readonly string[];
        readonly Cmd?: readonly string[];
        readonly ArgsEscaped?: boolean;
        readonly Image: string;
        readonly Volumes?: Record<string, object>;
        readonly WorkingDir: string;
        readonly Entrypoint?: readonly string[];
        readonly OnBuild?: readonly string[];
        readonly Labels?: Record<string, string>;
    };
    readonly Config: {
        readonly Hostname: string;
        readonly Domainname: string;
        readonly User: string;
        readonly AttachStdin: boolean;
        readonly AttachStdout: boolean;
        readonly AttachStderr: boolean;
        readonly Tty: boolean;
        readonly OpenStdin: boolean;
        readonly StdinOnce: boolean;
        readonly Env?: readonly string[];
        readonly Cmd?: readonly string[];
        readonly ArgsEscaped?: boolean;
        readonly Image: string;
        readonly Volumes?: Record<string, object>;
        readonly WorkingDir: string;
        readonly Entrypoint?: readonly string[];
        readonly OnBuild?: readonly string[];
        readonly Labels?: Record<string, string>;
    };
    readonly GraphDriver: {
        readonly Data: {
            readonly MergedDir?: string;
            readonly UpperDir?: string;
            readonly WorkDir?: string;
            readonly LowerDir?: string;
        };
        readonly Name: string;
    };
    readonly RootFS: {
        readonly Type: string;
        readonly Layers: readonly string[];
    };
    readonly Metadata: {
        readonly LastTagTime: string;
    };
};
/**
 * Single platform Docker image manifest.
 *
 * Represents a manifest for a single-platform Docker image.
 */
type DockerSinglePlatformManifest = {
    readonly schemaVersion: number;
    readonly mediaType: string;
    readonly config: {
        readonly mediaType: string;
        readonly digest: string;
        readonly size: number;
    };
    readonly layers: readonly {
        readonly mediaType: string;
        readonly digest: string;
        readonly size: number;
    }[];
    readonly digest?: string;
};
/**
 * Multi platform Docker image manifest list.
 *
 * Represents a manifest list for a multi-platform Docker image.
 */
type DockerMultiPlatformManifest = {
    readonly schemaVersion: number;
    readonly mediaType: string;
    readonly digest: string;
    readonly size: number;
    readonly manifests: readonly {
        readonly mediaType: string;
        readonly digest: string;
        readonly size: number;
        readonly platform?: {
            readonly architecture: string;
            readonly os: string;
            readonly variant?: string;
            readonly 'os.version'?: string;
        };
        readonly annotations?: Record<string, string>;
    }[];
};
/**
 * Union type representing either a single platform or multi platform Docker image manifest.
 */
export type DockerManifest = DockerSinglePlatformManifest | DockerMultiPlatformManifest;
/**
 * Pulls a Docker image, optionally for a specific platform.
 *
 * @param imageName - Docker image name to pull.
 * @param platform - Optional platform string (e.g., 'linux/amd64').
 * @returns Promise resolving to boolean indicating success or failure.
 */
export declare function pullImage(imageName: string, platform: string | undefined): Promise<boolean>;
/**
 * Inspects a remote Docker image and returns its manifest information.
 *
 * Uses 'docker buildx imagetools inspect' to retrieve detailed manifest information.
 * The returned manifest can be either a single platform manifest or a multi-platform manifest list.
 *
 * @param imageName - Docker image name with optional tag.
 * @returns Promise resolving to DockerManifest object or undefined on failure.
 */
export declare function inspectImageRemote(imageName: string): Promise<DockerManifest | undefined>;
/**
 * Inspects a local Docker image and returns detailed information.
 *
 * Uses 'docker inspect' to retrieve comprehensive information about an image.
 * Contains details about the image's configuration, layers, size, architecture, etc.
 *
 * Note: Images pulled from remote repositories and images loaded via docker load
 * may have differences in the following information:
 * - RepoTags: May be empty for loaded images
 * - RepoDigests: May be empty for loaded images
 * - Metadata.LastTagTime: May be empty for loaded images
 * - GraphDriver.Data: May have different paths depending on the environment
 *
 * @param imageName - Docker image name with optional tag.
 * @returns Promise resolving to DockerInspectInfo object or undefined on failure.
 */
export declare function inspectImageLocal(imageName: string): Promise<DockerInspectInfo | undefined>;
/**
 * Saves Docker image to a tar file.
 *
 * @param imageName - Docker image name to save.
 * @param outputPath - File path where the tar file should be created.
 * @returns Promise resolving to boolean indicating success or failure.
 */
export declare function saveImageToTar(imageName: string, outputPath: string): Promise<boolean>;
/**
 * Loads Docker image from a tar file.
 *
 * @param tarPath - Path to the tar file containing the Docker image.
 * @returns Promise resolving to boolean indicating success or failure.
 */
export declare function loadImageFromTar(tarPath: string): Promise<boolean>;
export {};
