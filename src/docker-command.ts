import * as core from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';

export class DockerCommand {
  async pull(image: string): Promise<void> {
    core.info(`Pulling image: ${image}`);
    // Use exec directly if output isn't needed immediately
    const exitCode = await exec('docker', ['pull', image], { ignoreReturnCode: true, silent: true });
    if (exitCode !== 0) {
      throw new Error(`Failed to pull image: ${image} (exit code: ${exitCode})`);
    }
  }

  async load(filePath: string): Promise<void> {
    const exitCode = await exec('docker', ['load', '--input', filePath], { ignoreReturnCode: true, silent: true });
    if (exitCode !== 0) {
      throw new Error(`Failed to load images from ${filePath} (exit code: ${exitCode})`);
    }
  }

  async save(filePath: string, images: readonly string[]): Promise<void> {
    if (images.length === 0) {
      core.warning('No images provided to save.');
      return;
    }
    const imageToSave = images[0];
    const args = ['save', '--output', filePath, imageToSave];
    const exitCode = await exec('docker', args, { ignoreReturnCode: true, silent: true });
    if (exitCode !== 0) {
      throw new Error(`Failed to save image ${imageToSave} to ${filePath} (exit code: ${exitCode})`);
    }
  }

  async getDigest(imageName: string): Promise<string | null> {
    try {
      const { exitCode, stdout, stderr } = await getExecOutput(
        'docker',
        // Use Go template for precise output, trim potential whitespace
        ['inspect', '--format', '{{range .RepoDigests}}{{println .}}{{end}}', imageName],
        { ignoreReturnCode: true, silent: true }
      );

      // Find the digest corresponding to the specific image name (tag might differ)
      // Example RepoDigest: myrepo/myimage@sha256:abcdef... or myimage:latest@sha256:abcdef...
      // We need the sha256 part. RepoDigests can have multiple entries if multiple tags point to the same digest.
      // A simpler approach for now might be to just grab the first valid digest found.
      const digests = stdout.trim().split('\n');
      const digestLine = digests.find((line) => line.includes('@sha256:')); // Find a line with the digest format

      if (exitCode === 0 && digestLine) {
        const digest = digestLine.split('@')[1];
        if (digest?.startsWith('sha256:')) {
          core.info(`Found RepoDigest for ${imageName}: ${digest}`);
          return digest;
        }
      }

      // Log stderr only if potentially useful (non-zero exit code or no digest found)
      if (exitCode !== 0 || !digestLine) {
        core.warning(
          `Could not retrieve a valid RepoDigest for local image ${imageName}. ExitCode: ${exitCode}, Stderr: ${stderr.trim()}`
        );
      }
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.error(`Error inspecting local image ${imageName}: ${message}`);
      return null;
    }
  }
}
