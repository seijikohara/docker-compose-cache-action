import * as core from '@actions/core';
import * as exec from '@actions/exec'; // Import original for types
import { DockerCommand } from '../src/docker-command';

// Mock dependent modules
jest.mock('@actions/core');
jest.mock('@actions/exec', () => ({
  exec: jest.fn(), // Mock the exec function
  getExecOutput: jest.fn(), // Mock the getExecOutput function
}));

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;
// Get typed mocks for the exec functions directly
const mockedExec = exec.exec as jest.Mock;
const mockedGetExecOutput = exec.getExecOutput as jest.Mock;

describe('DockerCommand', () => {
  let dockerCommand: DockerCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    dockerCommand = new DockerCommand(); // Create new instance for each test
  });

  describe('pull', () => {
    const imageName = 'test/image:latest';

    test('should execute docker pull successfully', async () => {
      // Arrange
      mockedExec.mockResolvedValue(0); // Simulate successful execution

      // Act
      await dockerCommand.pull(imageName);

      // Assert
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(mockedExec).toHaveBeenCalledWith('docker', ['pull', imageName], { ignoreReturnCode: true, silent: true });
      expect(coreMock.info).toHaveBeenCalledWith(`Pulling image: ${imageName}`);
    });

    test('should throw error if docker pull fails', async () => {
      // Arrange
      const exitCode = 1;
      mockedExec.mockResolvedValue(exitCode); // Simulate failed execution

      // Act & Assert
      await expect(dockerCommand.pull(imageName)).rejects.toThrow(
        `Failed to pull image: ${imageName} (exit code: ${exitCode})`
      );
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(coreMock.info).toHaveBeenCalledWith(`Pulling image: ${imageName}`);
    });
  });

  describe('load', () => {
    const filePath = '/tmp/image.tar';

    test('should execute docker load successfully', async () => {
      // Arrange
      mockedExec.mockResolvedValue(0);

      // Act
      await dockerCommand.load(filePath);

      // Assert
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(mockedExec).toHaveBeenCalledWith('docker', ['load', '--input', filePath], {
        ignoreReturnCode: true,
        silent: true,
      });
    });

    test('should throw error if docker load fails', async () => {
      // Arrange
      const exitCode = 1;
      mockedExec.mockResolvedValue(exitCode);

      // Act & Assert
      await expect(dockerCommand.load(filePath)).rejects.toThrow(
        `Failed to load images from ${filePath} (exit code: ${exitCode})`
      );
      expect(mockedExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('save', () => {
    const filePath = '/tmp/image-save.tar';
    const images = ['image-to-save:v1'];

    test('should execute docker save successfully', async () => {
      // Arrange
      mockedExec.mockResolvedValue(0);

      // Act
      await dockerCommand.save(filePath, images);

      // Assert
      expect(mockedExec).toHaveBeenCalledTimes(1);
      expect(mockedExec).toHaveBeenCalledWith('docker', ['save', '--output', filePath, images[0]], {
        ignoreReturnCode: true,
        silent: true,
      });
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should log warning and return if images array is empty', async () => {
      // Arrange
      const emptyImages: string[] = [];

      // Act
      await dockerCommand.save(filePath, emptyImages);

      // Assert
      expect(mockedExec).not.toHaveBeenCalled();
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith('No images provided to save.');
    });

    test('should throw error if docker save fails', async () => {
      // Arrange
      const exitCode = 1;
      mockedExec.mockResolvedValue(exitCode);

      // Act & Assert
      await expect(dockerCommand.save(filePath, images)).rejects.toThrow(
        `Failed to save image ${images[0]} to ${filePath} (exit code: ${exitCode})`
      );
      expect(mockedExec).toHaveBeenCalledTimes(1);
    });
  });

  describe('getDigest', () => {
    const imageName = 'my/repo/image:tag';
    const expectedDigest = 'sha256:abcdef123456';
    const repoDigestLine = `my/repo/image@${expectedDigest}`;

    test('should return digest if RepoDigest exists', async () => {
      // Arrange
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: `${repoDigestLine}\n`, stderr: '' });

      // Act
      const digest = await dockerCommand.getDigest(imageName);

      // Assert
      expect(digest).toBe(expectedDigest);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledWith(
        'docker',
        ['inspect', '--format', '{{range .RepoDigests}}{{println .}}{{end}}', imageName],
        { ignoreReturnCode: true, silent: true }
      );
      expect(coreMock.info).toHaveBeenCalledWith(`Found RepoDigest for ${imageName}: ${expectedDigest}`);
      expect(coreMock.warning).not.toHaveBeenCalled();
      expect(coreMock.error).not.toHaveBeenCalled();
    });

    test('should return null and log warning if RepoDigest is empty', async () => {
      // Arrange
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: '\n   \n', stderr: '' }); // Empty or whitespace stdout

      // Act
      const digest = await dockerCommand.getDigest(imageName);

      // Assert
      expect(digest).toBeNull();
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Could not retrieve a valid RepoDigest for local image ${imageName}`)
      );
      expect(coreMock.info).not.toHaveBeenCalled(); // No digest found log
    });

    test('should return null and log warning if RepoDigest format is invalid', async () => {
      // Arrange
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: 'my/repo/image:tag\n', stderr: '' }); // No @sha256:

      // Act
      const digest = await dockerCommand.getDigest(imageName);

      // Assert
      expect(digest).toBeNull();
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Could not retrieve a valid RepoDigest for local image ${imageName}`)
      );
    });

    test('should return null and log warning if docker inspect fails', async () => {
      // Arrange
      const stderr = 'Error: No such object: image:tag';
      mockedGetExecOutput.mockResolvedValue({ exitCode: 1, stdout: '', stderr: stderr });

      // Act
      const digest = await dockerCommand.getDigest(imageName);

      // Assert
      expect(digest).toBeNull();
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Could not retrieve a valid RepoDigest for local image ${imageName}. ExitCode: 1, Stderr: ${stderr}`
        )
      );
    });

    test('should return null and log error if getExecOutput throws error', async () => {
      // Arrange
      const errorMessage = 'Command failed';
      mockedGetExecOutput.mockRejectedValue(new Error(errorMessage));

      // Act
      const digest = await dockerCommand.getDigest(imageName);

      // Assert
      expect(digest).toBeNull();
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.error).toHaveBeenCalledWith(`Error inspecting local image ${imageName}: ${errorMessage}`);
      expect(coreMock.warning).not.toHaveBeenCalled(); // Should log error, not warning
    });
  });
});
