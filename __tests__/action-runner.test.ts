import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path'; // Import path for helpers
import { ActionRunner } from '../src/action-runner';
import { ComposeParser, ImageInfo } from '../src/compose-parser';
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

// Helper functions for platform normalization and assertions
const getNormalizedPlatformForTest = (platform: string | undefined): string =>
  platform ? platform.replace(/[/]/g, '_') : `${process.platform}_${process.arch}`;

const expectCachePathContaining = (imageName: string, platform: string | undefined, remoteDigest: string): string => {
  const safeImageName = imageName.replace(/[/:]/g, '_');
  const safePlatform = getNormalizedPlatformForTest(platform);
  return expect.stringContaining(
    path.join('/tmp', `docker-image-${safeImageName}-plt_${safePlatform}-${remoteDigest}-`)
  );
};

const expectCacheKeyContaining = (imageName: string, platform: string | undefined, remoteDigest: string): string => {
  const safeImageName = imageName.replace(/[/:]/g, '_');
  const safePlatform = getNormalizedPlatformForTest(platform);
  return expect.stringContaining(`test-prefix-linux-${safeImageName}-plt_${safePlatform}-${remoteDigest}-`);
};

describe('ActionRunner', () => {
  const mockImageInfoList: readonly ImageInfo[] = [
    { imageName: 'image1:latest', platform: undefined },
    { imageName: 'image2:v1.0', platform: 'linux/arm64' },
  ];
  const digest1 = 'sha256:digest1';
  const digest2 = 'sha256:digest2';

  beforeEach(() => {
    jest.clearAllMocks();
    ComposeParserMock.prototype.getImageList = jest.fn().mockReturnValue(mockImageInfoList);
    DockerCommandMock.prototype.pull = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.load = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.save = jest.fn().mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest = jest
      .fn()
      .mockImplementation(async (imageName: string) =>
        imageName === 'image1:latest' ? digest1 : imageName === 'image2:v1.0' ? digest2 : null
      ); // Default getDigest mock
    CacheManagerMock.prototype.restore = jest.fn().mockResolvedValue(false);
    CacheManagerMock.prototype.save = jest.fn().mockResolvedValue(undefined);
    RemoteRegistryClientMock.prototype.getRemoteDigest = jest
      .fn()
      .mockImplementation(async (imageName: string, _platform?: string) =>
        imageName === 'image1:latest' ? digest1 : imageName === 'image2:v1.0' ? digest2 : null
      );
    SkopeoInstallerMock.prototype.ensureInstalled = jest.fn().mockResolvedValue(undefined);
    coreMock.getInput.mockImplementation((name: string): string => (name === 'cache-key-prefix' ? 'test-prefix' : ''));
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'compose-files' ? ['docker-compose.yml'] : name === 'exclude-images' ? [] : []
    );
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockImplementation((filePath): string =>
      typeof filePath === 'string' && filePath.includes('override') ? 'override content' : 'mock file content'
    );
    fsPromisesMock.access.mockResolvedValue(undefined);
    process.env.RUNNER_OS = 'linux';
    process.env.RUNNER_TEMP = '/tmp';
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    Object.defineProperty(process, 'arch', { value: 'x64', configurable: true });
  });

  const createRunner = () => new ActionRunner();

  test('should restore all images from cache successfully, respecting platform', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(true);
    DockerCommandMock.prototype.load.mockResolvedValue(undefined);
    const runner = createRunner();
    await runner.run();
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expectCacheKeyContaining('image1:latest', undefined, digest1),
      expectCachePathContaining('image1:latest', undefined, digest1)
    );
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expectCacheKeyContaining('image2:v1.0', 'linux/arm64', digest2),
      expectCachePathContaining('image2:v1.0', 'linux/arm64', digest2)
    );
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledTimes(2);
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
    expect(DockerCommandMock.prototype.pull).not.toHaveBeenCalled();
    expect(DockerCommandMock.prototype.save).not.toHaveBeenCalled();
  });

  test('should pull and save images on full cache miss, respecting platform', async () => {
    DockerCommandMock.prototype.getDigest.mockImplementation(async (img) =>
      img === 'image1:latest' ? digest1 : digest2
    ); // Ensure correct digest after pull
    const runner = createRunner();
    await runner.run();
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledWith(
      expectCachePathContaining('image1:latest', undefined, digest1),
      ['image1:latest']
    );
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledWith(
      expectCacheKeyContaining('image1:latest', undefined, digest1),
      expectCachePathContaining('image1:latest', undefined, digest1)
    );
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledWith(
      expectCachePathContaining('image2:v1.0', 'linux/arm64', digest2),
      ['image2:v1.0']
    );
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledWith(
      expectCacheKeyContaining('image2:v1.0', 'linux/arm64', digest2),
      expectCachePathContaining('image2:v1.0', 'linux/arm64', digest2)
    );
  });

  test('should handle partial cache hit (one hit, one miss)', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    DockerCommandMock.prototype.load.mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest.mockResolvedValue(digest2); // image2 digest match after pull
    const runner = createRunner();
    await runner.run();
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(DockerCommandMock.prototype.load).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(1);
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledWith('image2:v1.0');
    expect(DockerCommandMock.prototype.getDigest).toHaveBeenCalledTimes(1); // Only image2 checked after pull
    expect(DockerCommandMock.prototype.getDigest).toHaveBeenCalledWith('image2:v1.0');
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
  });

  test('should correctly pass platform to getRemoteDigest', async () => {
    const runner = createRunner();
    await runner.run();
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledWith('image1:latest', undefined);
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledWith('image2:v1.0', 'linux/arm64');
  });

  test('should handle exclusion based on image name only (ignoring platform)', async () => {
    ComposeParserMock.prototype.getImageList.mockReturnValue([
      { imageName: 'image1:latest', platform: undefined },
      { imageName: 'image1:latest', platform: 'linux/arm64' },
      { imageName: 'image2:v1.0', platform: undefined },
    ]);
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'exclude-images' ? ['image1:latest'] : name === 'compose-files' ? ['compose.yml'] : []
    );
    RemoteRegistryClientMock.prototype.getRemoteDigest.mockResolvedValue(digest2);
    DockerCommandMock.prototype.getDigest.mockResolvedValue(digest2);
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
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

  test('should handle multiple compose files (check platform propagation)', async () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] =>
      name === 'compose-files' ? ['docker-compose.yml', 'docker-compose.override.yml'] : []
    );
    fsMock.readFileSync.mockImplementation((filePath) =>
      typeof filePath === 'string' && filePath.includes('override') ? 'override content' : 'mock file content'
    );
    const multiFileOutput: readonly ImageInfo[] = [
      { imageName: 'image1:latest', platform: undefined },
      { imageName: 'image2:v1.0', platform: 'linux/arm64' },
      { imageName: 'image3:beta', platform: 'linux/amd64' },
    ];
    ComposeParserMock.prototype.getImageList.mockReturnValue(multiFileOutput);
    const digest3 = 'sha256:digest3';
    RemoteRegistryClientMock.prototype.getRemoteDigest.mockImplementation(async (img) =>
      img === 'image1:latest' ? digest1 : img === 'image2:v1.0' ? digest2 : digest3
    );
    DockerCommandMock.prototype.getDigest.mockImplementation(async (img) =>
      img === 'image1:latest' ? digest1 : img === 'image2:v1.0' ? digest2 : digest3
    );
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    const runner = createRunner();
    await runner.run();
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledWith('image1:latest', undefined);
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledWith('image2:v1.0', 'linux/arm64');
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledWith('image3:beta', 'linux/amd64');
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expect.stringContaining('-image1_latest-plt_linux_x64-'),
      expect.any(String)
    );
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expect.stringContaining('-image2_v1.0-plt_linux_arm64-'),
      expect.any(String)
    );
    expect(CacheManagerMock.prototype.restore).toHaveBeenCalledWith(
      expect.stringContaining('-image3_beta-plt_linux_amd64-'),
      expect.any(String)
    );
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(3);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(3);
  });

  test('should find and use default compose file', async () => {
    coreMock.getMultilineInput.mockImplementation((name: string): string[] => (name === 'compose-files' ? [] : []));
    fsMock.existsSync.mockImplementation((p) => p === 'compose.yml');
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.getDigest.mockResolvedValue(digest1);
    ComposeParserMock.prototype.getImageList.mockReturnValue([{ imageName: 'image1:latest', platform: undefined }]); // Adjust mock return
    const runner = createRunner();
    await runner.run();
    expect(coreMock.info).toHaveBeenCalledWith('Using automatically found compose file: compose.yml');
    expect(ComposeParserMock).toHaveBeenCalledWith(['compose.yml']);
    expect(RemoteRegistryClientMock.prototype.getRemoteDigest).toHaveBeenCalledTimes(1);
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
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  // ********** Test Case Fix Start **********
  test('should warn and pull if loading cached image fails', async () => {
    // Arrange: Both hit cache, but load fails
    CacheManagerMock.prototype.restore.mockResolvedValue(true);
    DockerCommandMock.prototype.load.mockRejectedValue(new Error('Load failed'));
    // IMPORTANT: Ensure digest check after pull succeeds by returning the correct digests
    DockerCommandMock.prototype.getDigest.mockImplementation(async (imageName: string) => {
      if (imageName === 'image1:latest') return digest1; // Matches remote digest1
      if (imageName === 'image2:v1.0') return digest2; // Matches remote digest2
      return null;
    });

    const runner = createRunner();
    await runner.run();

    // Assert
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load image1:latest from cache: Load failed.')
    );
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to load image2:v1.0 from cache: Load failed.')
    );
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2); // Pull triggered
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2); // Should be called now
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2); // Should be called now
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });
  // ********** Test Case Fix End **********

  test('should warn and skip saving if pull fails for an image', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.pull.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Network Error'));
    DockerCommandMock.prototype.getDigest.mockResolvedValue(digest1);
    const runner = createRunner();
    await runner.run();
    expect(coreMock.error).toHaveBeenCalledWith('Failed to pull image image2:v1.0: Network Error');
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(1);
    expect(coreMock.info).toHaveBeenCalledWith('Saving 1 image(s) to cache...');
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
  });

  test('should warn and skip saving if digest check fails after pull', async () => {
    CacheManagerMock.prototype.restore.mockResolvedValue(false);
    DockerCommandMock.prototype.pull.mockResolvedValue(undefined);
    DockerCommandMock.prototype.getDigest.mockResolvedValue('sha256:different-after-pull');
    const runner = createRunner();
    await runner.run();
    expect(DockerCommandMock.prototype.pull).toHaveBeenCalledTimes(2);
    expect(DockerCommandMock.prototype.getDigest).toHaveBeenCalledTimes(2);
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        `Digest check failed after pulling image1:latest (Local: sha256:different-after-pull, Expected: ${digest1}). Skipping cache save.`
      )
    );
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining(
        `Digest check failed after pulling image2:v1.0 (Local: sha256:different-after-pull, Expected: ${digest2}). Skipping cache save.`
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
    DockerCommandMock.prototype.getDigest.mockImplementation(async (img) =>
      img === 'image1:latest' ? digest1 : digest2
    );
    CacheManagerMock.prototype.save.mockRejectedValue(new Error('Cache API limit reached'));
    const runner = createRunner();
    await runner.run();
    expect(DockerCommandMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(CacheManagerMock.prototype.save).toHaveBeenCalledTimes(2);
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save image image1:latest to cache: Cache API limit reached')
    );
    expect(coreMock.warning).toHaveBeenCalledWith(
      expect.stringContaining('Failed to save image image2:v1.0 to cache: Cache API limit reached')
    );
    expect(coreMock.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
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
    await expect(runner.run()).rejects.toThrow(installError);
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
  });
});
