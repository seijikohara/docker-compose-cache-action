import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { SkopeoInstaller } from './skopeo-installer';
import { getErrorMessage } from './utils';

export class RemoteRegistryClient {
  private readonly skopeoInstaller: SkopeoInstaller;

  constructor(skopeoInstaller: SkopeoInstaller) {
    this.skopeoInstaller = skopeoInstaller;
  }

  async getRemoteDigest(imageName: string): Promise<string | null> {
    try {
      // Move ensureInstalled inside the try block
      await this.skopeoInstaller.ensureInstalled();

      const { exitCode, stdout, stderr } = await getExecOutput('skopeo', ['inspect', `docker://${imageName}`], {
        ignoreReturnCode: true,
        silent: true,
      });

      if (exitCode !== 0) {
        // Log warning here, but let the catch block handle returning null if needed?
        // Or return null directly. Returning null here is clearer.
        core.warning(`skopeo inspect failed for ${imageName}: ${stderr.trim()}`);
        return null;
      }

      const inspectData: unknown = JSON.parse(stdout);

      if (
        typeof inspectData === 'object' &&
        inspectData !== null &&
        'Digest' in inspectData &&
        typeof inspectData.Digest === 'string' &&
        inspectData.Digest.startsWith('sha256:')
      ) {
        return inspectData.Digest;
      } else {
        // Throw error to be caught below
        throw new Error('Digest not found or invalid in skopeo inspect output.');
      }
    } catch (error) {
      // Catch errors from ensureInstalled, getExecOutput, JSON.parse, or the explicit throw
      core.warning(`Failed to get remote digest for ${imageName}: ${getErrorMessage(error)}`);
      return null;
    }
  }
}
