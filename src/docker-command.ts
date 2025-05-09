import * as core from '@actions/core';
import * as exec from '@actions/exec';

/**
 * Output information from Docker inspect command.
 *
 * This type maps the output of the docker inspect command.
 * Note that images pulled from remote repositories and images loaded via docker load
 * may have different values for RepoTags, RepoDigests, and Metadata.LastTagTime.
 */
type DockerInspectInfo = {
  // Basic information
  readonly Id: string;
  readonly RepoTags: readonly string[];
  readonly RepoDigests: readonly string[];
  readonly Parent: string;
  readonly Comment: string;
  readonly Created: string;
  readonly Container: string;

  // Metadata information
  readonly DockerVersion: string;
  readonly Author: string;

  // System information
  readonly Architecture: string;
  readonly Variant?: string;
  readonly Os: string;

  // Size information
  readonly Size: number;
  readonly VirtualSize: number;

  // Container configuration
  readonly ContainerConfig: {
    readonly Hostname: string;
    readonly Domainname: string;
    readonly User: string;
    readonly AttachStdin: boolean;
    readonly AttachStdout: boolean;
    readonly AttachStderr: boolean;
    readonly Tty: boolean;
    readonly OpenStdin: boolean;
    readonly StdinOnce: boolean;
    readonly Env?: readonly string[];
    readonly Cmd?: readonly string[];
    readonly ArgsEscaped?: boolean;
    readonly Image: string;
    readonly Volumes?: Record<string, object>;
    readonly WorkingDir: string;
    readonly Entrypoint?: readonly string[];
    readonly OnBuild?: readonly string[];
    readonly Labels?: Record<string, string>;
  };

  // Runtime configuration
  readonly Config: {
    readonly Hostname: string;
    readonly Domainname: string;
    readonly User: string;
    readonly AttachStdin: boolean;
    readonly AttachStdout: boolean;
    readonly AttachStderr: boolean;
    readonly Tty: boolean;
    readonly OpenStdin: boolean;
    readonly StdinOnce: boolean;
    readonly Env?: readonly string[];
    readonly Cmd?: readonly string[];
    readonly ArgsEscaped?: boolean;
    readonly Image: string;
    readonly Volumes?: Record<string, object>;
    readonly WorkingDir: string;
    readonly Entrypoint?: readonly string[];
    readonly OnBuild?: readonly string[];
    readonly Labels?: Record<string, string>;
  };

  // Filesystem information
  readonly GraphDriver: {
    readonly Data: {
      readonly MergedDir?: string;
      readonly UpperDir?: string;
      readonly WorkDir?: string;
      readonly LowerDir?: string;
    };
    readonly Name: string;
  };

  readonly RootFS: {
    readonly Type: string;
    readonly Layers: readonly string[];
  };

  // Additional metadata
  readonly Metadata: {
    readonly LastTagTime: string;
  };
};

/**
 * Single platform Docker image manifest.
 *
 * Represents a manifest for a single-platform Docker image.
 */
type DockerSinglePlatformManifest = {
  readonly schemaVersion: number;
  readonly mediaType: string;

  // Configuration information
  readonly config: {
    readonly mediaType: string;
    readonly digest: string;
    readonly size: number;
  };

  // Layer information
  readonly layers: readonly {
    readonly mediaType: string;
    readonly digest: string;
    readonly size: number;
  }[];

  readonly digest?: string;
};

/**
 * Multi platform Docker image manifest list.
 *
 * Represents a manifest list for a multi-platform Docker image.
 */
type DockerMultiPlatformManifest = {
  readonly schemaVersion: number;
  readonly mediaType: string;
  readonly digest: string;
  readonly size: number;

  // Manifest list
  readonly manifests: readonly {
    readonly mediaType: string;
    readonly digest: string;
    readonly size: number; // Platform information
    readonly platform?: {
      readonly architecture: string;
      readonly os: string;
      readonly variant?: string;
      readonly 'os.version'?: string;
    };

    readonly annotations?: Record<string, string>;
  }[];
};

