import { actionCore, actionExec } from './actions-wrapper';

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
 * @param imageName - Docker image name to check
 * @returns Image digest string or null if not found
 */
export async function getImageDigest(imageName: string): Promise<string | null> {
  try {
    // Use accumulators to avoid mutable state
    let stdoutData = '';
    let stderrData = '';

    const options = {
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

    const exitCode = await actionExec.exec(
      'docker',
      ['buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', imageName],
      options
    );

    if (exitCode !== 0) {
      actionCore.warning(`Failed to get digest for ${imageName}: ${stderrData}`);
      return null;
    }

    try {
      const manifest = JSON.parse(stdoutData.trim()) as DockerManifest;
      return manifest.digest || null;
    } catch (parseError) {
      actionCore.warning(`Failed to parse manifest JSON for ${imageName}: ${parseError}`);
      return null;
    }
  } catch (error) {
    actionCore.warning(`Error getting digest for ${imageName}: ${error}`);
    return null;
  }
}

/**
 * Saves Docker image to a tar file
 * @param imageName - Docker image name to save
 * @param outputPath - Path to save the tar file
 * @returns True if successful, false otherwise
 */
export async function saveImageToTar(imageName: string, outputPath: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    const exitCode = await actionExec.exec('docker', ['save', '-o', outputPath, imageName], options);

    if (exitCode !== 0) {
      actionCore.warning(`Failed to save image ${imageName} to ${outputPath}`);
      return false;
    }

    return true;
  } catch (error) {
    actionCore.warning(`Failed to save image ${imageName}: ${error}`);
    return false;
  }
}

/**
 * Loads Docker image from a tar file
 * @param tarPath - Path to the tar file containing the image
 * @returns True if successful, false otherwise
 */
export async function loadImageFromTar(tarPath: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    const exitCode = await actionExec.exec('docker', ['load', '-i', tarPath], options);

    if (exitCode !== 0) {
      actionCore.warning(`Failed to load image from ${tarPath}`);
      return false;
    }

    return true;
  } catch (error) {
    actionCore.warning(`Failed to load image from ${tarPath}: ${error}`);
    return false;
  }
}

/**
 * Pulls a Docker image
 * @param imageName - Docker image name to pull
 * @param platform - Optional platform to pull for (e.g. 'linux/amd64', 'linux/arm64')
 * @returns True if successful, false otherwise
 */
export async function pullImage(imageName: string, platform?: string): Promise<boolean> {
  try {
    const options = { ignoreReturnCode: true };
    // Construct args array immutably
    const args = platform ? ['pull', '--platform', platform, imageName] : ['pull', imageName];

    if (platform) {
      actionCore.info(`Pulling image ${imageName} for platform ${platform}`);
    }

    const exitCode = await actionExec.exec('docker', args, options);

    if (exitCode !== 0) {
      actionCore.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}`);
      return false;
    }

    return true;
  } catch (error) {
    actionCore.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}: ${error}`);
    return false;
  }
}
