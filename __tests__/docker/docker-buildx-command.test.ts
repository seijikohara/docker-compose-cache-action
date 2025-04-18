import * as core from '@actions/core';
import { getExecOutput } from '@actions/exec';
import { DockerBuildxCommand } from '../../src/docker/docker-buildx-command';
import {
  ImageManifestParser,
  MultiPlatformImageManifest,
  SinglePlatformImageManifest,
} from '../../src/docker/image-manifest-parser';
import * as platform from '../../src/platform';

// Setup mocks
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../../src/platform');

describe('DockerBuildxCommand', () => {
  let dockerBuildxCommand: DockerBuildxCommand;
  let mockManifestParser: ImageManifestParser;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock for ImageManifestParser
    mockManifestParser = {
      parse: jest.fn(),
    } as unknown as ImageManifestParser;

    // Create instance with mocked dependencies
    dockerBuildxCommand = new DockerBuildxCommand(mockManifestParser);

    // Setup default platform mock
    (platform.getCurrentOciPlatform as jest.Mock).mockReturnValue('linux/amd64');
  });

  describe('getRemoteDigest', () => {
    describe('normal cases', () => {
      it('should return digest for single-platform image', async () => {
        const imageName = 'nginx:latest';
        const expectedDigest = 'sha256:1234567890abcdef';

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify({
            mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
            digest: expectedDigest,
          }),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: expectedDigest,
        } as SinglePlatformImageManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBe(expectedDigest);
        expect(getExecOutput).toHaveBeenCalledWith(
          'docker',
          ['buildx', 'imagetools', 'inspect', '--format={{json .Manifest}}', imageName],
          expect.objectContaining({
            silent: true,
            ignoreReturnCode: true,
          })
        );
        expect(core.info).toHaveBeenCalledWith(
          `Inspecting image ${imageName} manifest (targeting platform: default host (linux/amd64))`
        );
      });

      it('should return digest for multi-platform image with specified platform', async () => {
        const imageName = 'nginx:latest';
        const specifiedPlatform = 'linux/arm64';
        const expectedDigest = 'sha256:5678abcd1234efgh';

        const multiPlatformManifest: MultiPlatformImageManifest = {
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:1234567890abcdef',
              platform: { os: 'linux', architecture: 'amd64' },
            },
            {
              digest: expectedDigest,
              platform: { os: 'linux', architecture: 'arm64' },
            },
          ],
        };

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify(multiPlatformManifest),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue(multiPlatformManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName, specifiedPlatform);

        expect(result).toBe(expectedDigest);
        expect(core.info).toHaveBeenCalledWith(
          `Inspecting image ${imageName} manifest (targeting platform: ${specifiedPlatform})`
        );
        expect(core.debug).toHaveBeenCalledWith(
          `Detected manifest list for ${imageName}. Searching for platform ${specifiedPlatform}...`
        );
      });
    });

    describe('edge cases', () => {
      it('should use host platform when no platform is specified', async () => {
        const imageName = 'nginx:latest';
        const hostPlatform = 'linux/amd64';
        const expectedDigest = 'sha256:1234567890abcdef';

        (platform.getCurrentOciPlatform as jest.Mock).mockReturnValue(hostPlatform);

        const singlePlatformManifest: SinglePlatformImageManifest = {
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: expectedDigest,
        };

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify(singlePlatformManifest),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue(singlePlatformManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBe(expectedDigest);
        expect(platform.getCurrentOciPlatform).toHaveBeenCalledTimes(1);
      });

      it('should handle platform with variant correctly', async () => {
        const imageName = 'arm32v7/nginx:latest';
        const specifiedPlatform = 'linux/arm/v7';
        const expectedDigest = 'sha256:armv7digest';

        const multiPlatformManifest: MultiPlatformImageManifest = {
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:amd64digest',
              platform: { os: 'linux', architecture: 'amd64' },
            },
            {
              digest: expectedDigest,
              platform: { os: 'linux', architecture: 'arm', variant: 'v7' },
            },
          ],
        };

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify(multiPlatformManifest),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue(multiPlatformManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName, specifiedPlatform);

        expect(result).toBe(expectedDigest);
      });
    });

    describe('error cases', () => {
      it('should return null when platform cannot be determined', async () => {
        const imageName = 'nginx:latest';
        (platform.getCurrentOciPlatform as jest.Mock).mockReturnValue(null);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(`Could not determine valid OCI platform for ${imageName}.`);
      });

      it('should return null when command execution fails', async () => {
        const imageName = 'nonexistent:image';
        const mockExecResult = {
          exitCode: 1,
          stdout: '',
          stderr: 'Error: manifest unknown',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('command failed for'));
      });

      it('should return null when empty output is received', async () => {
        const imageName = 'nginx:latest';
        const mockExecResult = {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(`Failed to get remote digest for ${imageName}`)
        );
      });

      it('should return null when platform is not found in manifest list', async () => {
        const imageName = 'multi-arch:image';
        const specifiedPlatform = 'linux/s390x';

        const multiPlatformManifest: MultiPlatformImageManifest = {
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:amd64digest',
              platform: { os: 'linux', architecture: 'amd64' },
            },
            {
              digest: 'sha256:arm64digest',
              platform: { os: 'linux', architecture: 'arm64' },
            },
          ],
        };

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify(multiPlatformManifest),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue(multiPlatformManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName, specifiedPlatform);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(`Failed to get remote digest for ${imageName}`)
        );
      });

      it('should handle parsing errors', async () => {
        const imageName = 'nginx:latest';
        const mockExecResult = {
          exitCode: 0,
          stdout: 'not-json-content',
          stderr: '',
        };

        const parseError = new Error('JSON parsing failed');
        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockImplementation(() => {
          throw parseError;
        });

        const result = await dockerBuildxCommand.getRemoteDigest(imageName);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(
          expect.stringContaining(`Failed to get remote digest for ${imageName}`)
        );
      });

      it('should handle invalid platform string', async () => {
        const imageName = 'nginx:latest';
        const invalidPlatform = 'invalid-platform';

        const multiPlatformManifest: MultiPlatformImageManifest = {
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:amd64digest',
              platform: { os: 'linux', architecture: 'amd64' },
            },
          ],
        };

        const mockExecResult = {
          exitCode: 0,
          stdout: JSON.stringify(multiPlatformManifest),
          stderr: '',
        };

        (getExecOutput as jest.Mock).mockResolvedValue(mockExecResult);
        (mockManifestParser.parse as jest.Mock).mockReturnValue(multiPlatformManifest);

        const result = await dockerBuildxCommand.getRemoteDigest(imageName, invalidPlatform);

        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalledWith(
          `Invalid target platform string provided for search: ${invalidPlatform}`
        );
      });
    });
  });
});
