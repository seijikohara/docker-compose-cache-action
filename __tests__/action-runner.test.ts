import * as fs from 'fs';
import * as path from 'path';

// Mock standard libraries - must be before imports to avoid fs.promises issues
jest.mock('fs');
jest.mock('path');
jest.mock('crypto');

// Mock @actions/core
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
  setOutput: jest.fn(),
  getInput: jest.fn(),
  getMultilineInput: jest.fn(),
}));

// Mock @actions/exec
jest.mock('@actions/exec', () => ({
  exec: jest.fn(),
  getExecOutput: jest.fn(),
}));

// Mock @actions/cache
jest.mock('@actions/cache', () => ({
  restoreCache: jest.fn(),
  saveCache: jest.fn(),
}));

// Import libraries after mocks are set up
import * as core from '@actions/core';

// Import project modules
import { ActionRunner } from '../src/action-runner';
import { CacheManager } from '../src/cache-manager';
import { DockerBuildxCommand } from '../src/docker/docker-buildx-command';
import { DockerCommand } from '../src/docker/docker-command';
import { ImageManifestParser } from '../src/docker/image-manifest-parser';

// Mock project modules
jest.mock('../src/docker/docker-command');
jest.mock('../src/cache-manager');
jest.mock('../src/docker/docker-buildx-command');

// Setup mock for DockerComposeFileParser
const mockGetImageList = jest
  .fn()
  .mockReturnValue([{ imageName: 'image1:latest', platform: 'linux/amd64' }, { imageName: 'image2:latest' }]);

jest.mock('../src/docker/docker-compose-file-parser', () => {
  return {
    DockerComposeFileParser: jest.fn().mockImplementation(() => {
      return {
        getImageList: mockGetImageList,
      };
    }),
  };
});

