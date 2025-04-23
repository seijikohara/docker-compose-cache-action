/**
 * Gets the image digest from Docker registry
 * @param imageName - Docker image name to check
 * @returns Image digest string or null if not found
 */
export declare function getImageDigest(imageName: string): Promise<string | null>;
/**
 * Saves Docker image to a tar file
 * @param imageName - Docker image name to save
 * @param outputPath - Path to save the tar file
 * @returns True if successful, false otherwise
 */
export declare function saveImageToTar(imageName: string, outputPath: string): Promise<boolean>;
/**
 * Loads Docker image from a tar file
 * @param tarPath - Path to the tar file containing the image
 * @returns True if successful, false otherwise
 */
export declare function loadImageFromTar(tarPath: string): Promise<boolean>;
/**
 * Pulls a Docker image
 * @param imageName - Docker image name to pull
 * @param platform - Optional platform to pull for (e.g. 'linux/amd64', 'linux/arm64')
 * @returns True if successful, false otherwise
 */
export declare function pullImage(imageName: string, platform?: string): Promise<boolean>;
