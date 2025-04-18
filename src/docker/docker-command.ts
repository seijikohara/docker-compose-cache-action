import * as core from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { getErrorMessage } from '../errors';

/** Type guard for digest validation */
const isValidDigest = (digest: unknown): digest is string => typeof digest === 'string' && digest.startsWith('sha256:');

/**
 * Provides Docker CLI command wrappers for core Docker operations
 */
export class DockerCommand {
  /**
   * Pulls a Docker image from a registry
   * @param image Image name to pull
   * @throws Error on pull failure
   */
  async pull(image: string): Promise<void> {
    core.info(`Pulling image: ${image}`);
    const exitCode = await exec('docker', ['pull', image], {
      ignoreReturnCode: true,
      silent: true,
    });
    if (exitCode !== 0) {
      throw new Error(`Failed to pull image: ${image} (exit code: ${exitCode})`);
    }
  }

  /**
   * Loads a Docker image from a tar archive
   * @param filePath Path to the tar file
   * @throws Error on load failure
   */
  async load(filePath: string): Promise<void> {
    core.debug(`Loading image from tar: ${filePath}`);
    const exitCode = await exec('docker', ['load', '--input', filePath], {
      ignoreReturnCode: true,
      silent: true,
    });
    if (exitCode !== 0) {
      throw new Error(`Failed to load images from ${filePath} (exit code: ${exitCode})`);
    }
  }

  /**
   * Saves a Docker image to a tar archive
   * @param filePath Path to save the tar file
   * @param images List of images to save (only first one is used)
   * @throws Error on save failure
   */
  async save(filePath: string, images: readonly string[]): Promise<void> {
    if (images.length === 0) {
      core.warning('No images provided to save.');
      return;
    }
    const imageToSave = images[0];
    core.debug(`Saving image ${imageToSave} to ${filePath}`);
    const args = ['save', '--output', filePath, imageToSave];
    const exitCode = await exec('docker', args, {
      ignoreReturnCode: true,
      silent: true,
    });
    if (exitCode !== 0) {
      throw new Error(`Failed to save image ${imageToSave} to ${filePath} (exit code: ${exitCode})`);
    }
  }

  /**
   * Gets the RepoDigest (manifest digest) of a locally available Docker image
   * @param imageName Name of the image to get digest for
   * @returns Digest string (sha256:...) or null if not found or on error
   */
  async getDigest(imageName: string): Promise<string | null> {
    core.debug(`Getting digest for local image: ${imageName}`);
    try {
      const { exitCode, stdout, stderr } = await getExecOutput(
        'docker',
        ['inspect', '--format', '{{range .RepoDigests}}{{println .}}{{end}}', imageName],
        { ignoreReturnCode: true, silent: true }
      );

      // Split output by lines and find the first line containing a sha256 digest
      const digests = stdout.trim().split('\n');
      const foundRepoDigest = digests.find((line) => line.includes('@sha256:'));

      if (exitCode === 0 && foundRepoDigest) {
        // Extract only the digest part after the @ symbol
        const digest = foundRepoDigest.split('@')[1];
        if (isValidDigest(digest)) {
          core.info(`Found RepoDigest for ${imageName}: ${digest}`);
          return digest;
        }
      }

      if (exitCode !== 0 || !foundRepoDigest) {
        core.warning(
          `Could not retrieve a valid RepoDigest for local image ${imageName}. ExitCode: ${exitCode}, Stderr: ${stderr.trim()}`
        );
      }
      return null;
    } catch (error: unknown) {
      core.error(`Error inspecting local image ${imageName}: ${getErrorMessage(error)}`);
      return null;
    }
  }
}
