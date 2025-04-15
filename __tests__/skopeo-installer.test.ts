import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { SkopeoInstaller } from '../src/skopeo-installer';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/exec');

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;
const mockedExec = exec.exec as jest.Mock;

describe('SkopeoInstaller', () => {
  let installer: SkopeoInstaller;

  beforeEach(() => {
    jest.clearAllMocks();
    installer = new SkopeoInstaller(); // Creates a fresh instance with isInstalled = false
    // The problematic reset line below is removed
    // (SkopeoInstaller as any).isInstalled = false;
  });

  test('should run install commands successfully on first call', async () => {
    // Arrange
    mockedExec.mockResolvedValue(0);

    // Act
    await installer.ensureInstalled();

    // Assert
    expect(coreMock.info).toHaveBeenCalledWith('Checking and installing skopeo if necessary...');
    expect(mockedExec).toHaveBeenCalledTimes(3);
    expect(mockedExec).toHaveBeenCalledWith('sudo', ['apt-get', 'update', '-y'], {
      ignoreReturnCode: true,
      silent: true,
    });
    expect(mockedExec).toHaveBeenCalledWith('sudo', ['apt-get', 'install', '-y', 'skopeo'], { silent: true });
    expect(mockedExec).toHaveBeenCalledWith('skopeo', ['--version'], { silent: true });
    expect(coreMock.info).toHaveBeenCalledWith('Skopeo installed or already present.');
    expect(coreMock.error).not.toHaveBeenCalled();
  });

  test('should not run install commands on second call', async () => {
    // Arrange
    mockedExec.mockResolvedValue(0);
    // First call to set internal state of the 'installer' instance
    await installer.ensureInstalled();
    // Clear mocks to check calls only for the second invocation on the SAME instance
    jest.clearAllMocks();

    // Act
    await installer.ensureInstalled(); // Call again on the same instance

    // Assert
    expect(coreMock.info).not.toHaveBeenCalledWith('Checking and installing skopeo if necessary...');
    expect(mockedExec).not.toHaveBeenCalled();
    expect(coreMock.error).not.toHaveBeenCalled();
  });

  test('should still succeed even if apt-get update fails', async () => {
    // Arrange
    mockedExec
      .mockResolvedValueOnce(1) // Simulate apt-get update failure
      .mockResolvedValue(0); // Simulate subsequent success

    // Act
    await installer.ensureInstalled();

    // Assert
    expect(coreMock.info).toHaveBeenCalledWith('Checking and installing skopeo if necessary...');
    expect(mockedExec).toHaveBeenCalledTimes(3);
    expect(coreMock.info).toHaveBeenCalledWith('Skopeo installed or already present.');
    expect(coreMock.error).not.toHaveBeenCalled();
  });

  test('should throw error and log core.error if apt-get install fails', async () => {
    // Arrange
    const installError = new Error('apt install failed');
    mockedExec
      .mockResolvedValueOnce(0) // update succeeds
      .mockRejectedValueOnce(installError); // install fails

    // Act & Assert
    await expect(installer.ensureInstalled()).rejects.toThrow('Skopeo installation failed.');
    expect(coreMock.info).toHaveBeenCalledWith('Checking and installing skopeo if necessary...');
    expect(mockedExec).toHaveBeenCalledTimes(2);
    expect(mockedExec).not.toHaveBeenCalledWith('skopeo', ['--version'], expect.any(Object));
    expect(coreMock.error).toHaveBeenCalledTimes(1);
    expect(coreMock.error).toHaveBeenCalledWith(`Failed to install or verify skopeo: ${installError.message}`);
  });

  test('should throw error and log core.error if skopeo --version fails', async () => {
    // Arrange
    const versionError = new Error('skopeo command failed');
    mockedExec
      .mockResolvedValueOnce(0) // update succeeds
      .mockResolvedValueOnce(0) // install succeeds
      .mockRejectedValueOnce(versionError); // version check fails

    // Act & Assert
    await expect(installer.ensureInstalled()).rejects.toThrow('Skopeo installation failed.');
    expect(coreMock.info).toHaveBeenCalledWith('Checking and installing skopeo if necessary...');
    expect(mockedExec).toHaveBeenCalledTimes(3);
    expect(coreMock.error).toHaveBeenCalledTimes(1);
    expect(coreMock.error).toHaveBeenCalledWith(`Failed to install or verify skopeo: ${versionError.message}`);
    expect(coreMock.info).not.toHaveBeenCalledWith('Skopeo installed or already present.');
  });
});
