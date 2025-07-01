/**
 * @fileoverview Docker Compose file parsing and service extraction utilities.
 * Handles reading, parsing, and filtering of Docker Compose services.
 */
/**
 * Represents a Docker Compose service definition with an image reference.
 */
export type ComposeService = {
    readonly image: string;
    readonly platform?: string;
};
/**
 * Returns the list of Docker Compose file paths to process, based on input or defaults.
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to check. If empty, default file names are used.
 * @returns Array of existing Docker Compose file paths to process.
 */
export declare function getComposeFilePathsToProcess(composeFilePaths: ReadonlyArray<string>): ReadonlyArray<string>;
/**
 * Extracts Docker Compose services from specified files and filters them based on exclusion list.
 * Removes duplicate services (same image and platform).
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse. Each file is read and parsed as YAML.
 * @param excludeImageNames - Array of image names to exclude from results. Services with these image names are filtered out.
 * @returns Array of unique ComposeService objects from all valid files (duplicates by image+platform are removed).
 */
export declare function getComposeServicesFromFiles(composeFilePaths: ReadonlyArray<string>, excludeImageNames: ReadonlyArray<string>): ReadonlyArray<ComposeService>;
