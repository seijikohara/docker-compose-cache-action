import { actionCore, actionCache } from '../src/actions-wrapper';
import * as platform from '../src/platform';
import * as dockerCommand from '../src/docker-command';
import * as dockerComposeFile from '../src/docker-compose-file';

// Mock the main module to prevent automatic execution
jest.mock('../src/main', () => {
  const originalModule = jest.requireActual('../src/main');
  return {
    ...originalModule,
    // Mock the run function to prevent automatic execution
    run: jest.fn().mockImplementation(originalModule.run),
  };
});

// Mock dependencies
jest.mock('../src/actions-wrapper', () => {
  return {
    actionCore: {
      getInput: jest.fn(),
      getMultilineInput: jest.fn(), // Added for multiline inputs
      setOutput: jest.fn(),
      info: jest.fn(),
      warning: jest.fn(),
      debug: jest.fn(),
      setFailed: jest.fn(),
    },
    actionCache: {
      restoreCache: jest.fn(),
      saveCache: jest.fn(),
    },
  };
});
jest.mock('../src/platform');
jest.mock('../src/docker-command');
jest.mock('../src/docker-compose-file');

// Import the run function after mocks are set
import { run } from '../src/main';

describe('Main Module', () => {
  // Common mocks
  const mockGetInput = actionCore.getInput as jest.Mock;
  const mockGetMultilineInput = actionCore.getMultilineInput as jest.Mock;
  const mockSetOutput = actionCore.setOutput as jest.Mock;
  const mockInfo = actionCore.info as jest.Mock;
  const mockWarning = actionCore.warning as jest.Mock;
  const mockSetFailed = actionCore.setFailed as jest.Mock;
  const mockRestoreCache = actionCache.restoreCache as jest.Mock;
  const mockSaveCache = actionCache.saveCache as jest.Mock;

  // Mock services including one with platform specification
  const mockServices = [
    { image: 'nginx:latest' },
    { image: 'redis:alpine' },
    { image: 'node:alpine', platform: 'linux/arm64' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock platform information
    (platform.getCurrentPlatformInfo as jest.Mock).mockReturnValue({
      os: 'linux',
      arch: 'amd64',
    });
    (platform.sanitizePlatformComponent as jest.Mock).mockImplementation((comp) => comp || 'none');

    // Mock Docker command functions
    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue('sha256:1234567890abcdef');
    (dockerCommand.pullImage as jest.Mock).mockResolvedValue(true);
    (dockerCommand.saveImageToTar as jest.Mock).mockResolvedValue(true);
    (dockerCommand.loadImageFromTar as jest.Mock).mockResolvedValue(true);

    // Mock Docker Compose file parsing
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue(mockServices);

    // Setup default inputs
    mockGetInput.mockImplementation((name) => {
      switch (name) {
        case 'cache-key-prefix':
          return 'test-cache';
        default:
          return '';
      }
    });

    // Setup multiline inputs
    mockGetMultilineInput.mockImplementation((name) => {
      switch (name) {
        case 'compose-files':
          return ['docker-compose.yml'];
        case 'exclude-images':
          return [];
        default:
          return [];
      }
    });

    // Ensure process.env.RUNNER_TEMP exists
    process.env.RUNNER_TEMP = '/tmp';
  });

  /**
   * Tests successful processing of services
   */
  it('should process services and set outputs', async () => {
    // Set up the mocks for a successful run with cache miss
    mockRestoreCache.mockResolvedValue(null);
    mockSaveCache.mockResolvedValue(123);

    // Explicitly run the function
    await run();

    // Verify getComposeServicesFromFiles was called correctly
    expect(dockerComposeFile.getComposeServicesFromFiles).toHaveBeenCalledWith(['docker-compose.yml'], []);

    // Verify outputs are set correctly
    expect(mockSetOutput).toHaveBeenCalledWith('image-list', expect.stringContaining('nginx:latest'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');

    // Verify Docker commands were called as expected
    expect(dockerCommand.getImageDigest).toHaveBeenCalled();
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:latest', undefined);
    // Verify platform is passed correctly for platform-specific service
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('node:alpine', 'linux/arm64');
    expect(dockerCommand.saveImageToTar).toHaveBeenCalled();
  });

  /**
   * Tests behavior when cache hits occur
   */
  it('should handle cache hits', async () => {
    // Set up mock for cache hit
    mockRestoreCache.mockResolvedValue('cache-key');

    // Run the function
    await run();

    // Verify cache hit behavior
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('Cache hit for'));
    expect(dockerCommand.loadImageFromTar).toHaveBeenCalled();
    // No pull should occur on cache hit
    expect(dockerCommand.pullImage).not.toHaveBeenCalled();
  });

  /**
   * Tests behavior when no services are found
   */
  it('should report no services found when compose file is empty', async () => {
    // Mock empty service list
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([]);

    // Run the function
    await run();

    // Verify empty service list handling
    expect(mockInfo).toHaveBeenCalledWith(expect.stringContaining('No Docker services found'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
    expect(mockSetOutput).toHaveBeenCalledWith('image-list', '');
  });

  /**
   * Tests error handling in Docker commands
   */
  it('should handle errors in Docker commands', async () => {
    // Mock failed getImageDigest
    (dockerCommand.getImageDigest as jest.Mock).mockResolvedValue(null);

    // Run the function
    await run();

    // Verify error handling
    expect(mockWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
    expect(mockSetOutput).toHaveBeenCalledWith('cache-hit', expect.any(String));
  });

  /**
   * Tests handling of unexpected exceptions
   */
  it('should handle unexpected errors', async () => {
    // Mock unexpected error
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockImplementation(() => {
      throw new Error('Unexpected error');
    });

    // Run the function
    await run();

    // Verify error reporting
    expect(mockSetFailed).toHaveBeenCalledWith('Unexpected error');
  });

  /**
   * Tests handling of platform-specific services
   */
  it('should use platform from service when specified', async () => {
    // Mock a service with platform specified
    const platformService = { image: 'nginx:alpine', platform: 'linux/arm64' };
    (dockerComposeFile.getComposeServicesFromFiles as jest.Mock).mockReturnValue([platformService]);

    // Set up cache miss
    mockRestoreCache.mockResolvedValue(null);

    // Run the function
    await run();

    // Verify platform handling
    expect(mockInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:alpine');
    expect(dockerCommand.pullImage).toHaveBeenCalledWith('nginx:alpine', 'linux/arm64');
  });
});
