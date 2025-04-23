/**
 * Represents a Docker Compose service definition with an image reference
 */
export type ComposeService = {
    readonly image: string;
    readonly platform?: string;
};
/**
 * Gets Docker Compose services from compose files, filtering out excluded images
 * @param composeFilePaths - Array of compose file paths
 * @param excludeImageNames - Array of image names to exclude
 * @returns Array of ComposeService objects with image definitions
 */
export declare function getComposeServicesFromFiles(composeFilePaths: ReadonlyArray<string>, excludeImageNames: ReadonlyArray<string>): ReadonlyArray<ComposeService>;
