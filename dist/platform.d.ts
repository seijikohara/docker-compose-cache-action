/**
 * Platform utility module for mapping between Node.js and OCI/Docker platform identifiers.
 * Provides conversion and normalization of OS/Architecture values.
 */
/**
 * Maps Node.js process.arch to the corresponding OCI architecture identifier
 * @param nodeArch Node.js architecture identifier
 * @returns OCI architecture identifier or undefined if not found
 */
export declare function mapNodeArchToOciArch(nodeArch: string): string | undefined;
/**
 * Maps Node.js process.platform to the corresponding OCI OS identifier
 * @param nodePlatform Node.js platform identifier
 * @returns OCI OS identifier or undefined if not found
 */
export declare function mapNodeOsToOciOs(nodePlatform: string): string | undefined;
/**
 * Gets the OCI-standard platform string for the current Node.js environment
 * @returns Platform string in format "os/arch" or null if mapping failed
 */
export declare function getCurrentOciPlatform(): string | null;
/**
 * Normalizes a platform string for safe use in cache keys or file paths
 * @param platform Platform string to normalize (e.g., "linux/amd64")
 * @returns Normalized string with slashes replaced by underscores
 */
export declare function normalizePlatform(platform: string | undefined): string;
