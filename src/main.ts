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
import { formatTimeBetween } from './date-utils';
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
    const actionConfig = getActionConfig();

    const discoveredComposeFiles = getComposeFilePathsToProcess(actionConfig.composeFilePaths);
    const targetServices = getComposeServicesFromFiles(discoveredComposeFiles, actionConfig.excludeImageNames);

    if (targetServices.length === 0) {
      core.info('No Docker services found in compose files or all services were excluded');
      setActionOutputs(false, []);
      return;
    }

    core.info(`Found ${targetServices.length} services to cache`);

    // Process all services concurrently
    const serviceProcessingResults: readonly TimedServiceResult[] = await Promise.all(
      targetServices.map(async (currentService) => {
        const serviceStartTime = performance.now();
        const serviceResult = await processService(
          currentService,
          actionConfig.cacheKeyPrefix,
          actionConfig.skipLatestCheck
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
    createActionSummary(serviceProcessingResults, summary, discoveredComposeFiles, actionConfig.skipLatestCheck);
    logActionCompletion(summary);
  } catch (executionError) {
    if (executionError instanceof Error) {
      core.setFailed(executionError.message);
    } else {
      core.setFailed('Unknown error occurred');
    }
  }
}

// Execute the action
run();
