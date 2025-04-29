import * as cacheWrapper from '../src/actions/cache-wrapper';
import * as coreWrapper from '../src/actions/core-wrapper';
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

jest.mock('../src/actions/core-wrapper', () => {
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
      write: jest.fn().mockResolvedValue(undefined),
    },
  };
});

jest.mock('../src/actions/cache-wrapper', () => {
  return {
    restoreCache: jest.fn(),
    saveCache: jest.fn(),
  };
});

jest.mock('../src/platform');
jest.mock('../src/docker-command');
jest.mock('../src/docker-compose-file');

import { run } from '../src/main';

describe('Main Module', () => {
  const mockGetInput = coreWrapper.getInput as jest.Mock;
  const mockGetMultilineInput = coreWrapper.getMultilineInput as jest.Mock;
  const mockSetOutput = coreWrapper.setOutput as jest.Mock;
  const mockInfo = coreWrapper.info as jest.Mock;
  const mockWarning = coreWrapper.warning as jest.Mock;
  const mockSetFailed = coreWrapper.setFailed as jest.Mock;
  const mockRestoreCache = cacheWrapper.restoreCache as jest.Mock;
  const mockSaveCache = cacheWrapper.saveCache as jest.Mock;

  const mockServices = [
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

    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue('sha256:1234567890abcdef');
    (dockerCommand.pullImage as jest.Mock).mockResolvedValue(true);
    (dockerCommand.saveImageToTar as jest.Mock).mockResolvedValue(true);
    (dockerCommand.loadImageFromTar as jest.Mock).mockResolvedValue(true);

    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue(mockServices);

    mockGetInput.mockImplementation((_name) => {
      switch (_name) {
        case 'cache-key-prefix':
          return 'test-cache';
        default:
          return '';
      }
    });

    mockGetMultilineInput.mockImplementation((_name) => {
      switch (_name) {
        case 'compose-files':
          return ['docker-compose.yml'];
        case 'exclude-images':
          return [];
        default:
          return [];
      }
    });

    process.env.RUNNER_TEMP = '/tmp';
  });

  it('should process services and set outputs', async () => {
    mockRestoreCache.mockResolvedValue(null);
    mockSaveCache.mockResolvedValue(123);

    await run();

    expect(dockerComposeFile.getComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], []);
    expect(mockSetOutput).toHaveBeenCalledWith('image-list', expect.stringContaining('nginx:latest'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(dockerCommand.getImageDigest).toHaveBeenCalled();
    // Since platform info is now added, check that the call was made with any string platform instead of undefined
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:latest', expect.any(String));
    // Verify platform is passed correctly for platform-specific service
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('node:alpine', 'linux/arm64');
    expect(dockerCommand.saveImageToTar).toHaveBeenCalled();
  });

  it('should handle cache hits', async () => {
    mockRestoreCache.mockResolvedValue('cache-key');

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Cache hit for'));
    expect(dockerCommand.loadImageFromTar).toHaveBeenCalled();
    expect(dockerCommand.pullImage).not.toHaveBeenCalled();
  });

  it('should report no services found when compose file is empty', async () => {
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([]);

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('No Docker services found'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(mockSetOutput).toHaveBeenCalledWith('image-list', '');
  });

  it('should handle errors in Docker commands', async () => {
    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue(null);

    await run();

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', expect.any(String));
  });

  it('should handle unexpected errors', async () => {
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    await run();

    expect(mockSetFailed).toHaveBeenCalledWith('Unexpected error');
  });

  it('should use platform from service when specified', async () => {
    const platformService = { image: 'nginx:alpine', platform: 'linux/arm64' };
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([platformService]);
    mockRestoreCache.mockResolvedValue(null);

    await run();

    expect(mockInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:alpine');
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:alpine', 'linux/arm64');
  });

  it('should use default cache key prefix when not specified', async () => {
    mockGetInput.mockImplementation((_name) => {
      return '';
    });
    mockRestoreCache.mockResolvedValue(null);

    await run();

    expect(mockInfo).toHaveBeenCalledWith(expect.stringMatching(/Cache key for .* docker-compose-image-/));
  });

  it('should exclude specified images from processing', async () => {
    mockGetMultilineInput.mockImplementation((_name) => {
      switch (_name) {
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
    mockRestoreCache.mockResolvedValue(null);
    mockSaveCache.mockImplementation(() => {
      throw new Error('Unable to reserve cache with key, key already exists');
    });

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(coreWrapper.debug).toHaveBeenCalledWith(expect.stringContaining('Cache already exists'));
  });

  it('should handle "unable to upload" error when saving cache', async () => {
    mockRestoreCache.mockResolvedValue(null);
    mockSaveCache.mockImplementation(() => {
      throw new Error('unable to upload cache');
    });

    await run();

    expect(mockSetFailed).not.toHaveBeenCalled();
    expect(coreWrapper.debug).toHaveBeenCalledWith(expect.stringContaining('Unable to upload cache'));
  });

  it('should handle digest mismatch after pull', async () => {
    mockRestoreCache.mockResolvedValue(null);
    const singleService = { image: 'nginx:latest' };
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([singleService]);

    const mockGetImageDigest = dockerCommand.getImageDigest as jest.Mock;
    mockGetImageDigest.mockResolvedValueOnce('sha256:original').mockResolvedValueOnce('sha256:different');

    await run();

    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('Digest mismatch'));
    expect(dockerCommand.saveImageToTar).not.toHaveBeenCalled();
  });

  it('should handle partial cache hits with multiple services', async () => {
    mockRestoreCache.mockResolvedValueOnce('cache-key').mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await run();

    expect(dockerCommand.loadImageFromTar).toHaveBeenCalled();
    expect(dockerCommand.pullImage).toHaveBeenCalled();
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(mockInfo).toHaveBeenCalledWith(expect.stringMatching(/\d+ of 3 services restored from cache/));
  });

  it('should set cache-hit to true when all services are cached', async () => {
    mockRestoreCache.mockResolvedValue('cache-key');

    await run();

    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
    expect(mockInfo).toHaveBeenCalledWith('3 of 3 services restored from cache');
  });
});
