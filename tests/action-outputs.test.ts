import * as core from '@actions/core';

import {
  ActionSummary,
  buildProcessedImageList,
  calculateActionSummary,
  createActionSummary,
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
  formatTimeBetween: jest.fn((start: number, end: number) => {
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

  describe('createActionSummary', () => {
    const mockCoreSummary = core.summary as jest.Mocked<typeof core.summary>;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should create GitHub Actions summary with all sections', () => {
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
          success: false,
          restoredFromCache: false,
          imageName: 'invalid:image',
          cacheKey: 'cache-key-2',
          error: 'Image not found',
          processingDuration: 1000,
          humanReadableDuration: '1 second',
        },
      ];

      const summary: ActionSummary = {
        totalServiceCount: 2,
        cachedServiceCount: 1,
        allServicesSuccessful: false,
        allServicesFromCache: false,
        executionTimeMs: 5000,
      };

      const referencedComposeFiles = ['docker-compose.yml', 'docker-compose.override.yml'];
      const skipLatestCheck = true;

      createActionSummary(results, summary, referencedComposeFiles, skipLatestCheck);

      // Verify main heading was added
      expect(mockCoreSummary.addHeading).toHaveBeenCalledWith('Docker Compose Cache Results', 2);

      // Verify table structure (header + results rows) - First call to addTable
      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(1, [
        [
          { data: 'Image Name', header: true },
          { data: 'Platform', header: true },
          { data: 'Status', header: true },
          { data: 'Size', header: true },
          { data: 'Processing Time', header: true },
          { data: 'Cache Key', header: true },
        ],
        [
          { data: 'nginx:latest' },
          { data: 'linux/amd64' },
          { data: '✅ Cached' },
          { data: '1000.0 KB' },
          { data: '1.5 seconds' },
          { data: 'cache-key-1' },
        ],
        [
          { data: 'invalid:image' },
          { data: 'default' },
          { data: '❌ Error: Image not found' },
          { data: 'N/A' },
          { data: '1 second' },
          { data: 'cache-key-2' },
        ],
      ]);

      // Verify action summary section
      expect(mockCoreSummary.addHeading).toHaveBeenCalledWith('Action summary', 3);
      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(2, [
        [
          { data: 'Metric', header: true },
          { data: 'Value', header: true },
        ],
        [{ data: 'Total Services' }, { data: '2' }],
        [{ data: 'Restored from Cache' }, { data: '1/2' }],
        [{ data: 'Skip Latest Check' }, { data: '⏭️ Yes' }],
        [{ data: 'Total Execution Time' }, { data: '1 second' }],
      ]);

      // Verify referenced compose files section
      expect(mockCoreSummary.addHeading).toHaveBeenCalledWith('Referenced Compose Files', 3);
      expect(mockCoreSummary.addList).toHaveBeenCalledWith(['docker-compose.yml', 'docker-compose.override.yml']);

      // Verify write was called
      expect(mockCoreSummary.write).toHaveBeenCalled();
    });

    it('should handle empty results array', () => {
      const summary: ActionSummary = {
        totalServiceCount: 0,
        cachedServiceCount: 0,
        allServicesSuccessful: true,
        allServicesFromCache: false,
        executionTimeMs: 1000,
      };

      createActionSummary([], summary, ['docker-compose.yml'], false);

      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(1, [
        [
          { data: 'Image Name', header: true },
          { data: 'Platform', header: true },
          { data: 'Status', header: true },
          { data: 'Size', header: true },
          { data: 'Processing Time', header: true },
          { data: 'Cache Key', header: true },
        ],
      ]);
    });

    it('should handle skipLatestCheck false', () => {
      const summary: ActionSummary = {
        totalServiceCount: 1,
        cachedServiceCount: 0,
        allServicesSuccessful: true,
        allServicesFromCache: false,
        executionTimeMs: 2000,
      };

      createActionSummary([], summary, ['docker-compose.yml'], false);

      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(
        2,
        expect.arrayContaining([[{ data: 'Skip Latest Check' }, { data: '🔍 No' }]])
      );
    });

    it('should handle missing platform and error information', () => {
      const results: TimedServiceResult[] = [
        {
          success: true,
          restoredFromCache: false,
          imageName: 'redis:alpine',
          cacheKey: 'cache-key',
          processingDuration: 2000,
          humanReadableDuration: '2 seconds',
        },
      ];

      const summary: ActionSummary = {
        totalServiceCount: 1,
        cachedServiceCount: 0,
        allServicesSuccessful: true,
        allServicesFromCache: false,
        executionTimeMs: 3000,
      };

      createActionSummary(results, summary, ['docker-compose.yml'], false);

      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(1, [
        [
          { data: 'Image Name', header: true },
          { data: 'Platform', header: true },
          { data: 'Status', header: true },
          { data: 'Size', header: true },
          { data: 'Processing Time', header: true },
          { data: 'Cache Key', header: true },
        ],
        [
          { data: 'redis:alpine' },
          { data: 'default' },
          { data: '⬇️ Pulled' },
          { data: 'N/A' },
          { data: '2 seconds' },
          { data: 'cache-key' },
        ],
      ]);
    });

    it('should handle error without specific error message', () => {
      const results: TimedServiceResult[] = [
        {
          success: false,
          restoredFromCache: false,
          imageName: 'broken:image',
          cacheKey: 'cache-key',
          processingDuration: 500,
          humanReadableDuration: '0.5 seconds',
        },
      ];

      const summary: ActionSummary = {
        totalServiceCount: 1,
        cachedServiceCount: 0,
        allServicesSuccessful: false,
        allServicesFromCache: false,
        executionTimeMs: 1000,
      };

      createActionSummary(results, summary, ['docker-compose.yml'], false);

      expect(mockCoreSummary.addTable).toHaveBeenNthCalledWith(1, [
        [
          { data: 'Image Name', header: true },
          { data: 'Platform', header: true },
          { data: 'Status', header: true },
          { data: 'Size', header: true },
          { data: 'Processing Time', header: true },
          { data: 'Cache Key', header: true },
        ],
        [
          { data: 'broken:image' },
          { data: 'default' },
          { data: '❌ Error: Unknown' },
          { data: 'N/A' },
          { data: '0.5 seconds' },
          { data: 'cache-key' },
        ],
      ]);
    });
  });
});
