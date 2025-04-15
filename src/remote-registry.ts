import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { SkopeoInstaller } from './skopeo-installer';
import { getErrorMessage } from './utils';

// Helper to parse platform string like "os/arch[/variant]"
const parsePlatform = (platformString: string): { os?: string; arch?: string; variant?: string } => {
  const [os, arch, variant] = platformString.split('/');
  return { os, arch, variant };
};

export class RemoteRegistryClient {
  private readonly skopeoInstaller: SkopeoInstaller;

  constructor(skopeoInstaller: SkopeoInstaller) {
    this.skopeoInstaller = skopeoInstaller;
  }

  /**
   * Fetches the manifest digest for a specific image tag and platform from a remote registry.
   * @param imageName - The full image name including tag (e.g., "nginx:stable-alpine").
   * @param platform - Optional platform string (e.g., "linux/amd64").
   * @returns The sha256 digest string if successful, otherwise null.
   */
  async getRemoteDigest(imageName: string, platform?: string): Promise<string | null> {
    const platformDesc = platform ?? 'default host';
    try {
      await this.skopeoInstaller.ensureInstalled();

      // Build skopeo arguments, adding platform overrides if specified
      const baseArgs = ['inspect'];
      const platformArgs = platform
        ? (() => {
            const { os, arch, variant } = parsePlatform(platform);
            const args: string[] = [];
            // Skopeo uses specific override flags
            if (os) args.push('--override-os', os);
            if (arch) args.push('--override-arch', arch);
            if (variant) args.push('--override-variant', variant);
            core.info(`Inspecting image ${imageName} for platform ${platform}`);
            return args;
          })()
        : [];

      if (!platform) {
        core.info(`Inspecting image ${imageName} for default platform`);
      }

      const inspectArgs = [...baseArgs, ...platformArgs, `docker://${imageName}`];

      // Execute skopeo inspect
      const { exitCode, stdout, stderr } = await getExecOutput('skopeo', inspectArgs, {
        ignoreReturnCode: true, // Handle non-zero exit codes manually
        silent: true, // Reduce log verbosity
      });

      if (exitCode !== 0) {
        core.warning(`skopeo inspect failed for ${imageName} (platform: ${platformDesc}): ${stderr.trim()}`);
        return null;
      }

      // Parse the output and extract the digest
      const inspectData: unknown = JSON.parse(stdout);

      // Type guard to safely access the Digest property
      if (
        typeof inspectData === 'object' &&
        inspectData !== null &&
        'Digest' in inspectData &&
        typeof inspectData.Digest === 'string' &&
        inspectData.Digest.startsWith('sha256:')
      ) {
        return inspectData.Digest; // Return the valid digest
      } else {
        // Throw an error if digest is not found or invalid
        core.debug(`Inspect data for ${imageName} (platform: ${platformDesc}): ${JSON.stringify(inspectData)}`);
        throw new Error('Digest not found or invalid in skopeo inspect output.');
      }
    } catch (error) {
      // Catch any error (install, exec, parse, validation) and log warning
      core.warning(
        `Failed to get remote digest for ${imageName} (platform: ${platformDesc}): ${getErrorMessage(error)}`
      );
      return null; // Return null on any failure
    }
  }
}
