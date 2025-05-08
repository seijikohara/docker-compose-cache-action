import * as core from '@actions/core';
import * as exec from '@actions/exec';

/**
 * Platform information for Docker image manifest
 */
type DockerPlatform = {
  readonly architecture: string;
  readonly os: string;
  readonly variant: string | undefined;
  readonly 'os.version': string | undefined;
};

/**
 * Individual manifest entry in Docker image manifest list
 */
type DockerManifestEntry = {
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;
  readonly platform: DockerPlatform | undefined;
  readonly annotations: Record<string, string> | undefined;
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
 * Executes a Docker command and logs execution time
 *
 * @param command - The command to execute (e.g., 'docker')
 * @param args - Array of command arguments
 * @param options - Execution options
 * @returns Promise resolving to object containing exit code, stdout, and stderr
 */
async function executeDockerCommand(
  command: string,
  args: string[],
  options: exec.ExecOptions
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  // Format command for logging
  const fullCommand = `${command} ${args.join(' ')}`;

  // Log command execution
  core.info(`Executing: ${fullCommand}`);

  // Record start time
  const startTime = performance.now();

  // Initialize stdout and stderr capture as arrays
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  // Create a new options object with our stdout/stderr listeners
  const execOptionsWithCapture: exec.ExecOptions = {
    ...options,
    listeners: {
      ...options.listeners,
      stdout: (data: Buffer) => {
        const text = data.toString();
        stdoutChunks.push(text);
        // If the original options had a stdout listener, call it
        if (options.listeners?.stdout) {
          options.listeners.stdout(data);
        }
      },
      stderr: (data: Buffer) => {
        const text = data.toString();
        stderrChunks.push(text);
        // If the original options had a stderr listener, call it
        if (options.listeners?.stderr) {
          options.listeners.stderr(data);
        }
      },
    },
  };

  try {
    // Execute the command
    const exitCode = await exec.exec(command, args, execOptionsWithCapture);

    // Calculate and log execution time
    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);
    core.info(`Command completed in ${executionTimeMs}ms: ${fullCommand}`);

    // Join all chunks to create the complete output strings
    const stdout = stdoutChunks.join('');
    const stderr = stderrChunks.join('');

    return { exitCode, stdout, stderr };
  } catch (error) {
    // Log execution failure
    const endTime = performance.now();
    const executionTimeMs = Math.round(endTime - startTime);
    core.error(`Command failed after ${executionTimeMs}ms: ${fullCommand}`);
    throw error;
  }
}

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
    const execOptions: exec.ExecOptions = {
      ignoreReturnCode: true,
    };

    // Execute docker buildx command to inspect the image manifest
    const { exitCode, stdout, stderr } = await executeDockerCommand(
      'docker',
      ['buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', imageName],
      execOptions
    );

    if (exitCode !== 0) {
      core.warning(`Failed to get digest for ${imageName}: ${stderr}`);
      return undefined;
    }

    try {
      // Parse the JSON output to extract the digest
      const manifest = JSON.parse(stdout.trim()) as DockerManifest;
      return manifest.digest || undefined;
    } catch (manifestParseError) {
      core.warning(`Failed to parse manifest JSON for ${imageName}: ${manifestParseError}`);
      return undefined;
    }
  } catch (error) {
    core.warning(`Error getting digest for ${imageName}: ${error}`);
    return undefined;
  }
}

/**
 * Gets the image size in bytes
 *
 * @param imageName - Docker image name with optional tag
 * @returns Promise resolving to image size in bytes or undefined on failure
 */
export async function getImageSize(imageName: string): Promise<number | undefined> {
  try {
    const execOptions: exec.ExecOptions = {
      ignoreReturnCode: true,
    };

    // Execute docker image inspect command to get size information
    const { exitCode, stdout, stderr } = await executeDockerCommand(
      'docker',
      ['image', 'inspect', '--format', '{{.Size}}', imageName],
      execOptions
    );

    if (exitCode !== 0) {
      core.warning(`Failed to get size for ${imageName}: ${stderr}`);
      return undefined;
    }

    // Parse the output to get size in bytes
    const size = parseInt(stdout.trim(), 10);
    if (isNaN(size)) {
      core.warning(`Failed to parse image size for ${imageName}: invalid number`);
      return undefined;
    }

    return size;
  } catch (error) {
    core.warning(`Error getting size for ${imageName}: ${error}`);
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
    const execOptions = { ignoreReturnCode: true };
    // Execute docker save command to create a tar archive of the image
    const { exitCode, stderr } = await executeDockerCommand(
      'docker',
      ['save', '-o', outputPath, imageName],
      execOptions
    );

    if (exitCode !== 0) {
      core.warning(`Failed to save image ${imageName} to ${outputPath}: ${stderr}`);
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
    const execOptions = { ignoreReturnCode: true };
    // Execute docker load command to restore image from tar archive
    const { exitCode, stderr } = await executeDockerCommand('docker', ['load', '-i', tarPath], execOptions);

    if (exitCode !== 0) {
      core.warning(`Failed to load image from ${tarPath}: ${stderr}`);
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
export async function pullImage(imageName: string, platform: string | undefined): Promise<boolean> {
  try {
    const execOptions = { ignoreReturnCode: true };
    // Construct args array conditionally including platform flag if specified
    const dockerCommandArguments = platform ? ['pull', '--platform', platform, imageName] : ['pull', imageName];

    if (platform) {
      core.info(`Pulling image ${imageName} for platform ${platform}`);
    }

    // Execute docker pull command
    const { exitCode, stderr } = await executeDockerCommand('docker', dockerCommandArguments, execOptions);

    if (exitCode !== 0) {
      core.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}: ${stderr}`);
      return false;
    }

    return true;
  } catch (error) {
    core.warning(`Failed to pull image ${imageName}${platform ? ` for platform ${platform}` : ''}: ${error}`);
    return false;
  }
}
