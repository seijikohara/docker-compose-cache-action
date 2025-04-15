import * as core from '@actions/core';
import * as exec from '@actions/exec';

export class SkopeoInstaller {
  private isInstalled = false; // Track installation status per instance

  async ensureInstalled(): Promise<void> {
    if (this.isInstalled) {
      return;
    } // Skip if already installed in this run

    core.info('Checking and installing skopeo if necessary...');
    try {
      // Using getExecOutput to check existence silently first might be an option,
      // but apt-get install is idempotent, so running it is generally safe.
      await exec.exec('sudo', ['apt-get', 'update', '-y'], { ignoreReturnCode: true, silent: true });
      await exec.exec('sudo', ['apt-get', 'install', '-y', 'skopeo'], { silent: true });
      await exec.exec('skopeo', ['--version'], { silent: true }); // Verify
      core.info('Skopeo installed or already present.');
      this.isInstalled = true; // Mark as installed for this instance
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      core.error(`Failed to install or verify skopeo: ${message}`);
      throw new Error(`Skopeo installation failed.`);
    }
  }
}
