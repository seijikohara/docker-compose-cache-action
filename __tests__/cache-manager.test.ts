import * as fs from 'fs';

// Mock standard libraries
jest.mock('fs');

// Mock @actions/core with a direct mock to avoid fs.promises issues
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

// Mock @actions/cache with a simplified direct mock
jest.mock('@actions/cache', () => ({
  restoreCache: jest.fn(),
  saveCache: jest.fn(),
  // Add mock classes for instanceof checks
  ValidationError: class ValidationError extends Error {
    constructor(message = 'ValidationError') {
      super(message);
      this.name = 'ValidationError';
    }
  },
  ReserveCacheError: class ReserveCacheError extends Error {
    constructor(message = 'ReserveCacheError') {
      super(message);
      this.name = 'ReserveCacheError';
    }
  },
}));

// Import after mock setup
import * as core from '@actions/core';
import * as cache from '@actions/cache';
import { CacheManager } from '../src/cache-manager';

describe('CacheManager', () => {
  let cacheManager: CacheManager;

  beforeEach(() => {
    // Create a new instance for each test
    cacheManager = new CacheManager();

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('restore', () => {
    describe('normal cases', () => {
      it('should successfully restore cache when it exists and file is found', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';
        const restoreKeys = ['fallback-key-1', 'fallback-key-2'];

        // Mock successful cache restoration
        (cache.restoreCache as jest.Mock).mockResolvedValue(key);
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        // Act
        const result = await cacheManager.restore(key, path, restoreKeys);

        // Assert
        expect(result).toBe(true);
        expect(cache.restoreCache).toHaveBeenCalledWith([path], key, restoreKeys);
        expect(core.info).toHaveBeenCalledWith(`Cache restored for ${path} with key: ${key}`);
        expect(fs.existsSync).toHaveBeenCalledWith(path);
      });

      it('should handle restore with no fallback keys', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';

        // Mock successful cache restoration
        (cache.restoreCache as jest.Mock).mockResolvedValue(key);
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        // Act
        const result = await cacheManager.restore(key, path);

        // Assert
        expect(result).toBe(true);
        expect(cache.restoreCache).toHaveBeenCalledWith([path], key, undefined);
      });
    });

    describe('edge cases', () => {
      it('should return false when cache is found but file is missing', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/missing-file.tar';

        // Mock cache found but file missing
        (cache.restoreCache as jest.Mock).mockResolvedValue(key);
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Act
        const result = await cacheManager.restore(key, path);

        // Assert
        expect(result).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(
          `Cache key '${key}' was found, but the file '${path}' is missing after restore.`
        );
      });

      it('should return false when no cache is found', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';

        // Mock no cache found
        (cache.restoreCache as jest.Mock).mockResolvedValue(undefined);

        // Act
        const result = await cacheManager.restore(key, path);

        // Assert
        expect(result).toBe(false);
        expect(core.info).toHaveBeenCalledWith(`Cache not found for key: ${key}`);
      });
    });

    describe('error cases', () => {
      it('should handle errors during cache restoration', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';
        const errorMessage = 'Cache restoration failed';

        // Mock error during cache restoration
        (cache.restoreCache as jest.Mock).mockRejectedValue(new Error(errorMessage));

        // Act
        const result = await cacheManager.restore(key, path);

        // Assert
        expect(result).toBe(false);
        expect(core.warning).toHaveBeenCalledWith(`Failed to restore cache for key ${key}: ${errorMessage}`);
      });
    });
  });

  describe('save', () => {
    describe('normal cases', () => {
      it('should successfully save cache when file exists', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';

        // Mock file exists
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (cache.saveCache as jest.Mock).mockResolvedValue(undefined);

        // Act
        await cacheManager.save(key, path);

        // Assert
        expect(fs.existsSync).toHaveBeenCalledWith(path);
        expect(cache.saveCache).toHaveBeenCalledWith([path], key);
        expect(core.info).toHaveBeenCalledWith(`Attempting to save cache for path ${path} with key: ${key}`);
        expect(core.info).toHaveBeenCalledWith(`Cache saved successfully for key: ${key}`);
      });
    });

    describe('edge cases', () => {
      it('should not attempt to save cache when file does not exist', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/nonexistent-file.tar';

        // Mock file does not exist
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Act
        await cacheManager.save(key, path);

        // Assert
        expect(fs.existsSync).toHaveBeenCalledWith(path);
        expect(cache.saveCache).not.toHaveBeenCalled();
        expect(core.warning).toHaveBeenCalledWith(
          `Cache file or directory '${path}' does not exist. Cannot save cache with key ${key}.`
        );
      });

      it('should handle ValidationError during cache save', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';
        const errorMessage = 'Validation failed';

        // Mock file exists but validation error occurs
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        // Create ValidationError
        const validationError = new cache.ValidationError(errorMessage);
        (cache.saveCache as jest.Mock).mockRejectedValue(validationError);

        // Act
        await cacheManager.save(key, path);

        // Assert
        expect(core.warning).toHaveBeenCalledWith(`Cache save warning for key ${key}: ${errorMessage}`);
      });

      it('should handle ReserveCacheError during cache save', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';
        const errorMessage = 'Reserve cache failed';

        // Mock file exists but reserve cache error occurs
        (fs.existsSync as jest.Mock).mockReturnValue(true);

        // Create ReserveCacheError
        const reserveError = new cache.ReserveCacheError(errorMessage);
        (cache.saveCache as jest.Mock).mockRejectedValue(reserveError);

        // Act
        await cacheManager.save(key, path);

        // Assert
        expect(core.warning).toHaveBeenCalledWith(`Cache save warning for key ${key}: ${errorMessage}`);
      });
    });

    describe('error cases', () => {
      it('should handle generic errors during cache save', async () => {
        // Arrange
        const key = 'cache-key';
        const path = '/path/to/file.tar';
        const errorMessage = 'Unknown error occurred';

        // Mock file exists but generic error occurs
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (cache.saveCache as jest.Mock).mockRejectedValue(new Error(errorMessage));

        // Act
        await cacheManager.save(key, path);

        // Assert
        expect(core.warning).toHaveBeenCalledWith(`Failed to save cache for key ${key}: ${errorMessage}`);
      });
    });
  });
});
