import * as core from '@actions/core';
import { ActionRunner } from '../src/action-runner';
import { CacheManager } from '../src/cache-manager';
import { main } from '../src/main';
import { DockerBuildxCommand } from '../src/docker/docker-buildx-command';
import { DockerCommand } from '../src/docker/docker-command';
import { ImageManifestParser } from '../src/docker/image-manifest-parser';

// Mock dependencies
jest.mock('@actions/core');
jest.mock('../src/action-runner');
jest.mock('../src/cache-manager');
jest.mock('../src/docker/docker-command');
jest.mock('../src/docker/docker-buildx-command');
jest.mock('../src/docker/image-manifest-parser');

describe('Main Entry Point', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    describe('normal case', () => {
      it('should create instances of all required dependencies', async () => {
        // Act - Trigger main function execution
        await main();

        // Assert - Verify constructor calls
        expect(DockerCommand).toHaveBeenCalledTimes(1);
        expect(CacheManager).toHaveBeenCalledTimes(1);
        expect(ImageManifestParser).toHaveBeenCalledTimes(1);
        expect(DockerBuildxCommand).toHaveBeenCalledTimes(1);
      });

      it('should pass correct dependencies to DockerBuildxCommand', async () => {
        // Act
        await main();

        // Assert - Verify correct dependency injection
        expect(DockerBuildxCommand).toHaveBeenCalledWith(expect.any(Object));
      });

      it('should create ActionRunner with all dependencies', async () => {
        // Act
        await main();

        // Assert - Verify ActionRunner initialization
        expect(ActionRunner).toHaveBeenCalledWith(expect.any(Object), expect.any(Object), expect.any(Object));
      });

      it('should call run method on ActionRunner instance', async () => {
        // Arrange
        const mockRunMethod = jest.fn();
        (ActionRunner as jest.Mock).mockImplementation(() => ({
          run: mockRunMethod,
        }));

        // Act
        await main();

        // Assert
        expect(mockRunMethod).toHaveBeenCalledTimes(1);
      });
    });

    describe('edge case', () => {
      it('should handle ActionRunner instantiation with proper parameter order', async () => {
        // Act
        await main();

        // Assert - Verify exact parameter order (docker, cache, buildx)
        const mockDockerCommand = (DockerCommand as jest.Mock).mock.instances[0];
        const mockCacheManager = (CacheManager as jest.Mock).mock.instances[0];
        const mockDockerBuildxCommand = (DockerBuildxCommand as jest.Mock).mock.instances[0];

        expect(ActionRunner).toHaveBeenCalledWith(mockDockerCommand, mockCacheManager, mockDockerBuildxCommand);
      });
    });

    describe('error case', () => {
      it('should call setFailed when ActionRunner throws an error', async () => {
        // Arrange
        const mockError = new Error('Test error message');
        (ActionRunner as jest.Mock).mockImplementation(() => {
          throw mockError;
        });

        // Act
        await main();

        // Assert
        expect(core.setFailed).toHaveBeenCalledWith('Test error message');
      });

      it('should handle non-Error objects thrown during execution', async () => {
        // Arrange
        (ActionRunner as jest.Mock).mockImplementation(() => {
          throw 'String error'; // Not an Error object
        });

        // Act
        await main();

        // Assert
        expect(core.setFailed).toHaveBeenCalledWith('An unexpected error occurred');
      });

      it('should handle errors thrown by run method', async () => {
        // Arrange
        const mockRunMethod = jest.fn().mockRejectedValue(new Error('Run method failed'));
        (ActionRunner as jest.Mock).mockImplementation(() => ({
          run: mockRunMethod,
        }));

        // Act
        await main();

        // Assert
        expect(core.setFailed).toHaveBeenCalledWith('Run method failed');
      });
    });
  });
});
