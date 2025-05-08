import * as cache from '@actions/cache';
import * as core from '@actions/core';

import * as dockerCommand from '../src/docker-command';
import * as dockerComposeFile from '../src/docker-compose-file';
import * as platform from '../src/platform';

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

jest.mock('../src/platform');
jest.mock('../src/docker-command');
jest.mock('../src/docker-compose-file');

import { run } from '../src/main';

jest.mock('../src/path-utils', () => {
  return {
    sanitizePathComponent: jest.fn((inputString) => inputString),
  };
});

describe('Main Module', () => {
  const mockCoreGetInput = core.getInput as jest.Mock;
  const mockCoreGetMultilineInput = core.getMultilineInput as jest.Mock;
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

    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue('sha256:digest');
    (dockerCommand.pullImage as jest.Mock).mockResolvedValue(true);
    (dockerCommand.saveImageToTar as jest.Mock).mockResolvedValue(true);
    (dockerCommand.loadImageFromTar as jest.Mock).mockResolvedValue(true);

    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue(mockServiceDefinitions);

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

    // Set specific messages to be returned
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage.includes('Cache key for')) {
        return;
      }
    });

    await run();

    expect(dockerComposeFile.getComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], []);
    expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');

    // Test for JSON image-list output format
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

    expect(dockerCommand.getImageDigest).toHaveBeenCalled();
    // Since platform info is now added, check that the call was made with any string platform instead of undefined
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:latest', expect.any(String));
    // Verify platform is passed correctly for platform-specific service
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('node:alpine', 'linux/arm64');
    expect(dockerCommand.saveImageToTar).toHaveBeenCalled();
  });

  it('should handle cache hits', async () => {
    mockCacheRestore.mockResolvedValue('cache-key');

    // Simulate cache hit messages
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage.includes('Cache hit for')) {
        return;
      }
    });

    await run();

    expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('Cache hit for'));
    expect(dockerCommand.loadImageFromTar).toHaveBeenCalled();
    expect(dockerCommand.pullImage).not.toHaveBeenCalled();
  });

  it('should report no services found when compose file is empty', async () => {
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([]);

    await run();

    expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringContaining('No Docker services found'));
    expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(mockCoreSetOutput).toHaveBeenCalledWith('image-list', '[]');
  });

  it('should handle errors in Docker commands', async () => {
    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue(undefined);

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

  it('should use platform from service when specified', async () => {
    const platformSpecificService = { image: 'nginx:alpine', platform: 'linux/arm64' };
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([platformSpecificService]);
    mockCacheRestore.mockResolvedValue(undefined);

    // Simulate platform messages
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage === 'Using platform linux/arm64 for nginx:alpine') {
        return;
      }
    });

    await run();

    expect(mockCoreInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:alpine');
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:alpine', 'linux/arm64');
  });

  it('should use default cache key prefix when not specified', async () => {
    mockCoreGetInput.mockImplementation((_inputName) => {
      return '';
    });
    mockCacheRestore.mockResolvedValue(undefined);

    // Simulate cache key messages
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage.match(/Cache key for .* docker-compose-image-/)) {
        return;
      }
    });

    await run();

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

    // Simulate debug messages
    mockCoreDebug.mockImplementation((debugMessage) => {
      if (debugMessage.includes('Cache already exists')) {
        return;
      }
    });

    await run();

    expect(mockCoreSetFailed).not.toHaveBeenCalled();
    expect(mockCoreDebug).toHaveBeenCalledWith(expect.stringContaining('Cache already exists'));
  });

  it('should handle "unable to upload" error when saving cache', async () => {
    mockCacheRestore.mockResolvedValue(undefined);
    mockCacheSave.mockImplementation(() => {
      throw new Error('unable to upload cache');
    });

    // Simulate debug messages
    mockCoreDebug.mockImplementation((debugMessage) => {
      if (debugMessage.includes('Unable to upload cache')) {
        return;
      }
    });

    await run();

    expect(mockCoreSetFailed).not.toHaveBeenCalled();
    expect(mockCoreDebug).toHaveBeenCalledWith(expect.stringContaining('Unable to upload cache'));
  });

  it('should handle digest mismatch after pull', async () => {
    mockCacheRestore.mockResolvedValue(undefined);
    const singleServiceDefinition = { image: 'nginx:latest' };
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([singleServiceDefinition]);

    const mockDigestFunction = dockerCommand.getImageDigest as jest.Mock;
    mockDigestFunction.mockResolvedValueOnce('sha256:original').mockResolvedValueOnce('sha256:different');

    await run();

    expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Digest mismatch'));
    expect(dockerCommand.saveImageToTar).not.toHaveBeenCalled();
  });

  it('should handle partial cache hits with multiple services', async () => {
    mockCacheRestore
      .mockResolvedValueOnce('cache-key')
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    // Explicitly set mocks for loadImageFromTar and pullImage
    (dockerCommand.loadImageFromTar as jest.Mock).mockReturnValue(true);
    (dockerCommand.pullImage as jest.Mock).mockReturnValue(true);

    // Simulate service restoration messages
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage.match(/\d+ of 3 services restored from cache/)) {
        return;
      }
    });

    await run();

    expect(dockerCommand.loadImageFromTar).toHaveBeenCalled();
    expect(dockerCommand.pullImage).toHaveBeenCalled();
    expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(mockCoreInfo).toHaveBeenCalledWith(expect.stringMatching(/\d+ of 3 services restored from cache/));
  });

  it('should set cache-hit to true when all services are cached', async () => {
    mockCacheRestore.mockResolvedValue('cache-key');

    // Simulate service restoration messages
    mockCoreInfo.mockImplementation((logMessage) => {
      if (logMessage === '3 of 3 services restored from cache') {
        return;
      }
    });

    // Set output for cache-hit
    mockCoreSetOutput.mockImplementation((outputKey, _outputValue) => {
      if (outputKey === 'cache-hit') {
        return;
      }
    });

    await run();

    expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
    expect(mockCoreInfo).toHaveBeenCalledWith('3 of 3 services restored from cache');
  });
});
