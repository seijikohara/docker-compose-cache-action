import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
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
   * Gets the digest for a specific platform from a remote image
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

      // Return appropriate digest based on manifest type
      if (isMultiPlatformManifest(manifestData)) {
        core.debug(`Detected manifest list for ${imageName}. Searching for platform ${targetPlatform}...`);
        const platformDigest = this.findDigestForPlatform(manifestData.manifests, targetPlatform);

        if (!platformDigest) {
          throw new Error(`Could not extract a valid digest for platform ${platformDesc} from manifest list.`);
        }

        return platformDigest;
      }

      // Single platform manifest case
      core.debug(`Detected single manifest digest for ${imageName}`);
      return manifestData.digest;
    } catch (error) {
      core.warning(
        `Failed to get remote digest for ${imageName} (platform: ${platformDesc}): ${getErrorMessage(error)}`
      );
      return null;
    }
  }
}
