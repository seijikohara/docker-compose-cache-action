/**
 * Represents a Docker Compose service definition with an image reference
 */
export type ComposeService = {
    readonly image: string;
    readonly platform?: string;
};
/**
 * Extracts Docker Compose services from specified files and filters them
 * based on exclusion list
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse
 * @param excludeImageNames - Array of image names to exclude from results
 * @returns Array of ComposeService objects from all valid files
 */
export declare function getComposeServicesFromFiles(composeFilePaths: ReadonlyArray<string>, excludeImageNames: ReadonlyArray<string>): ReadonlyArray<ComposeService>;
