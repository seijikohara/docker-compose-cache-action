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
  TimedServiceResult,
} from './action-outputs';
import { formatExecutionTime } from './date-utils';
import { getComposeFilePathsToProcess, getComposeServicesFromFiles } from './docker-compose-file';
import { processService } from './docker-compose-service-processing';

/**
 * Default cache key prefix when none is provided.
 */
const DEFAULT_CACHE_KEY_PREFIX = 'docker-compose-image';

/**
 * Configuration for action inputs.
 */
type ActionConfig = {
  readonly composeFilePaths: ReadonlyArray<string>;
  readonly excludeImageNames: ReadonlyArray<string>;
  readonly cacheKeyPrefix: string;
  readonly skipLatestCheck: boolean;
};

/**
 * Gets action configuration from GitHub Actions environment.
 */
function getActionConfig(): ActionConfig {
  return {
    composeFilePaths: core.getMultilineInput('compose-files'),
    excludeImageNames: core.getMultilineInput('exclude-images'),
    cacheKeyPrefix: core.getInput('cache-key-prefix') || DEFAULT_CACHE_KEY_PREFIX,
    skipLatestCheck: core.getBooleanInput('skip-latest-check'),
  };
}

/**
 * Main function that runs the GitHub Action.
 * Handles all orchestration, output, and error management for the action.
 */
export async function run(): Promise<void> {
  const actionStartTime = performance.now();

  try {
    const config = getActionConfig();

    const referencedComposeFiles = getComposeFilePathsToProcess(config.composeFilePaths);
    const serviceDefinitions = getComposeServicesFromFiles(referencedComposeFiles, config.excludeImageNames);

    if (serviceDefinitions.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      setActionOutputs(false, []);
      return;
    }

    core.info(`Found ${serviceDefinitions.length} services to cache`);

    // Process all services concurrently
    const processingResults: readonly TimedServiceResult[] = await Promise.all(
      serviceDefinitions.map(async (serviceDefinition) => {
        const processingStartTime = performance.now();
        const processingResult = await processService(serviceDefinition, config.cacheKeyPrefix, config.skipLatestCheck);
        const processingEndTime = performance.now();

        return {
          ...processingResult,
          processingDuration: processingEndTime - processingStartTime,
          humanReadableDuration: formatExecutionTime(processingStartTime, processingEndTime),
        };
      })
    );

    const actionEndTime = performance.now();
    const executionTimeMs = actionEndTime - actionStartTime;

    const summary = calculateActionSummary(processingResults, executionTimeMs);
    const imageListOutput = buildProcessedImageList(processingResults);

    setActionOutputs(summary.allServicesFromCache, imageListOutput);
    createActionSummary(processingResults, summary, referencedComposeFiles, config.skipLatestCheck);
    logActionCompletion(summary);
  } catch (actionError) {
    if (actionError instanceof Error) {
      core.setFailed(actionError.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action
run();
