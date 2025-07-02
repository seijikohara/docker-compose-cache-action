/**
 * @fileoverview Result aggregation and output formatting for the action.
 * Handles processing results, generates summaries, and creates action outputs.
 */

import * as core from '@actions/core';

import { formatTimeBetween } from './date-utils';
import { formatFileSize } from './file-utils';

/**
 * Status values for image processing operations.
 */
const IMAGE_PROCESSING_STATUS = {
  CACHED: 'Cached',
  PULLED: 'Pulled',
  ERROR: 'Error',
} as const;

/**
 * Default values for platform-related components.
 */
const DEFAULT_PLATFORM_VALUES = {
  PLATFORM: 'default',
} as const;

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
 * @param allServicesFromCache - Whether all services were restored from cache
 * @param processedImageList - Complete list of processed services with metadata
 */
export function setActionOutputs(allServicesFromCache: boolean, processedImageList: ProcessedImageList): void {
  core.setOutput('cache-hit', allServicesFromCache.toString());
  core.setOutput('image-list', JSON.stringify(processedImageList));
}

/**
 * Builds a processed image list from service results.
 * Transforms internal processing results into the format expected by GitHub Actions.
 *
 * @param serviceResults - Array of service processing results with timing information
 * @returns Formatted image list suitable for action output
 */
export function buildProcessedImageList(serviceResults: readonly TimedServiceResult[]): ProcessedImageList {
  return serviceResults.map((result) => ({
    name: result.imageName,
    platform: result.platform || DEFAULT_PLATFORM_VALUES.PLATFORM,
    status: result.restoredFromCache
      ? IMAGE_PROCESSING_STATUS.CACHED
      : result.success
        ? IMAGE_PROCESSING_STATUS.PULLED
        : IMAGE_PROCESSING_STATUS.ERROR,
    size: result.imageSize || 0,
    digest: result.digest || '',
    processingTimeMs: result.processingDuration || 0,
    cacheKey: result.cacheKey || '',
  }));
}

/**
 * Calculates action summary metrics from processing results.
 * Aggregates statistics across all processed services.
 *
 * @param serviceResults - Array of service processing results
 * @param executionTimeMs - Total action execution time in milliseconds
 * @returns Summary statistics for the action run
 */
export function calculateActionSummary(
  serviceResults: readonly TimedServiceResult[],
  executionTimeMs: number
): ActionSummary {
  const totalServiceCount = serviceResults.length;
  const cachedServiceCount = serviceResults.filter((result) => result.restoredFromCache).length;
  const allServicesSuccessful = serviceResults.every((result) => result.success);
  const allServicesFromCache = cachedServiceCount === totalServiceCount && totalServiceCount > 0;

  return {
    totalServiceCount,
    cachedServiceCount,
    allServicesSuccessful,
    allServicesFromCache,
    executionTimeMs,
  };
}

/**
 * Creates GitHub Actions summary table from processing results.
 * Generates a detailed markdown table showing service processing results,
 * action summary, and referenced Compose files.
 *
 * @param serviceResults - Array of service processing results with timing
 * @param summary - Aggregated action summary statistics
 * @param referencedComposeFiles - List of Docker Compose files that were processed
 * @param skipLatestCheck - Whether latest version checking was disabled
 */
export function createActionSummary(
  serviceResults: readonly TimedServiceResult[],
  summary: ActionSummary,
  referencedComposeFiles: ReadonlyArray<string>,
  skipLatestCheck: boolean
): void {
  const actionHumanReadableDuration = formatTimeBetween(0, summary.executionTimeMs);

  core.summary
    .addHeading('Docker Compose Cache Results', 2)
    .addTable([
      [
        { data: 'Image Name', header: true },
        { data: 'Platform', header: true },
        { data: 'Status', header: true },
        { data: 'Size', header: true },
        { data: 'Processing Time', header: true },
        { data: 'Cache Key', header: true },
      ],
      ...serviceResults.map((result) => [
        { data: result.imageName },
        { data: result.platform || DEFAULT_PLATFORM_VALUES.PLATFORM },
        {
          data: result.restoredFromCache
            ? '✅ Cached'
            : result.success
              ? '⬇️ Pulled'
              : `❌ Error: ${result.error || 'Unknown'}`,
        },
        { data: formatFileSize(result.imageSize) },
        { data: result.humanReadableDuration },
        { data: result.cacheKey || 'N/A' },
      ]),
    ])
    .addHeading('Action summary', 3)
    .addTable([
      [
        { data: 'Metric', header: true },
        { data: 'Value', header: true },
      ],
      [{ data: 'Total Services' }, { data: `${summary.totalServiceCount}` }],
      [{ data: 'Restored from Cache' }, { data: `${summary.cachedServiceCount}/${summary.totalServiceCount}` }],
      [{ data: 'Skip Latest Check' }, { data: skipLatestCheck ? '⏭️ Yes' : '🔍 No' }],
      [{ data: 'Total Execution Time' }, { data: actionHumanReadableDuration }],
    ])
    .addHeading('Referenced Compose Files', 3)
    .addList(referencedComposeFiles.map((filePath) => filePath))
    .write();
}

/**
 * Logs action completion information.
 * Outputs final status messages including cache statistics and execution time.
 *
 * @param summary - Action summary containing completion statistics
 */
export function logActionCompletion(summary: ActionSummary): void {
  const actionHumanReadableDuration = formatTimeBetween(0, summary.executionTimeMs);

  core.info(`${summary.cachedServiceCount} of ${summary.totalServiceCount} services restored from cache`);
  core.info(`Action completed in ${actionHumanReadableDuration}`);

  if (summary.allServicesSuccessful) {
    core.info('Docker Compose Cache action completed successfully');
  } else {
    core.info('Docker Compose Cache action completed with some services not fully processed');
  }
}
