import * as core from '@actions/core';
import { exec, getExecOutput } from '@actions/exec';
import { DockerCommand } from '../../src/docker/docker-command';

// Setup mocks
jest.mock('@actions/core');
jest.mock('@actions/exec');

describe('DockerCommand', () => {
  // Common variables for all tests
  let dockerCommand: DockerCommand;

  beforeEach(() => {
    // Create a new instance for each test
    dockerCommand = new DockerCommand();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('pull', () => {
    describe('normal cases', () => {
      it('should successfully pull an image', async () => {
        // Arrange
        const imageName = 'nginx:latest';
        (exec as jest.Mock).mockResolvedValue(0); // Success exit code

        // Act
        await dockerCommand.pull(imageName);

        // Assert
        expect(exec).toHaveBeenCalledWith(
          'docker',
          ['pull', imageName],
          expect.objectContaining({
            ignoreReturnCode: true,
            silent: true,
          })
        );
        expect(core.info).toHaveBeenCalledWith(`Pulling image: ${imageName}`);
      });
    });

    describe('error cases', () => {
      it('should throw an error when pull fails', async () => {
        // Arrange
        const imageName = 'nonexistent:image';
        const exitCode = 1;
        (exec as jest.Mock).mockResolvedValue(exitCode); // Failed exit code

        // Act & Assert
        await expect(dockerCommand.pull(imageName)).rejects.toThrow(
          `Failed to pull image: ${imageName} (exit code: ${exitCode})`
        );
        expect(exec).toHaveBeenCalledWith('docker', ['pull', imageName], expect.any(Object));
      });
    });
  });

  describe('load', () => {
    describe('normal cases', () => {
      it('should successfully load an image from tar file', async () => {
        // Arrange
        const filePath = '/path/to/image.tar';
        (exec as jest.Mock).mockResolvedValue(0); // Success exit code

        // Act
        await dockerCommand.load(filePath);

        // Assert
        expect(exec).toHaveBeenCalledWith(
          'docker',
          ['load', '--input', filePath],
          expect.objectContaining({
            ignoreReturnCode: true,
            silent: true,
          })
        );
        expect(core.debug).toHaveBeenCalledWith(`Loading image from tar: ${filePath}`);
      });
    });

    describe('error cases', () => {
      it('should throw an error when load fails', async () => {
        // Arrange
        const filePath = '/path/to/nonexistent.tar';
        const exitCode = 1;
        (exec as jest.Mock).mockResolvedValue(exitCode); // Failed exit code

        // Act & Assert
        await expect(dockerCommand.load(filePath)).rejects.toThrow(
          `Failed to load images from ${filePath} (exit code: ${exitCode})`
        );
        expect(exec).toHaveBeenCalledWith('docker', ['load', '--input', filePath], expect.any(Object));
      });
    });
  });

  describe('save', () => {
    describe('normal cases', () => {
      it('should successfully save an image to tar file', async () => {
        // Arrange
        const filePath = '/path/to/output.tar';
        const images = ['nginx:latest'];
        (exec as jest.Mock).mockResolvedValue(0); // Success exit code

        // Act
        await dockerCommand.save(filePath, images);

        // Assert
        expect(exec).toHaveBeenCalledWith(
          'docker',
          ['save', '--output', filePath, images[0]],
          expect.objectContaining({
            ignoreReturnCode: true,
            silent: true,
          })
        );
        expect(core.debug).toHaveBeenCalledWith(`Saving image ${images[0]} to ${filePath}`);
      });
    });

    describe('edge cases', () => {
      it('should not attempt to save when no images are provided', async () => {
        // Arrange
        const filePath = '/path/to/output.tar';
        const images: string[] = [];

        // Act
        await dockerCommand.save(filePath, images);

        // Assert
        expect(exec).not.toHaveBeenCalled();
        expect(core.warning).toHaveBeenCalledWith('No images provided to save.');
      });
    });

    describe('error cases', () => {
      it('should throw an error when save fails', async () => {
        // Arrange
        const filePath = '/path/to/output.tar';
        const images = ['nonexistent:image'];
        const exitCode = 1;
        (exec as jest.Mock).mockResolvedValue(exitCode); // Failed exit code

        // Act & Assert
        await expect(dockerCommand.save(filePath, images)).rejects.toThrow(
          `Failed to save image ${images[0]} to ${filePath} (exit code: ${exitCode})`
        );
        expect(exec).toHaveBeenCalledWith('docker', ['save', '--output', filePath, images[0]], expect.any(Object));
      });
    });
  });

  describe('getDigest', () => {
    describe('normal cases', () => {
      it('should successfully retrieve the digest for a valid image', async () => {
        // Arrange
        const imageName = 'nginx:latest';
        const expectedDigest = 'sha256:1234567890abcdef';
        const execOutputResult = {
          exitCode: 0,
          stdout: `example.com/nginx@${expectedDigest}\n`,
          stderr: '',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(execOutputResult);

        // Act
        const result = await dockerCommand.getDigest(imageName);

        // Assert
        expect(result).toBe(expectedDigest);
        expect(getExecOutput).toHaveBeenCalledWith(
          'docker',
          ['inspect', '--format', '{{range .RepoDigests}}{{println .}}{{end}}', imageName],
          expect.objectContaining({
            ignoreReturnCode: true,
            silent: true,
          })
        );
        expect(core.info).toHaveBeenCalledWith(`Found RepoDigest for ${imageName}: ${expectedDigest}`);
      });
    });

    describe('edge cases', () => {
      it('should return null when no RepoDigest is found', async () => {
        // Arrange
        const imageName = 'local-image:latest';
        const execOutputResult = {
          exitCode: 0,
          stdout: '', // No RepoDigest
          stderr: '',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(execOutputResult);

        // Act
        const result = await dockerCommand.getDigest(imageName);

        // Assert
        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalled();
      });

      it('should return null when the RepoDigest format is invalid', async () => {
        // Arrange
        const imageName = 'broken-image:latest';
        const execOutputResult = {
          exitCode: 0,
          stdout: 'example.com/broken-image@invalid-digest\n', // Invalid digest format
          stderr: '',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(execOutputResult);

        // Act
        const result = await dockerCommand.getDigest(imageName);

        // Assert
        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalled();
      });
    });

    describe('error cases', () => {
      it('should return null when execution fails', async () => {
        // Arrange
        const imageName = 'nonexistent:image';
        const execOutputResult = {
          exitCode: 1,
          stdout: '',
          stderr: 'Error: No such image',
        };
        (getExecOutput as jest.Mock).mockResolvedValue(execOutputResult);

        // Act
        const result = await dockerCommand.getDigest(imageName);

        // Assert
        expect(result).toBeNull();
        expect(core.warning).toHaveBeenCalled();
      });

      it('should handle exceptions gracefully', async () => {
        // Arrange
        const imageName = 'image:latest';
        const errorMessage = 'Unexpected error occurred';
        (getExecOutput as jest.Mock).mockRejectedValue(new Error(errorMessage));

        // Act
        const result = await dockerCommand.getDigest(imageName);

        // Assert
        expect(result).toBeNull();
        expect(core.error).toHaveBeenCalledWith(`Error inspecting local image ${imageName}: ${errorMessage}`);
      });
    });
  });
});
