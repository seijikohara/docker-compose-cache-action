import * as core from '@actions/core';

import {
  ActionSummary,
  buildProcessedImageList,
  calculateActionSummary,
  logActionCompletion,
  ProcessedImageList,
  setActionOutputs,
  TimedServiceResult,
} from '../src/action-outputs';

jest.mock('@actions/core', () => ({
  setOutput: jest.fn(),
  info: jest.fn(),
  summary: {
    addHeading: jest.fn().mockReturnThis(),
    addTable: jest.fn().mockReturnThis(),
    addList: jest.fn().mockReturnThis(),
    write: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../src/date-utils', () => ({
  formatExecutionTime: jest.fn((start: number, end: number) => {
    const duration = end - start;
    if (duration >= 3600000) return '1 hour';
    if (duration >= 60000) return '1 minute';
    if (duration >= 1000) return '1 second';
    return '';
  }),
}));

jest.mock('../src/file-utils', () => ({
  formatFileSize: jest.fn((size?: number) => {
    if (size === undefined) return 'N/A';
    if (size === 0) return '0 Bytes';
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${size} Bytes`;
  }),
}));

describe('action-outputs', () => {
  const mockCoreSetOutput = core.setOutput as jest.Mock;
  const mockCoreInfo = core.info as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setActionOutputs', () => {
    it('should set cache-hit and image-list outputs correctly', () => {
      const imageList: ProcessedImageList = [
        {
          name: 'nginx:latest',
          platform: 'linux/amd64',
          status: 'Cached',
          size: 1024000,
          digest: 'sha256:digest',
          processingTimeMs: 1500,
          cacheKey: 'test-cache-key',
        },
      ];

      setActionOutputs(true, imageList);

      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'true');
      expect(mockCoreSetOutput).toHaveBeenCalledWith('image-list', JSON.stringify(imageList));
    });

    it('should handle false cache-hit', () => {
      setActionOutputs(false, []);

      expect(mockCoreSetOutput).toHaveBeenCalledWith('cache-hit', 'false');
      expect(mockCoreSetOutput).toHaveBeenCalledWith('image-list', '[]');
    });
  });

  describe('buildProcessedImageList', () => {
    it('should transform processing results to image list output', () => {
      const results: TimedServiceResult[] = [
        {
          success: true,
          restoredFromCache: true,
          imageName: 'nginx:latest',
          cacheKey: 'cache-key-1',
          digest: 'sha256:digest1',
          platform: 'linux/amd64',
          imageSize: 1024000,
          processingDuration: 1500,
          humanReadableDuration: '1.5 seconds',
        },
        {
          success: true,
          restoredFromCache: false,
          imageName: 'redis:alpine',
          cacheKey: 'cache-key-2',
          digest: 'sha256:digest2',
          imageSize: 512000,
          processingDuration: 3000,
          humanReadableDuration: '3 seconds',
        },
      ];

      const output = buildProcessedImageList(results);

      expect(output).toHaveLength(2);
      expect(output[0]).toEqual({
        name: 'nginx:latest',
        platform: 'linux/amd64',
        status: 'Cached',
        size: 1024000,
        digest: 'sha256:digest1',
        processingTimeMs: 1500,
        cacheKey: 'cache-key-1',
      });
      expect(output[1]).toEqual({
        name: 'redis:alpine',
        platform: 'default',
        status: 'Pulled',
        size: 512000,
        digest: 'sha256:digest2',
        processingTimeMs: 3000,
        cacheKey: 'cache-key-2',
      });
    });

    it('should handle error status', () => {
      const results: TimedServiceResult[] = [
        {
          success: false,
          restoredFromCache: false,
          imageName: 'invalid:image',
          cacheKey: 'cache-key',
          error: 'Image not found',
          processingDuration: 1000,
          humanReadableDuration: '1 second',
        },
      ];

      const output = buildProcessedImageList(results);

      expect(output[0].status).toBe('Error');
      expect(output[0].size).toBe(0);
      expect(output[0].digest).toBe('');
    });
  });

  describe('calculateActionSummary', () => {
    it('should calculate summary metrics correctly', () => {
      const results: TimedServiceResult[] = [
        {
          success: true,
          restoredFromCache: true,
          imageName: 'nginx:latest',
          cacheKey: 'cache-key-1',
          processingDuration: 1500,
          humanReadableDuration: '1.5 seconds',
        },
        {
          success: true,
          restoredFromCache: false,
          imageName: 'redis:alpine',
          cacheKey: 'cache-key-2',
          processingDuration: 3000,
          humanReadableDuration: '3 seconds',
        },
        {
          success: false,
          restoredFromCache: false,
          imageName: 'invalid:image',
          cacheKey: 'cache-key-3',
          processingDuration: 1000,
          humanReadableDuration: '1 second',
        },
      ];

      const summary = calculateActionSummary(results, 10000);

      expect(summary).toEqual({
        totalServiceCount: 3,
        cachedServiceCount: 1,
        allServicesSuccessful: false,
        allServicesFromCache: false,
        executionTimeMs: 10000,
      });
    });

    it('should handle all services from cache', () => {
      const results: TimedServiceResult[] = [
        {
          success: true,
          restoredFromCache: true,
          imageName: 'nginx:latest',
          cacheKey: 'cache-key-1',
          processingDuration: 1500,
          humanReadableDuration: '1.5 seconds',
        },
        {
          success: true,
          restoredFromCache: true,
          imageName: 'redis:alpine',
          cacheKey: 'cache-key-2',
          processingDuration: 1000,
          humanReadableDuration: '1 second',
        },
      ];

      const summary = calculateActionSummary(results, 5000);

      expect(summary.allServicesFromCache).toBe(true);
      expect(summary.allServicesSuccessful).toBe(true);
    });

    it('should handle empty results', () => {
      const summary = calculateActionSummary([], 1000);

      expect(summary).toEqual({
        totalServiceCount: 0,
        cachedServiceCount: 0,
        allServicesSuccessful: true,
        allServicesFromCache: false,
        executionTimeMs: 1000,
      });
    });
  });

  describe('logActionCompletion', () => {
    it('should log completion messages for successful action', () => {
      const summary: ActionSummary = {
        totalServiceCount: 3,
        cachedServiceCount: 2,
        allServicesSuccessful: true,
        allServicesFromCache: false,
        executionTimeMs: 5000,
      };

      logActionCompletion(summary);

      expect(mockCoreInfo).toHaveBeenCalledWith('2 of 3 services restored from cache');
      expect(mockCoreInfo).toHaveBeenCalledWith('Action completed in 1 second');
      expect(mockCoreInfo).toHaveBeenCalledWith('Docker Compose Cache action completed successfully');
    });

    it('should log completion messages for partially successful action', () => {
      const summary: ActionSummary = {
        totalServiceCount: 3,
        cachedServiceCount: 1,
        allServicesSuccessful: false,
        allServicesFromCache: false,
        executionTimeMs: 8000,
      };

      logActionCompletion(summary);

      expect(mockCoreInfo).toHaveBeenCalledWith('1 of 3 services restored from cache');
      expect(mockCoreInfo).toHaveBeenCalledWith(
        'Docker Compose Cache action completed with some services not fully processed'
      );
    });
  });
});
