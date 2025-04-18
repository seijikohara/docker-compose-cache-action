import * as core from '@actions/core';
import { ActionRunner } from './action-runner';
import { CacheManager } from './cache-manager';
import { DockerBuildxCommand } from './docker/docker-buildx-command';
import { DockerCommand } from './docker/docker-command';
import { ImageManifestParser } from './docker/image-manifest-parser';

/**
 * Main entry point for the Docker Compose Cache Action.
 * Sets up the dependency graph and executes the workflow.
 *
 * @returns Promise that resolves when the action completes
 */
export async function main(): Promise<void> {
  try {
    // Instantiate dependencies with proper injection
    const dockerCommand = new DockerCommand();
    const cacheManager = new CacheManager();
    const manifestParser = new ImageManifestParser();
    const dockerBuildxCommand = new DockerBuildxCommand(manifestParser);

    // Execute the action workflow
    const runner = new ActionRunner(dockerCommand, cacheManager, dockerBuildxCommand);
    await runner.run();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    core.setFailed(message);
  }
}

// Execute main function unless being imported for testing
if (require.main === module) {
  void main();
}
