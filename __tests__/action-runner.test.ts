import * as core from '@actions/core';
import * as fs from 'fs';
import { ActionRunner } from '../src/action-runner';
import { ComposeParser } from '../src/compose-parser';
import { DockerCommand } from '../src/docker-command';
import { CacheManager } from '../src/cache-manager';
import { SkopeoInstaller } from '../src/skopeo-installer';
import { RemoteRegistryClient } from '../src/remote-registry';

// Mock dependencies EXCEPT crypto
jest.mock('@actions/core');
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn().mockReturnValue(true),
    readFileSync: jest.fn().mockImplementation((filePath: string): string => {
      if (typeof filePath === 'string' && filePath.includes('override')) return 'override content';
      return 'mock file content';
    }),
    promises: {
      ...originalFs.promises,
      access: jest.fn().mockResolvedValue(undefined),
    },
  };
});
jest.mock('../src/compose-parser');
jest.mock('../src/docker-command');
jest.mock('../src/cache-manager');
jest.mock('../src/skopeo-installer');
jest.mock('../src/remote-registry');

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;

const fsMock = fs as jest.Mocked<typeof fs>;

const fsPromisesMock = fs.promises as jest.Mocked<typeof fs.promises>; // Keep if needed for promise mocks

const ComposeParserMock = ComposeParser as jest.MockedClass<typeof ComposeParser>;
const DockerCommandMock = DockerCommand as jest.MockedClass<typeof DockerCommand>;
const CacheManagerMock = CacheManager as jest.MockedClass<typeof CacheManager>;
const SkopeoInstallerMock = SkopeoInstaller as jest.MockedClass<typeof SkopeoInstaller>;
const RemoteRegistryClientMock = RemoteRegistryClient as jest.MockedClass<typeof RemoteRegistryClient>;

// REMOVED unused helper functions expectCachePathPrefix and expectCacheKeyPrefix

