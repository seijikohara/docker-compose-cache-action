/**
 * @fileoverview Main entry point for the Docker Compose Cache GitHub Action.
 * Orchestrates service processing, cache operations, and action outputs.
 */

import * as core from '@actions/core';

import {
  buildProcessedImageList,
  calculateActionSummary,
  createActionSummary,
  logActionCompletion,
  setActionOutputs,
  type TimedServiceResult,
} from './action-outputs.js';
import { formatTimeBetween } from './date-utils.js';
import { getComposeFilePathsToProcess, getComposeServicesFromFiles } from './docker-compose-file.js';
import { processService } from './docker-compose-service-processing.js';

/**
 * Default cache key prefix when none is provided.
 */
const DEFAULT_CACHE_KEY_PREFIX = 'docker-compose-image';

/**
 * When to write the GitHub Actions job summary.
 * 'on-failure' refers to image processing errors, which do not fail the job itself.
 */
type JobSummaryMode = 'always' | 'never' | 'on-failure';

/**
 * Job summary mode used when the input is not provided.
 */
const DEFAULT_JOB_SUMMARY_MODE: JobSummaryMode = 'always';

/**
 * Configuration for action inputs.
 */
type ActionConfig = {
  readonly composeFilePaths: ReadonlyArray<string>;
  readonly excludeImageNames: ReadonlyArray<string>;
  readonly cacheKeyPrefix: string;
  readonly skipDigestVerification: boolean;
  readonly forceRefresh: boolean;
  readonly jobSummaryMode: JobSummaryMode;
};

/**
 * Gets the skip digest verification setting from action inputs.
 * Handles both the new 'skip-digest-verification' and deprecated 'skip-latest-check' inputs.
 * If the deprecated input is used, a warning is logged.
 *
 * @returns boolean indicating whether to skip digest verification
 */
function getSkipDigestVerification(): boolean {
  // Check new input first
  const skipDigestVerificationInput = core.getInput('skip-digest-verification');
  if (skipDigestVerificationInput !== '') {
    return core.getBooleanInput('skip-digest-verification');
  }

  // Fall back to deprecated input
  const skipLatestCheckInput = core.getInput('skip-latest-check');
  if (skipLatestCheckInput !== '') {
    core.warning(
      "The 'skip-latest-check' input is deprecated and will be removed in a future major version. " +
        "Please use 'skip-digest-verification' instead."
    );
    return core.getBooleanInput('skip-latest-check');
  }

  return false;
}

/**
 * Gets the job summary mode from action inputs.
 * Accepts the value in any letter case, and rejects unknown values so that a typo
 * surfaces immediately instead of silently falling back to the default.
 *
 * @returns the requested job summary mode
 * @throws Error when the input holds a value other than the accepted ones
 */
function getJobSummaryMode(): JobSummaryMode {
  const jobSummaryInput = core.getInput('add-job-summary').toLowerCase();

  if (jobSummaryInput === '') {
    return DEFAULT_JOB_SUMMARY_MODE;
  }
  if (jobSummaryInput === 'always' || jobSummaryInput === 'never' || jobSummaryInput === 'on-failure') {
    return jobSummaryInput;
  }

  throw new Error(`Invalid 'add-job-summary' input: '${jobSummaryInput}'. Expected one of: always, never, on-failure`);
}

/**
 * Decides whether the job summary should be written for this run.
 *
 * @param jobSummaryMode - Requested job summary mode
 * @param allServicesSuccessful - Whether every service was processed without error
 * @returns boolean indicating whether to write the job summary
 */
function shouldWriteJobSummary(jobSummaryMode: JobSummaryMode, allServicesSuccessful: boolean): boolean {
  if (jobSummaryMode === 'never') {
    return false;
  }
  if (jobSummaryMode === 'on-failure') {
    return !allServicesSuccessful;
  }
  return true;
}

/**
 * Gets action configuration from GitHub Actions environment.
 */
function getActionConfig(): ActionConfig {
  return {
    composeFilePaths: core.getMultilineInput('compose-files'),
    excludeImageNames: core.getMultilineInput('exclude-images'),
    cacheKeyPrefix: core.getInput('cache-key-prefix') || DEFAULT_CACHE_KEY_PREFIX,
    skipDigestVerification: getSkipDigestVerification(),
    forceRefresh: core.getBooleanInput('force-refresh'),
    jobSummaryMode: getJobSummaryMode(),
  };
}

/**
 * Main function that runs the GitHub Action.
 * Handles all orchestration, output, and error management for the action.
 */
export async function run(): Promise<void> {
  const actionStartTime = performance.now();

  try {
    const actionConfig = getActionConfig();

    const discoveredComposeFiles = getComposeFilePathsToProcess(actionConfig.composeFilePaths);
    const targetServices = getComposeServicesFromFiles(discoveredComposeFiles, actionConfig.excludeImageNames);

    if (targetServices.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      setActionOutputs(false, []);
      return;
    }

    core.info(`Found ${targetServices.length} services to cache`);

    if (actionConfig.forceRefresh) {
      core.info('Force refresh enabled - ignoring existing cache');
    }

    // Process all services concurrently
    const serviceProcessingResults: readonly TimedServiceResult[] = await Promise.all(
      targetServices.map(async (currentService) => {
        const serviceStartTime = performance.now();
        const serviceResult = await processService(
          currentService,
          actionConfig.cacheKeyPrefix,
          actionConfig.skipDigestVerification,
          actionConfig.forceRefresh
        );
        const serviceEndTime = performance.now();

        return {
          ...serviceResult,
          processingDuration: serviceEndTime - serviceStartTime,
          humanReadableDuration: formatTimeBetween(serviceStartTime, serviceEndTime),
        };
      })
    );

    const actionEndTime = performance.now();
    const executionTimeMs = actionEndTime - actionStartTime;

    const summary = calculateActionSummary(serviceProcessingResults, executionTimeMs);
    const imageListOutput = buildProcessedImageList(serviceProcessingResults);

    setActionOutputs(summary.allServicesFromCache, imageListOutput);
    if (shouldWriteJobSummary(actionConfig.jobSummaryMode, summary.allServicesSuccessful)) {
      createActionSummary(
        serviceProcessingResults,
        summary,
        discoveredComposeFiles,
        actionConfig.skipDigestVerification
      );
    }
    logActionCompletion(summary);
  } catch (executionError) {
    if (executionError instanceof Error) {
      core.setFailed(executionError.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action. `run` already catches and reports errors via
// `core.setFailed`, but attach a catch here too so a stray rejection
// (e.g. from a future refactor) surfaces as an action failure instead
// of an unhandled promise rejection that the runner only logs.
run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error occurred';
  core.setFailed(message);
});
