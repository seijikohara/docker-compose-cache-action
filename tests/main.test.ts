import * as cache from '@actions/cache';
import * as core from '@actions/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dockerCommand from '../src/docker-command.js';
import * as dockerComposeFile from '../src/docker-compose-file.js';
import { run } from '../src/main.js';
import * as platform from '../src/oci-platform.js';

vi.mock('@actions/core', () => ({
  getInput: vi.fn(),
  getMultilineInput: vi.fn(),
  getBooleanInput: vi.fn(),
  setOutput: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  debug: vi.fn(),
  setFailed: vi.fn(),
  summary: {
    addHeading: vi.fn().mockReturnThis(),
    addTable: vi.fn().mockReturnThis(),
    addRaw: vi.fn().mockReturnThis(),
    addList: vi.fn().mockReturnThis(),
    write: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@actions/cache', () => ({
  restoreCache: vi.fn(),
  saveCache: vi.fn(),
}));

vi.mock('../src/oci-platform.js', () => ({
  getCurrentOciPlatformString: vi.fn(),
  getCurrentPlatformInfo: vi.fn(),
  parseOciPlatformString: vi.fn(),
}));

vi.mock('../src/docker-command.js', () => ({
  inspectImageRemote: vi.fn(),
  inspectImageLocal: vi.fn(),
  pullImage: vi.fn(),
  saveImageToTar: vi.fn(),
  loadImageFromTar: vi.fn(),
}));

vi.mock('../src/docker-compose-file.js', () => ({
  getComposeServicesFromFiles: vi.fn(),
  getComposeFilePathsToProcess: vi.fn(() => ['docker-compose.yml']),
  matchesExcludePattern: vi.fn(() => false),
}));

// `../src/action-outputs.js` and `../src/file-utils.js` are intentionally
// not mocked at the module level: their pure functions only delegate
// side effects to `@actions/core`, which is already mocked above, so we
// can let main exercise the real implementations and just assert via
// the core mocks.

const mockCoreGetInput = vi.mocked(core.getInput);
const mockCoreGetMultilineInput = vi.mocked(core.getMultilineInput);
const mockCoreGetBooleanInput = vi.mocked(core.getBooleanInput);
const mockCoreSetOutput = vi.mocked(core.setOutput);
const mockCoreInfo = vi.mocked(core.info);
const mockCoreWarning = vi.mocked(core.warning);
const mockCoreSetFailed = vi.mocked(core.setFailed);
const mockCoreDebug = vi.mocked(core.debug);
const mockCacheRestore = vi.mocked(cache.restoreCache);
const mockCacheSave = vi.mocked(cache.saveCache);
const mockGetCurrentPlatformInfo = vi.mocked(platform.getCurrentPlatformInfo);
const mockGetComposeServicesFromFiles = vi.mocked(dockerComposeFile.getComposeServicesFromFiles);
const mockInspectImageRemote = vi.mocked(dockerCommand.inspectImageRemote);
const mockInspectImageLocal = vi.mocked(dockerCommand.inspectImageLocal);
const mockPullImage = vi.mocked(dockerCommand.pullImage);
const mockSaveImageToTar = vi.mocked(dockerCommand.saveImageToTar);
const mockLoadImageFromTar = vi.mocked(dockerCommand.loadImageFromTar);

describe('main', () => {
  describe('run', () => {
    const mockServiceDefinitions = [
      { image: 'nginx:latest' },
      { image: 'redis:alpine' },
      { image: 'node:alpine', platform: 'linux/arm64' },
    ];

    beforeEach(() => {
      vi.clearAllMocks();

      mockGetCurrentPlatformInfo.mockReturnValue({
        os: 'linux',
        arch: 'amd64',
      });

      mockPullImage.mockResolvedValue(true);
      mockSaveImageToTar.mockResolvedValue(true);
      mockLoadImageFromTar.mockResolvedValue(true);
      mockInspectImageRemote.mockResolvedValue({
        digest: 'sha256:digest',
        schemaVersion: 2,
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      });
      mockInspectImageLocal.mockResolvedValue({
        Id: 'sha256:image123',
        Size: 1024000,
        Architecture: 'amd64',
        Os: 'linux',
        RepoTags: ['nginx:latest'],
        RepoDigests: ['nginx@sha256:digest'],
        Created: '2024-01-01T00:00:00Z',
      });

      // Default: return service array
      mockGetComposeServicesFromFiles.mockImplementation((files) => {
        if (Array.isArray(files) && files.length > 0) {
          return mockServiceDefinitions;
        }
        return [];
      });

      mockCoreGetInput.mockImplementation((inputName) => {
        switch (inputName) {
          case 'cache-key-prefix':
            return 'test-cache';
          default:
            return '';
        }
      });

      mockCoreGetMultilineInput.mockImplementation((inputName) => {
        switch (inputName) {
          case 'compose-files':
            return ['docker-compose.yml'];
          case 'exclude-images':
            return [];
          default:
            return [];
        }
      });

      mockCoreGetBooleanInput.mockImplementation((inputName) => {
        switch (inputName) {
          case 'skip-digest-verification':
            return false;
          case 'skip-latest-check':
            return false;
          default:
            return false;
        }
      });

      mockCoreInfo.mockImplementation(() => {});
      mockCoreDebug.mockImplementation(() => {});

      process.env.RUNNER_TEMP = '/tmp';
    });

    it('should process services and set outputs', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockResolvedValue(123);
      await run();
      expect(mockGetComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], []);
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      const imageListOutput = mockCoreSetOutput.mock.calls.find((call) => call[0] === 'image-list')?.[1];
      expect(imageListOutput).toBeDefined();
      const parsedImageList = JSON.parse(imageListOutput);
      expect(Array.isArray(parsedImageList)).toBe(true);
      expect(parsedImageList.length).toBeGreaterThan(0);
      expect(parsedImageList[0]).toHaveProperty('name');
      expect(parsedImageList[0]).toHaveProperty('platform');
      expect(parsedImageList[0]).toHaveProperty('status');
      expect(parsedImageList[0]).toHaveProperty('size');
      expect(parsedImageList[0]).toHaveProperty('processingTimeMs');
      expect(parsedImageList[0]).toHaveProperty('cacheKey');
    });

    it('should handle cache hits', async () => {
      mockCacheRestore.mockResolvedValue('cache-key');
      await run();
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
    });

    it('should report no services found when compose file is empty', async () => {
      mockGetComposeServicesFromFiles.mockImplementation(() => []);
      await run();
      expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('No Docker services found'));
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCoreSetOutput).toHaveBeenCalledWith('image-list', '[]');
    });

    it('should handle errors in Docker commands', async () => {
      mockInspectImageRemote.mockResolvedValue(undefined);

      await run();

      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', expect.any(String));
    });

    it('should handle unexpected errors', async () => {
      mockGetComposeServicesFromFiles.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await run();

      expect(mockCoreSetFailed).toHaveBeenCalledWith('Unexpected error');
    });

    it('should handle unknown error types', async () => {
      mockGetComposeServicesFromFiles.mockImplementation(() => {
        throw 'non-error object';
      });

      await run();

      expect(mockCoreSetFailed).toHaveBeenCalledWith('Unknown error occurred');
    });

    it('should use platform from service when specified', async () => {
      const platformSpecificService = { image: 'nginx:alpine', platform: 'linux/arm64' };
      mockGetComposeServicesFromFiles.mockImplementation((files) => {
        if (Array.isArray(files) && files.length > 0) {
          return [platformSpecificService];
        }
        return [];
      });
      mockCacheRestore.mockResolvedValue(undefined);
      await run();

      // Check that platform info was logged
      expect(mockCoreInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:alpine');
    });

    it('should use default cache key prefix when not specified', async () => {
      mockCoreGetInput.mockImplementation(() => '');
      mockCacheRestore.mockResolvedValue(undefined);
      await run();

      // Check that default cache key prefix is used
      expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringMatching(/Cache key for .* docker-compose-image-/));
    });

    it('should exclude specified images from processing', async () => {
      mockCoreGetMultilineInput.mockImplementation((inputName) => {
        switch (inputName) {
          case 'compose-files':
            return ['docker-compose.yml'];
          case 'exclude-images':
            return ['nginx:latest'];
          default:
            return [];
        }
      });

      await run();

      expect(mockGetComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], ['nginx:latest']);
    });

    it('should handle "already exists" error when saving cache', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockImplementation(() => {
        throw new Error('Unable to reserve cache with key, key already exists');
      });
      mockGetComposeServicesFromFiles.mockReturnValue([]);
      await run();
      expect(mockCoreSetFailed).not.toHaveBeenCalled();
    });

    it('should handle "unable to upload" error when saving cache', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockImplementation(() => {
        throw new Error('unable to upload cache');
      });
      mockGetComposeServicesFromFiles.mockReturnValue([]);
      await run();
      expect(mockCoreSetFailed).not.toHaveBeenCalled();
    });

    it('should handle digest mismatch after pull', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      const singleServiceDefinition = { image: 'nginx:latest' };
      mockGetComposeServicesFromFiles.mockImplementation((files) => {
        if (Array.isArray(files) && files.length > 0) {
          return [singleServiceDefinition];
        }
        return [];
      });
      mockInspectImageRemote.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
      await run();
      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
    });

    it('should handle partial cache hits with multiple services', async () => {
      mockCacheRestore
        .mockResolvedValueOnce('cache-key')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      await run();

      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    });

    it('should set cache-hit to true when all services are cached', async () => {
      mockCacheRestore.mockResolvedValue('cache-key');
      await run();
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
    });

    describe('skip-digest-verification option', () => {
      beforeEach(() => {
        // Setup single service for cleaner test
        const singleServiceDefinition = [{ image: 'nginx:latest' }];
        mockGetComposeServicesFromFiles.mockImplementation((files) => {
          if (Array.isArray(files) && files.length > 0) {
            return singleServiceDefinition;
          }
          return [];
        });
      });

      it('should skip registry checks when skip-digest-verification is true', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-digest-verification':
              return 'true';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-digest-verification':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledTimes(1);
        expect(mockInspectImageRemote).toHaveBeenCalledWith('nginx:latest');
        expect(mockLoadImageFromTar).toHaveBeenCalled();
        expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('Skipped latest check for nginx:latest'));
      });

      it('should perform registry checks when skip-digest-verification is false (default)', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation(() => false);

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledTimes(2);
        expect(mockInspectImageRemote).toHaveBeenCalledWith('nginx:latest');
        expect(mockLoadImageFromTar).toHaveBeenCalled();
      });

      it('should handle digest mismatch when skip-digest-verification is false', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockInspectImageRemote
          .mockResolvedValueOnce({ digest: 'sha256:digest' })
          .mockResolvedValueOnce({ digest: 'sha256:different-digest' });

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation(() => false);

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledTimes(2);
        expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
        expect(mockCoreInfo).toHaveBeenCalledWith(
          expect.stringContaining('Manifest mismatch detected for nginx:latest')
        );
      });

      it('should use cached image without registry call when skip-digest-verification is true and cache hit', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-digest-verification':
              return 'true';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-digest-verification':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledTimes(1);
        expect(mockPullImage).not.toHaveBeenCalled();
        expect(mockLoadImageFromTar).toHaveBeenCalled();
        expect(mockInspectImageLocal).toHaveBeenCalled();

        const imageListCall = mockCoreSetOutput.mock.calls.find((call) => call[0] === 'image-list');
        expect(imageListCall).toBeDefined();
        const imageList = JSON.parse(imageListCall?.[1]);
        expect(imageList[0].status).toBe('Cached');
      });

      it('should still pull images on cache miss regardless of skip-digest-verification setting', async () => {
        mockCacheRestore.mockResolvedValue(undefined);

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-digest-verification':
              return 'true';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-digest-verification':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledWith('nginx:latest');
        expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
        expect(mockSaveImageToTar).toHaveBeenCalled();
      });
    });

    describe('deprecated skip-latest-check option', () => {
      beforeEach(() => {
        const singleServiceDefinition = [{ image: 'nginx:latest' }];
        mockGetComposeServicesFromFiles.mockImplementation((files) => {
          if (Array.isArray(files) && files.length > 0) {
            return singleServiceDefinition;
          }
          return [];
        });
      });

      it('should show deprecation warning when skip-latest-check is used', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-latest-check':
              return 'true';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockCoreWarning).toHaveBeenCalledWith(
          expect.stringContaining("'skip-latest-check' input is deprecated")
        );
        expect(mockInspectImageRemote).toHaveBeenCalledTimes(1);
        expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('Skipped latest check for nginx:latest'));
      });

      it('should show deprecation warning when skip-latest-check is set to false explicitly', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-latest-check':
              return 'false';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation(() => false);

        await run();

        expect(mockCoreWarning).toHaveBeenCalledWith(
          expect.stringContaining("'skip-latest-check' input is deprecated")
        );
        expect(mockInspectImageRemote).toHaveBeenCalledTimes(2);
      });

      it('should prefer skip-digest-verification over deprecated skip-latest-check', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            case 'skip-digest-verification':
              return 'false';
            case 'skip-latest-check':
              return 'true';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockInspectImageRemote).toHaveBeenCalledTimes(2);
        expect(mockCoreWarning).not.toHaveBeenCalledWith(
          expect.stringContaining("'skip-latest-check' input is deprecated")
        );
      });
    });

    describe('force-refresh option', () => {
      beforeEach(() => {
        const singleServiceDefinition = [{ image: 'nginx:latest' }];
        mockGetComposeServicesFromFiles.mockImplementation((files) => {
          if (Array.isArray(files) && files.length > 0) {
            return singleServiceDefinition;
          }
          return [];
        });
      });

      it('should skip cache restore when force-refresh is enabled', async () => {
        mockCacheSave.mockResolvedValue(123);

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'force-refresh':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockCoreInfo).toHaveBeenCalledWith('Force refresh enabled - ignoring existing cache');
        expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('Force refresh enabled for nginx:latest'));
        expect(mockCacheRestore).not.toHaveBeenCalled();
        expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
        expect(mockCacheSave).toHaveBeenCalled();
      });

      it('should use cache when force-refresh is disabled', async () => {
        mockCacheRestore.mockResolvedValue('cache-key');

        mockCoreGetInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'cache-key-prefix':
              return 'test-cache';
            default:
              return '';
          }
        });
        mockCoreGetBooleanInput.mockImplementation(() => false);

        await run();

        expect(mockCacheRestore).toHaveBeenCalled();
        expect(mockCoreInfo).not.toHaveBeenCalledWith('Force refresh enabled - ignoring existing cache');
      });

      it('should set cache-hit to false when force-refresh is used', async () => {
        mockCacheSave.mockResolvedValue(123);

        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'force-refresh':
              return true;
            default:
              return false;
          }
        });

        await run();

        expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      });
    });
  });
});