jest.mock('../src/platform', () => ({
  normalizePlatform: jest.fn((platform) => (platform ? platform.replace(/\//g, '_') : 'unknown_platform')),
  getCurrentOciPlatform: jest.fn(() => 'linux/amd64'),
}));

// Type definition for private methods
type PrivateMethods = {
  determineComposeFiles: () => string[];
  calculateFilesHash: () => string;
};

describe('ActionRunner', () => {
  // Mock implementations for dependencies
  let mockDockerCommand: jest.Mocked<DockerCommand>;
  let mockCacheManager: jest.Mocked<CacheManager>;
  let mockDockerBuildxCommand: jest.Mocked<DockerBuildxCommand>;
  let actionRunner: ActionRunner;

  // Environment setup
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup environment variables
    process.env = {
      ...originalEnv,
      RUNNER_OS: 'Linux',
      RUNNER_TEMP: '/tmp',
    };

    // Setup core input values
    (core.getInput as jest.Mock).mockImplementation((name) => {
      if (name === 'cache-key-prefix') return 'docker-compose-cache';
      return '';
    });

    (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
      if (name === 'compose-files') return ['docker-compose.yml'];
      if (name === 'exclude-images') return [];
      return [];
    });

    // Setup fs mock
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue('mock-file-content');

    // Mock path.join to return predictable paths
    (path.join as jest.Mock).mockImplementation((...args) => args.join('/'));

    // Setup docker command mocks
    mockDockerCommand = new DockerCommand() as jest.Mocked<DockerCommand>;
    mockDockerCommand.pull.mockResolvedValue();
    mockDockerCommand.load.mockResolvedValue();
    mockDockerCommand.save.mockResolvedValue();
    mockDockerCommand.getDigest.mockResolvedValue('sha256:1234567890abcdef');

    // Setup cache manager mock
    mockCacheManager = new CacheManager() as jest.Mocked<CacheManager>;
    mockCacheManager.restore.mockResolvedValue(false);
    mockCacheManager.save.mockResolvedValue();

    // Setup docker buildx command mock
    mockDockerBuildxCommand = new DockerBuildxCommand(new ImageManifestParser()) as jest.Mocked<DockerBuildxCommand>;
    mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:1234567890abcdef');

    // Create action runner instance with mocked dependencies
    actionRunner = new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);

    // Mock private methods in ActionRunner
    jest
      .spyOn(actionRunner as unknown as PrivateMethods, 'determineComposeFiles')
      .mockReturnValue(['docker-compose.yml']);
    jest.spyOn(actionRunner as unknown as PrivateMethods, 'calculateFilesHash').mockReturnValue('filehash123');
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
  });

  describe('constructor', () => {
    describe('normal cases', () => {
      it('should create an instance with default values', () => {
        // Act & Assert - using actionRunner instance created in beforeEach
        expect(actionRunner).toBeInstanceOf(ActionRunner);
        expect(core.getInput).toHaveBeenCalledWith('cache-key-prefix', expect.any(Object));
        expect(core.getMultilineInput).toHaveBeenCalledWith('compose-files');
        expect(core.getMultilineInput).toHaveBeenCalledWith('exclude-images');
      });

      it('should handle exclude-images input', () => {
        // Arrange
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return ['docker-compose.yml'];
          if (name === 'exclude-images') return ['redis:latest', 'postgres:13'];
          return [];
        });

        // Act - create new instance to trigger constructor
        new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);

        // Assert
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Excluding images: redis:latest, postgres:13'));
      });
    });

    describe('edge cases', () => {
      it('should find default compose file when none specified', () => {
        // Arrange
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return [];
          return [];
        });

        // Reset core.info mock to track calls specifically for this test
        (core.info as jest.Mock).mockClear();

        // Mock findDefaultComposeFile to return a file
        (fs.existsSync as jest.Mock).mockImplementation((file) => file === 'docker-compose.yml');

        // Create instance but we don't need to keep reference - we only care about side effects
        new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);

        // Assert
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('Using automatically found compose file'));
      });

      it('should handle custom compose file paths', () => {
        // Arrange
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return ['custom/path/compose.yml', 'another/docker-compose.yaml'];
          return [];
        });

        // Act - create new instance to trigger constructor
        new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);

        // Assert
        expect(core.info).toHaveBeenCalledWith(
          expect.stringContaining('Using specified compose files: custom/path/compose.yml, another/docker-compose.yaml')
        );
      });
    });

    describe('error cases', () => {
      it('should throw error when specified compose file does not exist', () => {
        // Arrange
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return ['non-existent.yml'];
          return [];
        });
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Act & Assert
        expect(() => new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand)).toThrow(
          'Specified compose file not found: non-existent.yml'
        );
      });

      it('should throw error when no default compose files found', () => {
        // Arrange - empty compose files input
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return [];
          return [];
        });

        // Mock that no files exist
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Ensure we don't use the mocked constructor from beforeEach
        jest.spyOn(ActionRunner.prototype as unknown as PrivateMethods, 'determineComposeFiles').mockRestore();

        // Act & Assert
        expect(() => new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand)).toThrow(
          'No default compose files found.'
        );
      });
    });
  });

  describe('run', () => {
    describe('normal cases', () => {
      it('should process all images and set output when all steps succeed', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:1234567890abcdef');
        mockCacheManager.restore.mockResolvedValue(false); // Simulate cache miss

        // Act
        await actionRunner.run();

        // Assert
        expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
        expect(core.setOutput).toHaveBeenCalledWith('image-list', expect.any(String));
        expect(mockDockerCommand.pull).toHaveBeenCalled();
        expect(mockDockerCommand.save).toHaveBeenCalled();
        expect(mockCacheManager.save).toHaveBeenCalled();
      });

      it('should handle cache hit scenario', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:1234567890abcdef');
        mockCacheManager.restore.mockResolvedValue(true); // Simulate cache hit

        // Act
        await actionRunner.run();

        // Assert
        expect(mockDockerCommand.load).toHaveBeenCalled();
        expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'true');
        expect(mockDockerCommand.pull).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      it('should handle empty image list', async () => {
        // Arrange - Mock getImageList to return empty array
        mockGetImageList.mockReturnValueOnce([]);

        // Act
        await actionRunner.run();

        // Assert
        expect(core.info).toHaveBeenCalledWith(expect.stringContaining('No images to process'));
        expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
        expect(core.setOutput).toHaveBeenCalledWith('image-list', '');
      });

      it('should handle excluded images', async () => {
        // Setup excluded images
        (core.getMultilineInput as jest.Mock).mockImplementation((name) => {
          if (name === 'compose-files') return ['docker-compose.yml'];
          if (name === 'exclude-images') return ['image1:latest'];
          return [];
        });

        // Create new action runner with updated mock
        actionRunner = new ActionRunner(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);

        // Re-mock private methods
        jest
          .spyOn(actionRunner as unknown as PrivateMethods, 'determineComposeFiles')
          .mockReturnValue(['docker-compose.yml']);
        jest.spyOn(actionRunner as unknown as PrivateMethods, 'calculateFilesHash').mockReturnValue('filehash123');

        // Mock getRemoteDigest to track calls for different images
        mockDockerBuildxCommand.getRemoteDigest.mockImplementation((_imageName, _platform) => {
          return Promise.resolve('sha256:1234567890abcdef');
        });

        // Act
        await actionRunner.run();

        // Assert - should only process image2, not image1
        expect(mockDockerBuildxCommand.getRemoteDigest).not.toHaveBeenCalledWith('image1:latest', expect.anything());
        // platform is undefined for the second element, so adjust the expectation accordingly
        expect(mockDockerBuildxCommand.getRemoteDigest).toHaveBeenCalledWith('image2:latest', undefined);
      });
    });

    describe('error cases', () => {
      it('should handle digest fetch failure', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue(null); // Simulate failed digest fetch

        // Act
        await actionRunner.run();

        // Assert
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not retrieve digest for any image'));
        expect(core.setOutput).toHaveBeenCalledWith('cache-hit', 'false');
      });

      it('should handle image load failure', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:1234567890abcdef');
        mockCacheManager.restore.mockResolvedValue(true); // Cache hit
        mockDockerCommand.load.mockRejectedValue(new Error('Load failed')); // Load fails

        // Act
        await actionRunner.run();

        // Assert
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to load'));
        expect(mockDockerCommand.pull).toHaveBeenCalled(); // Should fall back to pulling
      });

      it('should handle pull failure', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:1234567890abcdef');
        mockCacheManager.restore.mockResolvedValue(false); // Cache miss
        mockDockerCommand.pull.mockRejectedValue(new Error('Pull failed')); // Pull fails

        // Act
        await actionRunner.run();

        // Assert
        expect(core.error).toHaveBeenCalledWith(expect.stringContaining('Failed to pull image'));
        expect(mockDockerCommand.save).not.toHaveBeenCalled(); // Shouldn't try to save
      });

      it('should handle digest mismatch after pull', async () => {
        // Arrange
        mockDockerBuildxCommand.getRemoteDigest.mockResolvedValue('sha256:remoteDigest');
        mockCacheManager.restore.mockResolvedValue(false); // Cache miss
        mockDockerCommand.pull.mockResolvedValue();
        mockDockerCommand.getDigest.mockResolvedValue('sha256:differentDigest'); // Different digest

        // Act
        await actionRunner.run();

        // Assert
        expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Digest check failed after pulling'));
        expect(mockCacheManager.save).not.toHaveBeenCalled(); // Shouldn't save cache for mismatched digest
      });
    });
  });
});
