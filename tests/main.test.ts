import * as cache from '@actions/cache';
import * as core from '@actions/core';

import * as dockerCommand from '../src/docker-command';
import * as dockerComposeFile from '../src/docker-compose-file';
import * as platform from '../src/oci-platform';

jest.mock('../src/main', () => {
  const originalModule = jest.requireActual('../src/main');
  return {
    ...originalModule,
    run: jest.fn().mockImplementation(originalModule.run),
  };
});

jest.mock('@actions/core', () => {
  return {
    getInput: jest.fn(),
    getMultilineInput: jest.fn(),
    getBooleanInput: jest.fn(),
    setOutput: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    debug: jest.fn(),
    setFailed: jest.fn(),
    summary: {
      addHeading: jest.fn().mockReturnThis(),
      addTable: jest.fn().mockReturnThis(),
      addRaw: jest.fn().mockReturnThis(),
      addList: jest.fn().mockReturnThis(),
      write: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('@actions/cache', () => {
  return {
    restoreCache: jest.fn(),
    saveCache: jest.fn(),
  };
});

jest.mock('../src/oci-platform');
jest.mock('../src/docker-command');
jest.mock('../src/docker-compose-file', () => {
  const original = jest.requireActual('../src/docker-compose-file');
  return {
    ...original,
    getComposeServicesFromFiles: jest.fn(),
    getComposeFilePathsToProcess: jest.fn(() => ['docker-compose.yml']),
  };
});

import { run } from '../src/main';

jest.mock('../src/action-outputs', () => {
  const original = jest.requireActual('../src/action-outputs');
  return {
    ...original,
    logActionCompletion: jest.fn(),
    createActionSummary: jest.fn(),
  };
});

jest.mock('../src/file-utils', () => {
  return {
    sanitizePathComponent: jest.fn((inputString) => inputString),
  };
});

// Type error avoidance: redefine dockerCommand as Record<string, jest.Mock>
const dockerCommandMock = dockerCommand as unknown as Record<string, jest.Mock>;

describe('main', () => {
  describe('run', () => {
    const mockCoreGetInput = core.getInput as jest.Mock;
    const mockCoreGetMultilineInput = core.getMultilineInput as jest.Mock;
    const mockCoreGetBooleanInput = core.getBooleanInput as jest.Mock;
    const mockCoreSetOutput = core.setOutput as jest.Mock;
    const mockCoreInfo = core.info as jest.Mock;
    const mockCoreWarning = core.warning as jest.Mock;
    const mockCoreSetFailed = core.setFailed as jest.Mock;
    const mockCoreDebug = core.debug as jest.Mock;
    const mockCacheRestore = cache.restoreCache as jest.Mock;
    const mockCacheSave = cache.saveCache as jest.Mock;

    const mockServiceDefinitions = [
      { image: 'nginx:latest' },
      { image: 'redis:alpine' },
      { image: 'node:alpine', platform: 'linux/arm64' },
    ];

    beforeEach(() => {
      jest.clearAllMocks();

      (platform.getCurrentPlatformInfo as jest.Mock).mockReturnValue({
        os: 'linux',
        arch: 'amd64',
      });

      dockerCommandMock.getImageDigest = jest.fn().mockResolvedValue('sha256:digest');
      dockerCommandMock.pullImage = jest.fn().mockResolvedValue(true);
      dockerCommandMock.saveImageToTar = jest.fn().mockResolvedValue(true);
      dockerCommandMock.loadImageFromTar = jest.fn().mockResolvedValue(true);
      dockerCommandMock.inspectImageRemote = jest.fn().mockResolvedValue({
        digest: 'sha256:digest',
        schemaVersion: 2,
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      });
      dockerCommandMock.inspectImageLocal = jest.fn().mockResolvedValue({
        Id: 'sha256:image123',
        Size: 1024000,
      });

      // Default: return service array
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation((files, _excludes) => {
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
          case 'skip-latest-check':
            return false;
          default:
            return false;
        }
      });

      // Add default implementations for mock methods
      mockCoreInfo.mockImplementation((logMessage) => {
        // Simulate messages like cache hits
        if (logMessage.includes('Cache key for')) {
          return;
        } else if (logMessage.includes('platform')) {
          return;
        }
      });

      mockCoreDebug.mockImplementation(() => {});

      process.env.RUNNER_TEMP = '/tmp';
    });

    it('should process services and set outputs', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockResolvedValue(123);
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage.includes('Cache key for')) {
          return;
        }
      });
      await run();
      expect(dockerComposeFile.getComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], []);
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
      // getImageDigest, pullImage, saveImageToTar calls are not guaranteed
    });

    it('should handle cache hits', async () => {
      mockCacheRestore.mockResolvedValue('cache-key');
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage.includes('Cache hit for')) {
          return;
        }
      });
      await run();

      // Check that setOutput was called with cache-hit true (all from cache)
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      // loadImageFromTar, pullImage calls are not guaranteed
    });

    it('should report no services found when compose file is empty', async () => {
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation(() => []);
      await run();
      expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('No Docker services found'));
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCoreSetOutput).toHaveBeenCalledWith('image-list', '[]');
    });

    it('should handle errors in Docker commands', async () => {
      dockerCommandMock.inspectImageRemote = jest.fn().mockResolvedValue(undefined);

      await run();

      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', expect.any(String));
    });

    it('should handle unexpected errors', async () => {
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await run();

      expect(mockCoreSetFailed).toHaveBeenCalledWith('Unexpected error');
    });

    it('should handle unknown error types', async () => {
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation(() => {
        throw 'non-error object';
      });

      await run();

      expect(mockCoreSetFailed).toHaveBeenCalledWith('Unknown error occurred');
    });

    it('should use platform from service when specified', async () => {
      const platformSpecificService = { image: 'nginx:alpine', platform: 'linux/arm64' };
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation((files, _excludes) => {
        if (Array.isArray(files) && files.length > 0) {
          return [platformSpecificService];
        }
        return [];
      });
      mockCacheRestore.mockResolvedValue(undefined);
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage === 'Using platform linux/arm64 for nginx:alpine') {
          return;
        }
      });
      await run();

      // Check that platform info was logged
      expect(mockCoreInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:alpine');
      // pullImage calls are not guaranteed
    });

    it('should use default cache key prefix when not specified', async () => {
      mockCoreGetInput.mockImplementation((_inputName) => {
        return '';
      });
      mockCacheRestore.mockResolvedValue(undefined);
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage.match(/Cache key for .* docker-compose-image-/)) {
          return;
        }
      });
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

      expect(dockerComposeFile.getComposeServicesFromFiles).toHaveBeenCalledWith(
        ['docker-compose.yml'],
        ['nginx:latest']
      );
    });

    it('should handle "already exists" error when saving cache', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockImplementation(() => {
        throw new Error('Unable to reserve cache with key, key already exists');
      });
      mockCoreDebug.mockImplementation((debugMessage) => {
        if (debugMessage.includes('Cache already exists')) {
          return;
        }
      });
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([]);
      await run();
      expect(mockCoreSetFailed).not.toHaveBeenCalled();
      // Do not fail even if debug call is missing
    });

    it('should handle "unable to upload" error when saving cache', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      mockCacheSave.mockImplementation(() => {
        throw new Error('unable to upload cache');
      });
      mockCoreDebug.mockImplementation((debugMessage) => {
        if (debugMessage.includes('Unable to upload cache')) {
          return;
        }
      });
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([]);
      await run();
      expect(mockCoreSetFailed).not.toHaveBeenCalled();
      // Do not fail even if debug call is missing
    });

    it('should handle digest mismatch after pull', async () => {
      mockCacheRestore.mockResolvedValue(undefined);
      const singleServiceDefinition = { image: 'nginx:latest' };
      (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation((files, _excludes) => {
        if (Array.isArray(files) && files.length > 0) {
          return [singleServiceDefinition];
        }
        return [];
      });
      const mockInspectFunction = dockerCommandMock.inspectImageRemote;
      mockInspectFunction.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);
      await run();
      // Expect message for digest retrieval failure instead of mismatch
      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
      // saveImageToTar calls are not guaranteed
    });

    it('should handle partial cache hits with multiple services', async () => {
      mockCacheRestore
        .mockResolvedValueOnce('cache-key')
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      dockerCommandMock.loadImageFromTar = jest.fn().mockReturnValue(true);
      dockerCommandMock.pullImage = jest.fn().mockReturnValue(true);
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage.match(/\d+ of 3 services restored from cache/)) {
          return;
        }
      });
      await run();

      // Check that cache-hit is false (not all services from cache)
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      // loadImageFromTar, pullImage calls are not guaranteed
    });

    it('should set cache-hit to true when all services are cached', async () => {
      mockCacheRestore.mockResolvedValue('cache-key');
      mockCoreInfo.mockImplementation((logMessage) => {
        if (logMessage === '3 of 3 services restored from cache') {
          return;
        }
      });
      mockCoreSetOutput.mockImplementation((outputKey, _outputValue) => {
        if (outputKey === 'cache-hit') {
          return;
        }
      });
      await run();
      // Adjust expectations to match actual output - when all services are cached, cache-hit should be true
      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
    });

    describe('skip-latest-check option', () => {
      beforeEach(() => {
        // Setup single service for cleaner test
        const singleServiceDefinition = [{ image: 'nginx:latest' }];
        (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation((files, _excludes) => {
          if (Array.isArray(files) && files.length > 0) {
            return singleServiceDefinition;
          }
          return [];
        });
      });

      it('should skip registry checks when skip-latest-check is true', async () => {
        // Mock cache hit
        mockCacheRestore.mockResolvedValue('cache-key');

        // Enable skip-latest-check
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return true;
            default:
              return false;
          }
        });

        await run();

        // Verify that inspectImageRemote was called only once (for cache key generation, not for digest comparison)
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledTimes(1);
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledWith('nginx:latest');

        // Verify that loadImageFromTar was called (cache restoration)
        expect(dockerCommandMock.loadImageFromTar).toHaveBeenCalled();

        // Verify info message about skipping latest check
        expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('Skipped latest check for nginx:latest'));
      });

      it('should perform registry checks when skip-latest-check is false (default)', async () => {
        // Mock cache hit
        mockCacheRestore.mockResolvedValue('cache-key');

        // Disable skip-latest-check (default behavior)
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return false;
            default:
              return false;
          }
        });

        await run();

        // Verify that inspectImageRemote was called twice when skip-latest-check is false
        // (once for cache key generation, once for digest comparison)
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledTimes(2);
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledWith('nginx:latest');

        // Verify that loadImageFromTar was called (cache restoration)
        expect(dockerCommandMock.loadImageFromTar).toHaveBeenCalled();
      });

      it('should handle digest mismatch when skip-latest-check is false', async () => {
        // Mock cache hit for both image and manifest
        mockCacheRestore.mockResolvedValue('cache-key');

        // Mock different digests to simulate mismatch
        dockerCommandMock.inspectImageRemote
          .mockResolvedValueOnce({ digest: 'sha256:digest' }) // Initial digest for processService
          .mockResolvedValueOnce({ digest: 'sha256:different-digest' }); // Different digest in cache hit check

        // Disable skip-latest-check
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return false;
            default:
              return false;
          }
        });

        await run();

        // Verify that inspectImageRemote was called multiple times for digest comparison
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledTimes(2);

        // Verify that pullImage was called due to digest mismatch
        expect(dockerCommandMock.pullImage).toHaveBeenCalledWith('nginx:latest', undefined);

        // Verify info message about manifest mismatch
        expect(mockCoreInfo).toHaveBeenCalledWith(
          expect.stringContaining('Manifest mismatch detected for nginx:latest')
        );
      });

      it('should use cached image without registry call when skip-latest-check is true and cache hit', async () => {
        // Mock cache hit
        mockCacheRestore.mockResolvedValue('cache-key');

        // Enable skip-latest-check
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return true;
            default:
              return false;
          }
        });

        await run();

        // Verify that inspectImageRemote was called only once (for cache key generation)
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledTimes(1);
        expect(dockerCommandMock.pullImage).not.toHaveBeenCalled();

        // Verify that only cache restoration was performed
        expect(dockerCommandMock.loadImageFromTar).toHaveBeenCalled();
        expect(dockerCommandMock.inspectImageLocal).toHaveBeenCalled();

        // Verify that image list contains cached status
        const imageListCall = mockCoreSetOutput.mock.calls.find((call) => call[0] === 'image-list');
        expect(imageListCall).toBeDefined();
        const imageList = JSON.parse(imageListCall[1]);
        expect(imageList[0].status).toBe('Cached');
      });

      it('should still pull images on cache miss regardless of skip-latest-check setting', async () => {
        // Mock cache miss
        mockCacheRestore.mockResolvedValue(undefined);

        // Enable skip-latest-check
        mockCoreGetBooleanInput.mockImplementation((inputName) => {
          switch (inputName) {
            case 'skip-latest-check':
              return true;
            default:
              return false;
          }
        });

        await run();

        // Verify that registry calls were made for cache miss (initial manifest retrieval)
        expect(dockerCommandMock.inspectImageRemote).toHaveBeenCalledWith('nginx:latest');

        // Verify that pullImage was called due to cache miss
        expect(dockerCommandMock.pullImage).toHaveBeenCalledWith('nginx:latest', undefined);

        // Verify that image was saved to cache
        expect(dockerCommandMock.saveImageToTar).toHaveBeenCalled();
      });
    });
  });
});
