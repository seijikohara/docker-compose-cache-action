import * as core from '@actions/core';
import * as exec from '@actions/exec';
import { SkopeoInstaller } from '../src/skopeo-installer';
import { RemoteRegistryClient } from '../src/remote-registry';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('@actions/exec');
jest.mock('../src/skopeo-installer');

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;
const mockedGetExecOutput = exec.getExecOutput as jest.Mock;
const SkopeoInstallerMock = SkopeoInstaller as jest.MockedClass<typeof SkopeoInstaller>;

describe('RemoteRegistryClient', () => {
  let remoteRegistryClient: RemoteRegistryClient;
  let skopeoInstallerInstanceMock: SkopeoInstaller;

  beforeEach(() => {
    jest.clearAllMocks();
    SkopeoInstallerMock.prototype.ensureInstalled = jest.fn().mockResolvedValue(undefined);
    skopeoInstallerInstanceMock = new SkopeoInstallerMock();
    remoteRegistryClient = new RemoteRegistryClient(skopeoInstallerInstanceMock);
  });

  describe('getRemoteDigest', () => {
    const imageName = 'test/image:latest';
    const platformAmd = 'linux/amd64';
    const platformArm = 'linux/arm64/v8';
    const expectedDigestAmd = 'sha256:digest-amd64';
    const expectedDigestArm = 'sha256:digest-arm64v8'; // Define expected digest for ARM
    const validJsonOutputAmd = JSON.stringify({ Digest: expectedDigestAmd });
    const validJsonOutputArm = JSON.stringify({ Digest: expectedDigestArm }); // Use defined constant
    const defaultInspectArgs = ['inspect', `docker://${imageName}`];
    const amdInspectArgs = ['inspect', '--override-os', 'linux', '--override-arch', 'amd64', `docker://${imageName}`];
    const armInspectArgs = [
      'inspect',
      '--override-os',
      'linux',
      '--override-arch',
      'arm64',
      '--override-variant',
      'v8',
      `docker://${imageName}`,
    ];
    const expectedOptions = { ignoreReturnCode: true, silent: true };

    test('should call ensureInstalled before executing command', async () => {
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: validJsonOutputAmd, stderr: '' });
      await remoteRegistryClient.getRemoteDigest(imageName);
      expect(skopeoInstallerInstanceMock.ensureInstalled).toHaveBeenCalledTimes(1);
    });

    test('should return digest on successful inspect (default platform)', async () => {
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: validJsonOutputAmd, stderr: '' });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName);
      expect(digest).toBe(expectedDigestAmd);
      expect(mockedGetExecOutput).toHaveBeenCalledWith(
        'skopeo',
        defaultInspectArgs,
        expect.objectContaining(expectedOptions)
      );
      expect(coreMock.info).toHaveBeenCalledWith(`Inspecting image ${imageName} for default platform`);
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return digest on successful inspect (specific platform linux/amd64)', async () => {
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: validJsonOutputAmd, stderr: '' });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName, platformAmd);
      expect(digest).toBe(expectedDigestAmd);
      expect(mockedGetExecOutput).toHaveBeenCalledWith(
        'skopeo',
        amdInspectArgs,
        expect.objectContaining(expectedOptions)
      );
      expect(coreMock.info).toHaveBeenCalledWith(`Inspecting image ${imageName} for platform ${platformAmd}`);
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return digest on successful inspect (specific platform linux/arm64/v8)', async () => {
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: validJsonOutputArm, stderr: '' });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName, platformArm);
      expect(digest).toBe(expectedDigestArm); // Use defined constant
      expect(mockedGetExecOutput).toHaveBeenCalledWith(
        'skopeo',
        armInspectArgs,
        expect.objectContaining(expectedOptions)
      );
      expect(coreMock.info).toHaveBeenCalledWith(`Inspecting image ${imageName} for platform ${platformArm}`);
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return null and log warning if skopeo inspect fails (non-zero exit code)', async () => {
      const stderrMessage = 'Authentication required';
      mockedGetExecOutput.mockResolvedValue({ exitCode: 1, stdout: '', stderr: stderrMessage });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName, platformAmd);
      expect(digest).toBeNull();
      expect(mockedGetExecOutput).toHaveBeenCalledWith('skopeo', amdInspectArgs, expect.any(Object));
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        `skopeo inspect failed for ${imageName} (platform: ${platformAmd}): ${stderrMessage}`
      );
    });

    test('should return null and log warning if skopeo output is not valid JSON', async () => {
      const invalidJsonOutput = 'this is not json';
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: invalidJsonOutput, stderr: '' });

      const digest = await remoteRegistryClient.getRemoteDigest(imageName); // Platform is default here

      expect(digest).toBeNull();
      expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      // Update assertion to expect the more specific error message from JSON.parse
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to get remote digest for ${imageName} (platform: default host): Unexpected token`
        ) // Check for the JSON parse error part
      );
    });

    test('should return null and log warning if JSON output lacks Digest field', async () => {
      const jsonWithoutDigest = JSON.stringify({ RepoTags: ['latest'] });
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: jsonWithoutDigest, stderr: '' });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName, platformAmd);
      expect(digest).toBeNull();
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to get remote digest for ${imageName} (platform: ${platformAmd}): Digest not found or invalid`
        )
      );
    });

    test('should return null and log warning if Digest format is invalid', async () => {
      const jsonWithInvalidDigest = JSON.stringify({ Digest: 'sha256-nodcolon' });
      mockedGetExecOutput.mockResolvedValue({ exitCode: 0, stdout: jsonWithInvalidDigest, stderr: '' });
      const digest = await remoteRegistryClient.getRemoteDigest(imageName);
      expect(digest).toBeNull();
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        expect.stringContaining(
          `Failed to get remote digest for ${imageName} (platform: default host): Digest not found or invalid`
        )
      );
    });

    test('should return null and log warning if ensureInstalled fails', async () => {
      const installError = new Error('Skopeo installation failed.');
      (skopeoInstallerInstanceMock.ensureInstalled as jest.Mock).mockRejectedValue(installError); // Use the instance mock

      const digest = await remoteRegistryClient.getRemoteDigest(imageName, platformArm);
      expect(digest).toBeNull();
      expect(skopeoInstallerInstanceMock.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).not.toHaveBeenCalled();
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        `Failed to get remote digest for ${imageName} (platform: ${platformArm}): ${installError.message}`
      );
    });

    test('should return null and log warning if getExecOutput throws an error', async () => {
      const execError = new Error('Skopeo command not found');
      (skopeoInstallerInstanceMock.ensureInstalled as jest.Mock).mockResolvedValue(undefined); // Ensure install succeeds
      mockedGetExecOutput.mockRejectedValue(execError);

      const digest = await remoteRegistryClient.getRemoteDigest(imageName);
      expect(digest).toBeNull();
      expect(skopeoInstallerInstanceMock.ensureInstalled).toHaveBeenCalledTimes(1);
      expect(mockedGetExecOutput).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        `Failed to get remote digest for ${imageName} (platform: default host): ${execError.message}`
      );
    });
  });
});
