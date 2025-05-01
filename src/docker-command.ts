import * as core from '@actions/core';
import * as exec from '@actions/exec';

/**
 * Platform information for Docker image manifest
 */
type DockerPlatform = {
  readonly architecture: string;
  readonly os: string;
  readonly variant?: string;
  readonly 'os.version'?: string;
};

/**
 * Individual manifest entry in Docker image manifest list
 */
type DockerManifestEntry = {
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;
  readonly platform?: DockerPlatform;
  readonly annotations?: Record<string, string>;
};

/**
 * Docker image manifest returned by docker buildx imagetools inspect
 */
type DockerManifest = {
  readonly schemaVersion: number;
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;
  readonly manifests: readonly DockerManifestEntry[];
};

/**
 * Gets the image digest from Docker registry
 *
 * Uses 'docker buildx imagetools inspect' to retrieve the manifest digest
 *
 * @param imageName - Docker image name with optional tag
 * @returns Promise resolving to digest string or undefined on failure
 */
export async function getImageDigest(imageName: string): Promise<string | undefined> {
  try {
    // Use accumulators to avoid mutable state
    let stdoutData = '';
    let stderrData = '';

    const options: exec.ExecOptions = {
      listeners: {
        stdout: (data: Buffer) => {
          stdoutData += data.toString();
        },
        stderr: (data: Buffer) => {
          stderrData += data.toString();
        },
      },
      ignoreReturnCode: true,
    };

    // Execute docker buildx command to inspect the image manifest
    const exitCode = await exec.exec(
      'docker',
      ['buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', imageName],
      options
    );

    if (exitCode !== 0) {
      core.warning(`Failed to get digest for ${imageName}: ${stderrData}`);
      return undefined;
    }

    try {
      // Parse the JSON output to extract the digest
      const manifest = JSON.parse(stdoutData.trim()) as DockerManifest;
      return manifest.digest || undefined;
    } catch (parseError) {
      core.warning(`Failed to parse manifest JSON for ${imageName}: ${parseError}`);
      return undefined;
    }
  } catch (error) {
    core.warning(`Error getting digest for ${imageName}: ${error}`);
    return undefined;
  }
}

/**
 * Saves Docker image to a tar file
 *
 * @param imageName - Docker image name to save
 * @param outputPath - File path where the tar file should be created
 * @returns Promise resolving to boolean indicating success or failure
 */
export async function saveImageToTar(imageName: string, outputPath: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    // Execute docker save command to create a tar archive of the image
    const exitCode = await exec.exec('docker', ['save', '-o', outputPath, imageName], options);

    if (exitCode !== 0) {
      core.warning(`Failed to save image ${imageName} to ${outputPath}`);
      return false;
    }

    return true;
  } catch (error) {
    core.warning(`Failed to save image ${imageName}: ${error}`);
    return false;
  }
}

/**
 * Loads Docker image from a tar file
 *
 * @param tarPath - Path to the tar file containing the Docker image
 * @returns Promise resolving to boolean indicating success or failure
 */
export async function loadImageFromTar(tarPath: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    // Execute docker load command to restore image from tar archive
    const exitCode = await exec.exec('docker', ['load', '-i', tarPath], options);

    if (exitCode !== 0) {
      core.warning(`Failed to load image from ${tarPath}`);
      return false;
    }

    return true;
  } catch (error) {
    core.warning(`Failed to load image from ${tarPath}: ${error}`);
    return false;
  }
}

/**
 * Pulls a Docker image, optionally for a specific platform
 *
 * @param imageName - Docker image name to pull
 * @param platform - Optional platform string (e.g., 'linux/amd64')
 * @returns Promise resolving to boolean indicating success or failure
 */
export async function pullImage(imageName: string, platform?: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    // Construct args array conditionally including platform flag if specified
    const args = platform ? ['pull', '--platform', platform, imageName] : ['pull', imageName];

    if (platform) {
      core.info(`Pulling image ${imageName} for platform ${platform}`);
    }

    // Execute docker pull command
    const exitCode = await exec.exec('docker', args, options);

    if (exitCode !== 0) {
      core.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}`);
      return false;
    }

    return true;
  } catch (error) {
    core.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}: ${error}`);
    return false;
  }
}
