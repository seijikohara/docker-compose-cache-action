import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as fs from 'fs';
import { CacheManager } from '../src/cache-manager';

// Mock dependent modules
jest.mock('@actions/core');
jest.mock('@actions/cache', () => ({
  // Mock functions used by CacheManager
  restoreCache: jest.fn(),
  saveCache: jest.fn(),
  // Mock error classes for instanceof checks
  ValidationError: class ValidationError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'ValidationError';
    }
  },
  ReserveCacheError: class ReserveCacheError extends Error {
    constructor(message?: string) {
      super(message);
      this.name = 'ReserveCacheError';
    }
  },
}));
// Mock fs using requireActual and overriding existsSync
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn().mockReturnValue(true), // Default: file exists
    // No need to mock readFileSync or promises for these tests
  };
});

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;
const cacheMock = cache as jest.Mocked<typeof cache>;

const fsMock = fs as jest.Mocked<typeof fs>;

describe('CacheManager', () => {
  const TEST_KEY = 'test-primary-key';
  const TEST_PATH = '/tmp/cache-file.tar';
  const TEST_RESTORE_KEYS = ['restore-key-1', 'restore-key-2'];
  let cacheManager: CacheManager;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager = new CacheManager(); // Create a new instance for each test
  });

  describe('restore', () => {
    test('should return true and log info when cache is restored and file exists', async () => {
      // Arrange
      const restoredKey = TEST_KEY;
      cacheMock.restoreCache.mockResolvedValue(restoredKey);
      fsMock.existsSync.mockReturnValue(true);

      // Act
      const result = await cacheManager.restore(TEST_KEY, TEST_PATH, TEST_RESTORE_KEYS);

      // Assert
      expect(result).toBe(true);
      expect(cacheMock.restoreCache).toHaveBeenCalledTimes(1);
      expect(cacheMock.restoreCache).toHaveBeenCalledWith([TEST_PATH], TEST_KEY, [...TEST_RESTORE_KEYS]); // Check mutable copy passed
      expect(fsMock.existsSync).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).toHaveBeenCalledWith(TEST_PATH);
      expect(coreMock.info).toHaveBeenCalledWith(`Cache restored for ${TEST_PATH} with key: ${restoredKey}`);
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return false when cache is not found', async () => {
      // Arrange
      cacheMock.restoreCache.mockResolvedValue(undefined); // Simulate cache miss

      // Act
      const result = await cacheManager.restore(TEST_KEY, TEST_PATH);

      // Assert
      expect(result).toBe(false);
      expect(cacheMock.restoreCache).toHaveBeenCalledTimes(1);
      expect(cacheMock.restoreCache).toHaveBeenCalledWith([TEST_PATH], TEST_KEY, undefined);
      expect(fsMock.existsSync).not.toHaveBeenCalled(); // Shouldn't check if cacheKey is undefined
      expect(coreMock.info).not.toHaveBeenCalled();
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should return false and log info when cache key hit but file does not exist', async () => {
      // Arrange
      const restoredKey = TEST_KEY;
      cacheMock.restoreCache.mockResolvedValue(restoredKey);
      fsMock.existsSync.mockReturnValue(false); // Simulate file missing

      // Act
      const result = await cacheManager.restore(TEST_KEY, TEST_PATH);

      // Assert
      expect(result).toBe(false);
      expect(cacheMock.restoreCache).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).toHaveBeenCalledWith(TEST_PATH);
      expect(coreMock.info).toHaveBeenCalledWith(`Cache restored for ${TEST_PATH} with key: ${restoredKey}`); // Still logs restore
      expect(coreMock.warning).not.toHaveBeenCalled(); // No warning in this specific scenario in current code
    });

    test('should return false and log warning when restoreCache throws an error', async () => {
      // Arrange
      const errorMessage = 'Cache service unavailable';
      cacheMock.restoreCache.mockRejectedValue(new Error(errorMessage));

      // Act
      const result = await cacheManager.restore(TEST_KEY, TEST_PATH);

      // Assert
      expect(result).toBe(false);
      expect(cacheMock.restoreCache).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).not.toHaveBeenCalled();
      expect(coreMock.info).not.toHaveBeenCalled();
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(`Failed to restore cache for key ${TEST_KEY}: ${errorMessage}`);
    });
  });

  describe('save', () => {
    test('should call saveCache and log info when file exists', async () => {
      // Arrange
      fsMock.existsSync.mockReturnValue(true);
      cacheMock.saveCache.mockResolvedValue(123); // Simulate successful save return value (cacheId)

      // Act
      await cacheManager.save(TEST_KEY, TEST_PATH);

      // Assert
      expect(fsMock.existsSync).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).toHaveBeenCalledWith(TEST_PATH);
      expect(cacheMock.saveCache).toHaveBeenCalledTimes(1);
      expect(cacheMock.saveCache).toHaveBeenCalledWith([TEST_PATH], TEST_KEY);
      expect(coreMock.info).toHaveBeenCalledWith(`Saving cache for ${TEST_PATH} with key: ${TEST_KEY}`);
      expect(coreMock.info).toHaveBeenCalledWith(`Cache saved successfully for key: ${TEST_KEY}`);
      expect(coreMock.warning).not.toHaveBeenCalled();
    });

    test('should not call saveCache and log warning when file does not exist', async () => {
      // Arrange
      fsMock.existsSync.mockReturnValue(false);

      // Act
      await cacheManager.save(TEST_KEY, TEST_PATH);

      // Assert
      expect(fsMock.existsSync).toHaveBeenCalledTimes(1);
      expect(fsMock.existsSync).toHaveBeenCalledWith(TEST_PATH);
      expect(cacheMock.saveCache).not.toHaveBeenCalled();
      expect(coreMock.info).not.toHaveBeenCalledWith(expect.stringContaining('Saving cache')); // No save attempt logged
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(
        `Cache file '${TEST_PATH}' does not exist. Cannot save cache with key ${TEST_KEY}.`
      );
    });

    test('should log general warning when saveCache throws a generic error', async () => {
      // Arrange
      const errorMessage = 'Network error during save';
      fsMock.existsSync.mockReturnValue(true);
      cacheMock.saveCache.mockRejectedValue(new Error(errorMessage));

      // Act
      await cacheManager.save(TEST_KEY, TEST_PATH);

      // Assert
      expect(cacheMock.saveCache).toHaveBeenCalledTimes(1);
      expect(coreMock.info).toHaveBeenCalledWith(`Saving cache for ${TEST_PATH} with key: ${TEST_KEY}`);
      expect(coreMock.info).not.toHaveBeenCalledWith(expect.stringContaining('saved successfully'));
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(`Failed to save cache for key ${TEST_KEY}: ${errorMessage}`);
    });

    test('should log specific warning when saveCache throws ValidationError', async () => {
      // Arrange
      const errorMessage = 'Invalid cache key format';
      fsMock.existsSync.mockReturnValue(true);
      // Use the mocked error class constructor
      cacheMock.saveCache.mockRejectedValue(new cache.ValidationError(errorMessage));

      // Act
      await cacheManager.save(TEST_KEY, TEST_PATH);

      // Assert
      expect(cacheMock.saveCache).toHaveBeenCalledTimes(1);
      expect(coreMock.info).toHaveBeenCalledWith(`Saving cache for ${TEST_PATH} with key: ${TEST_KEY}`);
      expect(coreMock.info).not.toHaveBeenCalledWith(expect.stringContaining('saved successfully'));
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(`Cache save warning for key ${TEST_KEY}: ${errorMessage}`);
    });

    test('should log specific warning when saveCache throws ReserveCacheError', async () => {
      // Arrange
      const errorMessage = 'Cache already exists or reservation conflict';
      fsMock.existsSync.mockReturnValue(true);
      // Use the mocked error class constructor
      cacheMock.saveCache.mockRejectedValue(new cache.ReserveCacheError(errorMessage));

      // Act
      await cacheManager.save(TEST_KEY, TEST_PATH);

      // Assert
      expect(cacheMock.saveCache).toHaveBeenCalledTimes(1);
      expect(coreMock.info).toHaveBeenCalledWith(`Saving cache for ${TEST_PATH} with key: ${TEST_KEY}`);
      expect(coreMock.info).not.toHaveBeenCalledWith(expect.stringContaining('saved successfully'));
      expect(coreMock.warning).toHaveBeenCalledTimes(1);
      expect(coreMock.warning).toHaveBeenCalledWith(`Cache save warning for key ${TEST_KEY}: ${errorMessage}`);
    });
  });
});