/**
 * Union type representing either a single platform or multi platform Docker image manifest.
 */
export type DockerManifest = DockerSinglePlatformManifest | DockerMultiPlatformManifest;

/**
 * Executes a Docker command and logs execution time.
 *
 * @param command - The command to execute (e.g., 'docker').
 * @param args - Array of command arguments.
 * @param options - Execution options.
 * @returns Promise resolving to object containing exit code, stdout, and stderr.
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
 * Pulls a Docker image, optionally for a specific platform.
 *
 * @param imageName - Docker image name to pull.
 * @param platform - Optional platform string (e.g., 'linux/amd64').
 * @returns Promise resolving to boolean indicating success or failure.
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

/**
 * Inspects a remote Docker image and returns its manifest information.
 *
 * Uses 'docker buildx imagetools inspect' to retrieve detailed manifest information.
 * The returned manifest can be either a single platform manifest or a multi-platform manifest list.
 *
 * @param imageName - Docker image name with optional tag.
 * @returns Promise resolving to DockerManifest object or undefined on failure.
 */
export async function inspectImageRemote(imageName: string): Promise<DockerManifest | undefined> {
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
      core.warning(`Failed to inspect manifest for ${imageName}: ${stderr}`);
      return undefined;
    }

    try {
      // Parse the JSON output to extract the manifest
      const manifest = JSON.parse(stdout.trim()) as DockerManifest;
      return manifest;
    } catch (manifestParseError) {
      core.warning(`Failed to parse manifest JSON for ${imageName}: ${manifestParseError}`);
      return undefined;
    }
  } catch (error) {
    core.warning(`Error inspecting manifest for ${imageName}: ${error}`);
    return undefined;
  }
}

/**
 * Inspects a local Docker image and returns detailed information.
 *
 * Uses 'docker inspect' to retrieve comprehensive information about an image.
 * Contains details about the image's configuration, layers, size, architecture, etc.
 *
 * Note: Images pulled from remote repositories and images loaded via docker load
 * may have differences in the following information:
 * - RepoTags: May be empty for loaded images
 * - RepoDigests: May be empty for loaded images
 * - Metadata.LastTagTime: May be empty for loaded images
 * - GraphDriver.Data: May have different paths depending on the environment
 *
 * @param imageName - Docker image name with optional tag.
 * @returns Promise resolving to DockerInspectInfo object or undefined on failure.
 */
export async function inspectImageLocal(imageName: string): Promise<DockerInspectInfo | undefined> {
  try {
    const execOptions: exec.ExecOptions = {
      ignoreReturnCode: true,
    };

    // Execute docker inspect command to get detailed image information
    const { exitCode, stdout, stderr } = await executeDockerCommand(
      'docker',
      ['inspect', '--format', '{{json .}}', imageName],
      execOptions
    );

    if (exitCode !== 0) {
      core.warning(`Failed to inspect image ${imageName}: ${stderr}`);
      return undefined;
    }

    try {
      // Parse the JSON output to extract the image information
      const inspectInfo = JSON.parse(stdout.trim()) as DockerInspectInfo;
      return inspectInfo;
    } catch (jsonParseError) {
      core.warning(`Failed to parse inspect JSON for ${imageName}: ${jsonParseError}`);
      return undefined;
    }
  } catch (error) {
    core.warning(`Error inspecting image ${imageName}: ${error}`);
    return undefined;
  }
}

/**
 * Saves Docker image to a tar file.
 *
 * @param imageName - Docker image name to save.
 * @param outputPath - File path where the tar file should be created.
 * @returns Promise resolving to boolean indicating success or failure.
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
 * Loads Docker image from a tar file.
 *
 * @param tarPath - Path to the tar file containing the Docker image.
 * @returns Promise resolving to boolean indicating success or failure.
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
