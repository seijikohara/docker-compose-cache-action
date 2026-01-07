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
 * Checks if an image name matches any of the exclusion patterns.
 * Supports exact matches and glob-style patterns with `*` and `?` wildcards.
 *
 * @param imageName - The image name to check (e.g., "nginx:latest")
 * @param patterns - Array of patterns to match against (e.g., ["nginx:*", "*:latest"])
 * @returns true if the image matches any pattern, false otherwise
 */
export declare function matchesExcludePattern(imageName: string, patterns: ReadonlyArray<string>): boolean;
/**
 * Returns the list of Docker Compose file paths to process, based on input or defaults.
 *
 * @param candidateComposeFilePaths - Array of paths to Docker Compose files to check. If empty, default file names are used.
 * @returns Array of existing Docker Compose file paths to process.
 */
export declare function getComposeFilePathsToProcess(candidateComposeFilePaths: ReadonlyArray<string>): ReadonlyArray<string>;
/**
 * Extracts Docker Compose services from specified files and filters them based on exclusion patterns.
 * Removes duplicate services (same image and platform).
 *
 * @param composeFilePaths - Array of paths to Docker Compose files to parse. Each file is read and parsed as YAML.
 * @param excludedImagePatterns - Array of image patterns to exclude from results. Supports exact matches and glob patterns with `*` and `?`.
 * @returns Array of unique ComposeService objects from all valid files (duplicates by image+platform are removed).
 */
export declare function getComposeServicesFromFiles(composeFilePaths: ReadonlyArray<string>, excludedImagePatterns: ReadonlyArray<string>): ReadonlyArray<ComposeService>;
