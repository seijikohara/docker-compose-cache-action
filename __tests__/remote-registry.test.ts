import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { SkopeoInstaller } from '../src/skopeo-installer';
import { RemoteRegistryClient } from '../src/remote-registry';
// utils are not mocked

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../src/skopeo-installer');
// **** Add fs mock using requireActual ****
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    // Override functions only if this test file *directly* uses them
    // For now, RemoteRegistryClient doesn't directly use fs,
    // so we only need to ensure the structure (like promises, constants) exists.
    // If core/exec mocks needed specific fs mocks, they'd go here.
    // For safety, let's mock existsSync as it's often used indirectly.
    existsSync: jest.fn().mockReturnValue(true),
    promises: {
      ...originalFs.promises,
      access: jest.fn().mockResolvedValue(undefined), // Mock for @actions/io via @actions/core
    },
  };
});

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;
const mockedGetExecOutput = exec.getExecOutput as jest.Mock;
const SkopeoInstallerMock = SkopeoInstaller as jest.MockedClass<typeof SkopeoInstaller>;

describe('RemoteRegistryClient', () => {
  let remoteRegistryClient: RemoteRegistryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    SkopeoInstallerMock.prototype.ensureInstalled = jest.fn().mockResolvedValue(undefined);
    remoteRegistryClient = new RemoteRegistryClient(new SkopeoInstallerMock());
  });

  describe('getRemoteDigest', () => {
    const imageName = 'test/image:latest';
    const expectedDigest = 'sha256:abcdef1234567890';
    const validJsonOutput = JSON.stringify({ Digest: expectedDigest });
    const expectedArgs = ['inspect', `docker://${imageName}`];
    const expectedOptions = { ignoreReturnCode: true, silent: true };

    test('should return digest on successful skopeo inspect', async () => {
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: validJsonOutput, stderr: '' });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBe(expectedDigest);
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledWith(
        'skopeo',
        expectedArgs,
        expect.objectContaining(expectedOptions)
      );
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return null and log warning if skopeo inspect fails (non-zero exit code)', async () => {
      const stderrMessage = 'Authentication required';
      mockedGetExecOutput.mockResolvedValue({ exitCode: 1, stdout: '', stderr: stderrMessage });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(`skopeo inspect failed for ${imageName}: ${stderrMessage}`);
    });

    test('should return null and log warning if skopeo output is not valid JSON', async () => {
      const invalidJsonOutput = 'this is not json';
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: invalidJsonOutput, stderr: '' });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to get remote digest for ${imageName}:`)
      );
    });

    test('should return null and log warning if JSON output lacks Digest field', async () => {
      const jsonWithoutDigest = JSON.stringify({ RepoTags: ['latest'] });
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: jsonWithoutDigest, stderr: '' });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to get remote digest for ${imageName}:`)
      );
    });

    test('should return null and log warning if Digest field is not a valid sha256 string', async () => {
      const jsonWithInvalidDigest = JSON.stringify({ Digest: 'invalid-digest-format' });
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: jsonWithInvalidDigest, stderr: '' });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to get remote digest for ${imageName}:`)
      );
    });

    test('should return null and log warning if ensureInstalled fails', async () => {
      const installError = new Error('Skopeo installation failed.');
      SkopeoInstallerMock.prototype.ensureInstalled.mockRejectedValue(installError);

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).not.toHaveBeenCalled(); // Skopeo inspect should not run
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      // Check that the warning includes the original error message
      expect(coreMock.warning).toHaveBeenCalledWith(
        `Failed to get remote digest for ${imageName}: ${installError.message}`
      );
    });

    test('should return null and log warning if getExecOutput throws an error', async () => {
      const execError = new Error('Skopeo command not found');
      SkopeoInstallerMock.prototype.ensureInstalled.mockResolvedValue(undefined);
      mockedGetExecOutput.mockRejectedValue(execError);

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        `Failed to get remote digest for ${imageName}: ${execError.message}`
      );
    });
  });
});
