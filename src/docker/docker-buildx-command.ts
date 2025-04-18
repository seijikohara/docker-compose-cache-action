import * as core from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { getErrorMessage } from '../errors';
import { getCurrentOciPlatform } from '../platform';
import { ImageManifestParser, isMultiPlatformManifest, ManifestListEntry } from './image-manifest-parser';

/**
 * Handles Docker Buildx commands for inspecting remote image manifests
 */
export class DockerBuildxCommand {
  private readonly manifestParser: ImageManifestParser;

  /**
   * Creates a new Docker Buildx command handler
   * @param manifestParser Parser for image manifests
   */
  constructor(manifestParser: ImageManifestParser) {
    this.manifestParser = manifestParser;
  }

  /**
   * Finds a specific platform digest in manifest list
   * @param manifests List of manifests to search
   * @param platform Target platform string (os/arch/variant)
   * @returns Digest string or null if not found
   */
  private findDigestForPlatform(manifests: readonly ManifestListEntry[], platform: string): string | null {
    const [targetOs, targetArch, targetVariant] = platform.split('/');
    if (!targetOs || !targetArch) {
      core.warning(`Invalid target platform string provided for search: ${platform}`);
      return null;
    }
    const foundManifest = manifests.find((manifest) => {
      const p = manifest?.platform;
      return (
        p?.os === targetOs &&
        p?.architecture === targetArch &&
        ((!targetVariant && !p.variant) || (targetVariant && p.variant === targetVariant))
      );
    });
    return foundManifest?.digest ?? null;
  }

  /**
   * Gets the digest for a specific platform from a remote image using consistent format
   * This uses a two-step approach to get a digest compatible with the local RepoDigest format:
   * 1. First, pull image by digest using the manifest digest
   * 2. Then, inspect the pulled image to get its RepoDigest
   * This ensures the remote and local digest formats match exactly
   *
   * @param imageName Image name to inspect
   * @param platform Optional target platform, defaults to current host platform
   * @returns Digest string or null if not found/error
   */
  async getRemoteDigest(imageName: string, platform?: string): Promise<string | null> {
    const targetPlatform = platform ?? getCurrentOciPlatform();
    const platformDesc = platform ?? `default host (${targetPlatform ?? 'unknown'})`;

    if (!targetPlatform) {
      core.warning(`Could not determine valid OCI platform for ${imageName}.`);
      return null;
    }

    try {
      // First step: Get manifest digest
      const inspectArgs = ['buildx', 'imagetools', 'inspect', '--format={{json .Manifest}}', imageName];
      core.info(`Inspecting image ${imageName} manifest (targeting platform: ${platformDesc})`);
      const { exitCode, stdout, stderr } = await getExecOutput('docker', inspectArgs, {
        silent: true,
        ignoreReturnCode: true,
      });

      if (exitCode !== 0) {
        core.warning(`'docker buildx imagetools inspect' command failed for ${imageName}: ${stderr.trim()}`);
        return null;
      }
      if (!stdout.trim()) throw new Error(`Inspect command for ${imageName} returned empty output.`);

      const manifestData = this.manifestParser.parse(stdout);

      // Extract manifest digest based on platform
      let manifestDigest: string | null = null;

      if (isMultiPlatformManifest(manifestData)) {
        core.debug(`Detected manifest list for ${imageName}. Searching for platform ${targetPlatform}...`);
        manifestDigest = this.findDigestForPlatform(manifestData.manifests, targetPlatform);

        if (!manifestDigest) {
          throw new Error(`Could not extract a valid digest for platform ${platformDesc} from manifest list.`);
        }
      } else {
        // Single platform manifest case
        core.debug(`Detected single manifest digest for ${imageName}`);
        manifestDigest = manifestData.digest;
      }

      if (!manifestDigest) {
        throw new Error(`Failed to extract manifest digest for ${imageName}`);
      }

      core.debug(`Found manifest digest for ${imageName}: ${manifestDigest}`);

      // Second step: Pull a temporary image using this digest to get its RepoDigest
      // This is done by using the Docker CLI to pull just the image manifest
      // Then we can get the RepoDigest which will match what local images report
      const tempImageWithDigest = `${imageName.split(':')[0]}@${manifestDigest}`;

      // Pull just the manifest without downloading the layers (--pull=false)
      core.debug(`Pulling manifest for ${tempImageWithDigest} to get RepoDigest...`);

      const pullArgs = ['pull', '--quiet', tempImageWithDigest];
      try {
        // Pull the image by digest
        await exec('docker', pullArgs, { silent: true });

        // Now get the RepoDigest from the pulled image
        const { exitCode: inspectExitCode, stdout: inspectStdout } = await getExecOutput(
          'docker',
          ['inspect', '--format', '{{range .RepoDigests}}{{println .}}{{end}}', tempImageWithDigest],
          { silent: true, ignoreReturnCode: true }
        );

        if (inspectExitCode !== 0) {
          throw new Error(`Failed to inspect pulled image: ${tempImageWithDigest}`);
        }

        const digests = inspectStdout.trim().split('\n');
        const foundRepoDigest = digests.find((line) => line.includes('@sha256:'));

        if (foundRepoDigest) {
          const repoDigest = foundRepoDigest.split('@')[1];
          core.info(`Found remote digest (RepoDigest format) for ${imageName}: ${repoDigest}`);

          // Clean up the temporary pulled image
          await exec('docker', ['rmi', tempImageWithDigest], { silent: true, ignoreReturnCode: true });

          return repoDigest;
        } else {
          throw new Error(`Could not find RepoDigest in the pulled image: ${tempImageWithDigest}`);
        }
      } catch (pullError) {
        core.warning(`Failed to pull image by digest: ${getErrorMessage(pullError)}`);

        // Fallback to using the manifest digest directly
        core.warning(`Falling back to using manifest digest directly: ${manifestDigest}`);
        return manifestDigest;
      }
    } catch (error) {
      core.warning(
        `Failed to get remote digest for ${imageName} (platform: ${platformDesc}): ${getErrorMessage(error)}`
      );
      return null;
    }
  }
}