describe('ActionRunner', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Prototype Methods
    ComposeParserMock.prototype.getImageList = jest.fn().mockReturnValue(['image1:latest', 'image2:v1.0']);
    DockerCommandMock.prototype.pull = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.load = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.save = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest = jest.fn().mockResolvedValue('sha256:matching-digest');
    CacheManagerMock.prototype.restore = jest.fn().mockResolvedValue(false);
    CacheManagerMock.prototype.save = jest.fn().mockResolvedValue(undefined);
    RemoteRegistryClientMock.prototype.getRemoteDigest = jest.fn().mockResolvedValue('sha256:matching-digest');
    SkopeoInstallerMock.prototype.ensureInstalled = jest.fn().mockResolvedValue(undefined);

    // Mock @actions/core
    coreMock.getInput.mockImplementation((name: string): string => {
      switch (name) {
        case 'cache-key-prefix':
          return 'test-prefix';
        default:
          return '';
      }
    });
    coreMock.getMultilineInput.mockImplementation((name: string): string[] => {
      switch (name) {
        case 'compose-files':
          return ['docker-compose.yml'];
        case 'exclude-images':
          return [];
        default:
          return [];
      }
    });

    // Mock fs (Reset default behavior)
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockImplementation((filePath): string => {
      if (typeof filePath === 'string' && filePath.includes('override')) return 'override content';
      return 'mock file content';
    });
    fsPromisesMock.access.mockResolvedValue(undefined);

    // Mock environment variables
    process.env.RUNNER_OS = 'linux';
    process.env.RUNNER_TEMP = '/tmp';
  });

  const createRunner = () => new ActionRunner();

  // ==================
  // Normal Cases
  // ==================
  test('should restore all images from cache successfully', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(true);
    DockerCommandMock.prototype.load.mockResolvedValue(undefined);
    const runner = createRunner();
    await runner.run();
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expect.stringContaining('-image1_latest-sha256:matching-digest-'),
      expect.stringContaining('-image1_latest-sha256:matching-digest-')
    );
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expect.stringContaining('-image2_v1.0-sha256:matching-digest-'),
      expect.stringContaining('-image2_v1.0-sha256:matching-digest-')
    );
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledWith(
      expect.stringContaining('-image1_latest-sha256:matching-digest-')
    );
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledWith(
      expect.stringContaining('-image2_v1.0-sha256:matching-digest-')
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
    expect(DockerCommandMock.prototype.pull).not.toHaveBeenCalled();
    expect(DockerCommandMock.prototype.save).not.toHaveBeenCalled();
    expect(CacheManagerMock.prototype.save).not.toHaveBeenCalled();
    expect(coreMock.info).toHaveBeenCalledWith('All required images were successfully restored from cache.');
  });

  test('should pull and save images on full cache miss', async () => {
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledWith(
      expect.stringContaining('-image1_latest-sha256:matching-digest-'),
      ['image1:latest']
    );
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledWith(
      expect.stringContaining('-image1_latest-sha256:matching-digest-'),
      expect.stringContaining('-image1_latest-sha256:matching-digest-')
    );
  });

  test('should handle partial cache hit (one hit, one miss)', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    DockerCommandMock.prototype.load.mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledWith('image2:v1.0');
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
  });

  test('should correctly exclude specified images', async () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'exclude-images' ? ['image1:latest'] : name === 'compose-files' ? ['docker-compose.yml'] : []
    );
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.info).toHaveBeenCalledWith('Excluding images: image1:latest');
    expect(coreMock.setOutput).toHaveBeenCalledWith('image-list', 'image2:v1.0');
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
  });

  test('should handle multiple compose files', async () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'compose-files' ? ['docker-compose.yml', 'docker-compose.override.yml'] : []
    );
    fsMock.readFileSync.mockImplementation((filePath) =>
      typeof filePath === 'string' && filePath.includes('override') ? 'override content' : 'mock file content'
    );
    ComposeParserMock.prototype.getImageList.mockReturnValue(['image1:latest', 'image2:v1.0', 'image3:beta']);
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.info).toHaveBeenCalledWith(
      'Using specified compose files: docker-compose.yml, docker-compose.override.yml'
    );
    expect(ComposeParserMock).toHaveBeenCalledWith(['docker-compose.yml', 'docker-compose.override.yml']);
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledTimes(3);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(3);
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledTimes(3);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(3);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(3);
  });

  test('should find and use default compose file', async () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] => (name === 'compose-files' ? [] : []));
    fsMock.existsSync.mockImplementation((p) => p === 'compose.yml');
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.info).toHaveBeenCalledWith('Compose files not specified, searching for default files...');
    const existsSyncCalls = fsMock.existsSync.mock.calls;
    expect(existsSyncCalls.length).toBeGreaterThanOrEqual(2);
    expect(existsSyncCalls[0][0]).toBe('compose.yaml');
    expect(existsSyncCalls[1][0]).toBe('compose.yml');
    expect(fsMock.existsSync).not.toHaveBeenCalledWith('docker-compose.yaml');
    expect(coreMock.info).toHaveBeenCalledWith('Using automatically found compose file: compose.yml');
    expect(ComposeParserMock).toHaveBeenCalledWith(['compose.yml']);
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledTimes(2);
  });

  // Semi-Normal Cases
  test('should warn and skip caching if remote digest fetch fails for an image', async () => {
    const digestForImage1 = 'sha256:digest-for-image1';
    RemoteRegistryClientMock.prototype.getRemoteDigest
      .mockResolvedValueOnce(digestForImage1)
      .mockRejectedValueOnce(new Error('Fetch failed'));
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.getDigest.mockResolvedValue(digestForImage1);
    const runner = createRunner();
    await runner.run();
    expect(coreMock.warning).toHaveBeenCalledWith('Fetch failed');
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledWith('image1:latest');
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  test('should warn and pull if loading cached image fails', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(true);
    DockerCommandMock.prototype.load.mockRejectedValue(new Error('Load failed'));
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load image1:latest from cache: Load failed.')
    );
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  test('should warn and skip saving if pull fails for an image', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.pull.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Network Error'));
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    const runner = createRunner();
    await runner.run();
    expect(coreMock.error).toHaveBeenCalledWith('Failed to pull image image2:v1.0: Network Error');
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(coreMock.info).toHaveBeenCalledWith('Saving 1 image(s) to cache...');
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  test('should warn and skip saving if digest check fails after pull', async () => {
    // Arrange
    CacheManagerMock.prototype.restore.mockResolvedValue(false); // Cache miss
    DockerCommandMock.prototype.pull.mockResolvedValue(undefined); // Pull succeeds
    // Simulate local digest mismatch after pull
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:different-after-pull');
    // Remote digest mock remains 'sha256:matching-digest' from beforeEach

    const runner = createRunner();
    await runner.run();

    // Assert
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.getDigest).toHaveBeenCalledTimes(2); // Called after pull

    // Check updated assertion for detailed warning message
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Digest check failed after pulling image1:latest (Local: sha256:different-after-pull, Expected: sha256:matching-digest). Skipping cache save.'
      )
    );
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        'Digest check failed after pulling image2:v1.0 (Local: sha256:different-after-pull, Expected: sha256:matching-digest). Skipping cache save.'
      )
    );

    expect(DockerCommandMock.prototype.save).not.toHaveBeenCalled();
    expect(CacheManagerMock.prototype.save).not.toHaveBeenCalled();
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  test('should handle cache save errors gracefully', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.pull.mockResolvedValue(undefined);
    DockerCommandMock.prototype.save.mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:matching-digest');
    CacheManagerMock.prototype.save.mockRejectedValue(new Error('Cache API limit reached'));
    const runner = createRunner();
    await runner.run();
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save image image1:latest to cache: Cache API limit reached')
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(coreMock.setFailed).not.toHaveBeenCalled();
  });

  // Error Cases
  test('should throw error if specified compose file does not exist in constructor', () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'compose-files' ? ['non-existent-file.yml'] : []
    );
    fsMock.existsSync.mockReturnValue(false);
    expect(() => new ActionRunner()).toThrow('Specified compose file not found: non-existent-file.yml');
  });

  test('should throw error if default compose file search fails in constructor', () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] => (name === 'compose-files' ? [] : []));
    fsMock.existsSync.mockReturnValue(false);
    expect(() => new ActionRunner()).toThrow('No default compose files found.');
  });

  test('should reject run() if skopeo installation fails', async () => {
    const installError = new Error('Skopeo installation failed.');
    SkopeoInstallerMock.prototype.ensureInstalled.mockRejectedValue(installError);
    const runner = createRunner();
    await expect(runner.run()).rejects.toThrow('Skopeo installation failed.');
    expect(SkopeoInstallerMock.prototype.ensureInstalled).toHaveBeenCalledTimes(1);
  });

  test('should handle failure to get digest for all images gracefully', async () => {
    const apiError = new Error('API Error');
    RemoteRegistryClientMock.prototype.getRemoteDigest.mockRejectedValue(apiError);
    const runner = createRunner();
    await runner.run();
    expect(coreMock.warning).toHaveBeenCalledWith(apiError.message);
    expect(coreMock.warning).toHaveBeenCalledWith('Could not retrieve digest for any image.');
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(DockerCommandMock.prototype.pull).not.toHaveBeenCalled();
    expect(coreMock.setFailed).not.toHaveBeenCalled();
  });
});
