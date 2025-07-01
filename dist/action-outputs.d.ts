/**
 * @fileoverview Result aggregation and output formatting for the action.
 * Handles processing results, generates summaries, and creates action outputs.
 */
/**
 * Information about a processed Docker image.
 * Represents a single service's processing result in the action output.
 */
export type ProcessedImageInfo = {
    readonly name: string;
    readonly platform: string;
    readonly status: string;
    readonly size: number;
    readonly digest: string;
    readonly processingTimeMs: number;
    readonly cacheKey: string;
};
/**
 * List of processed Docker images.
 * Array of all processed services for GitHub Actions output.
 */
export type ProcessedImageList = ReadonlyArray<ProcessedImageInfo>;
/**
 * Summary metrics for action execution.
 * Aggregated statistics about the entire action run.
 */
export type ActionSummary = {
    readonly totalServiceCount: number;
    readonly cachedServiceCount: number;
    readonly allServicesSuccessful: boolean;
    readonly allServicesFromCache: boolean;
    readonly executionTimeMs: number;
};
/**
 * Service processing result with timing information.
 * Combines service processing results with execution timing data.
 */
export type TimedServiceResult = {
    readonly success: boolean;
    readonly restoredFromCache: boolean;
    readonly imageName: string;
    readonly cacheKey: string;
    readonly digest?: string;
    readonly platform?: string;
    readonly error?: string;
    readonly imageSize?: number;
    readonly processingDuration: number;
    readonly humanReadableDuration: string;
};
/**
 * Sets the standard output values for the action.
 * Ensures consistent output formats and proper type handling for GitHub Actions outputs.
 *
 * @param cacheHit - Whether all services were restored from cache
 * @param imageList - Complete list of processed services with metadata
 */
export declare function setActionOutputs(cacheHit: boolean, imageList: ProcessedImageList): void;
/**
 * Builds a processed image list from service results.
 * Transforms internal processing results into the format expected by GitHub Actions.
 *
 * @param results - Array of service processing results with timing information
 * @returns Formatted image list suitable for action output
 */
export declare function buildProcessedImageList(results: readonly TimedServiceResult[]): ProcessedImageList;
/**
 * Calculates action summary metrics from processing results.
 * Aggregates statistics across all processed services.
 *
 * @param results - Array of service processing results
 * @param executionTimeMs - Total action execution time in milliseconds
 * @returns Summary statistics for the action run
 */
export declare function calculateActionSummary(results: readonly TimedServiceResult[], executionTimeMs: number): ActionSummary;
/**
 * Creates GitHub Actions summary table from processing results.
 * Generates a detailed markdown table showing service processing results,
 * action summary, and referenced Compose files.
 *
 * @param results - Array of service processing results with timing
 * @param summary - Aggregated action summary statistics
 * @param referencedComposeFiles - List of Docker Compose files that were processed
 * @param skipLatestCheck - Whether latest version checking was disabled
 */
export declare function createActionSummary(results: readonly TimedServiceResult[], summary: ActionSummary, referencedComposeFiles: ReadonlyArray<string>, skipLatestCheck: boolean): void;
/**
 * Logs action completion information.
 * Outputs final status messages including cache statistics and execution time.
 *
 * @param summary - Action summary containing completion statistics
 */
export declare function logActionCompletion(summary: ActionSummary): void;
