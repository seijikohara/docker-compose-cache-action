/**
 * @fileoverview Docker command execution utilities.
 * Provides functions for Docker image operations including pull, inspect, save, and load.
 */
/**
 * Docker image metadata from inspect command.
 * Contains essential information about a Docker image.
 */
export type DockerImageMetadata = {
    readonly Id: string;
    readonly Size: number;
    readonly Architecture: string;
    readonly Os: string;
    readonly Variant?: string;
    readonly RepoTags: readonly string[];
    readonly RepoDigests: readonly string[];
    readonly Created: string;
};
/**
 * Docker image manifest information.
 * Contains essential manifest data for an image.
 */
export type DockerImageManifest = {
    readonly digest?: string;
    readonly schemaVersion?: number;
    readonly mediaType?: string;
    readonly [key: string]: unknown;
};
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
export declare function inspectImageRemote(imageName: string): Promise<DockerImageManifest | undefined>;
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
export declare function inspectImageLocal(imageName: string): Promise<DockerImageMetadata | undefined>;
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
