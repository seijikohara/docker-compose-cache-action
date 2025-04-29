/**
 * Gets the image digest from Docker registry
 *
 * Uses 'docker buildx imagetools inspect' to retrieve the manifest digest
 *
 * @param imageName - Docker image name with optional tag
 * @returns Promise resolving to digest string or null on failure
 */
export declare function getImageDigest(imageName: string): Promise<string | null>;
/**
 * Saves Docker image to a tar file
 *
 * @param imageName - Docker image name to save
 * @param outputPath - File path where the tar file should be created
 * @returns Promise resolving to boolean indicating success or failure
 */
export declare function saveImageToTar(imageName: string, outputPath: string): Promise<boolean>;
/**
 * Loads Docker image from a tar file
 *
 * @param tarPath - Path to the tar file containing the Docker image
 * @returns Promise resolving to boolean indicating success or failure
 */
export declare function loadImageFromTar(tarPath: string): Promise<boolean>;
/**
 * Pulls a Docker image, optionally for a specific platform
 *
 * @param imageName - Docker image name to pull
 * @param platform - Optional platform string (e.g., 'linux/amd64')
 * @returns Promise resolving to boolean indicating success or failure
 */
export declare function pullImage(imageName: string, platform?: string): Promise<boolean>;
