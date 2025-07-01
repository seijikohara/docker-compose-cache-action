import * as cache from '@actions/cache';
import * as core from '@actions/core';
import * as fs from 'fs/promises';

import {
  generateCacheKey,
  generateManifestCacheKey,
  generateManifestPath,
  generateTarPath,
  getTempDirectory,
  readManifestFromFile,
  restoreFromCache,
  saveManifestToCache,
  saveToCache,
  writeManifestToFile,
} from '../src/cache';
import { DockerImageManifest } from '../src/docker-command';

jest.mock('@actions/cache', () => ({
  restoreCache: jest.fn(),
  saveCache: jest.fn(),
}));

jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('fs/promises', () => ({
  writeFile: jest.fn(),
  readFile: jest.fn(),
}));

jest.mock('../src/file-utils', () => ({
  sanitizePathComponent: jest.fn((value: string) => value.replace(/[/\\:*?"<>|]/g, '-')),
}));

jest.mock('../src/oci-platform', () => ({
  getCurrentPlatformInfo: jest.fn(() => ({
    os: 'linux',
    arch: 'amd64',
    variant: undefined,
  })),
  parseOciPlatformString: jest.fn((platformString?: string) => {
    if (!platformString) return undefined;
    const [os, arch, variant] = platformString.split('/');
    return { os, arch, variant };
  }),
}));

describe('cache', () => {
  const mockCacheRestore = cache.restoreCache as jest.Mock;
  const mockCacheSave = cache.saveCache as jest.Mock;
  const mockCoreWarning = core.warning as jest.Mock;
  const mockCoreDebug = core.debug as jest.Mock;
  const mockFsWriteFile = fs.writeFile as jest.Mock;
  const mockFsReadFile = fs.readFile as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RUNNER_TEMP = '/tmp';
  });

  describe('getTempDirectory', () => {
    it('should return RUNNER_TEMP when set', () => {
      process.env.RUNNER_TEMP = '/custom/temp';
      expect(getTempDirectory()).toBe('/custom/temp');
    });

    it('should return default temp dir when RUNNER_TEMP is not set', () => {
      delete process.env.RUNNER_TEMP;
      expect(getTempDirectory()).toBe('/tmp');
    });
  });

  describe('generateCacheKey', () => {
    it('should generate cache key with all components', () => {
      const result = generateCacheKey('test-prefix', 'nginx', 'latest', 'linux/amd64');
      expect(result).toBe('test-prefix-nginx-latest-linux-amd64-none');
    });

    it('should generate cache key without platform', () => {
      const result = generateCacheKey('test-prefix', 'nginx', 'latest', undefined);
      expect(result).toBe('test-prefix-nginx-latest-linux-amd64-none');
    });

    it('should sanitize unsafe characters', () => {
      const result = generateCacheKey('test-prefix', 'nginx/custom', 'v1.0', undefined);
      expect(result).toBe('test-prefix-nginx-custom-v1.0-linux-amd64-none');
    });
  });

  describe('generateManifestCacheKey', () => {
    it('should append manifest suffix to cache key', () => {
      const result = generateManifestCacheKey('test-prefix', 'nginx', 'latest', undefined);
      expect(result).toBe('test-prefix-nginx-latest-linux-amd64-none-manifest');
    });
  });

  describe('generateTarPath', () => {
    it('should generate tar file path', () => {
      const result = generateTarPath('nginx', 'latest', undefined);
      expect(result).toBe('/tmp/-nginx-latest-linux-amd64-none.tar');
    });
  });

  describe('generateManifestPath', () => {
    it('should generate manifest file path', () => {
      const result = generateManifestPath('nginx', 'latest', undefined);
      expect(result).toBe('/tmp/-nginx-latest-linux-amd64-none-manifest.json');
    });
  });

  describe('writeManifestToFile', () => {
    it('should save manifest to file successfully', async () => {
      const manifest: DockerImageManifest = {
        digest: 'sha256:digest',
        schemaVersion: 2,
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
      };

      mockFsWriteFile.mockResolvedValue(undefined);

      const result = await writeManifestToFile(manifest, '/tmp/manifest.json');

      expect(result).toBe(true);
      expect(mockFsWriteFile).toHaveBeenCalledWith('/tmp/manifest.json', JSON.stringify(manifest, null, 2));
    });

    it('should handle save errors', async () => {
      const manifest: DockerImageManifest = { digest: 'sha256:digest' };
      mockFsWriteFile.mockRejectedValue(new Error('Write failed'));

      const result = await writeManifestToFile(manifest, '/tmp/manifest.json');

      expect(result).toBe(false);
      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Failed to save manifest'));
    });
  });

  describe('readManifestFromFile', () => {
    it('should load manifest from file successfully', async () => {
      const manifest: DockerImageManifest = {
        digest: 'sha256:digest',
        schemaVersion: 2,
      };

      mockFsReadFile.mockResolvedValue(JSON.stringify(manifest));

      const result = await readManifestFromFile('/tmp/manifest.json');

      expect(result).toEqual(manifest);
      expect(mockFsReadFile).toHaveBeenCalledWith('/tmp/manifest.json', 'utf8');
    });

    it('should handle load errors', async () => {
      mockFsReadFile.mockRejectedValue(new Error('Read failed'));

      const result = await readManifestFromFile('/tmp/manifest.json');

      expect(result).toBeUndefined();
      expect(mockCoreDebug).toHaveBeenCalledWith(expect.stringContaining('Failed to load manifest'));
    });

    it('should handle invalid JSON', async () => {
      mockFsReadFile.mockResolvedValue('invalid json');

      const result = await readManifestFromFile('/tmp/manifest.json');

      expect(result).toBeUndefined();
    });
  });

  describe('restoreFromCache', () => {
    it('should restore cache successfully', async () => {
      mockCacheRestore.mockResolvedValue('cache-key-hit');

      const result = await restoreFromCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: true,
        cacheKey: 'cache-key-hit',
      });
    });

    it('should handle cache miss', async () => {
      mockCacheRestore.mockResolvedValue(undefined);

      const result = await restoreFromCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: false,
        cacheKey: undefined,
      });
    });

    it('should handle cache restore errors', async () => {
      mockCacheRestore.mockRejectedValue(new Error('Cache error'));

      const result = await restoreFromCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: false,
        error: 'Cache error',
      });
    });
  });

  describe('saveToCache', () => {
    it('should save to cache successfully', async () => {
      mockCacheSave.mockResolvedValue(123);

      const result = await saveToCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: true,
        cacheKey: 'cache-key',
      });
    });

    it('should handle invalid cache ID', async () => {
      mockCacheSave.mockResolvedValue(-1);

      const result = await saveToCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: false,
        error: 'Cache save returned invalid ID',
      });
    });

    it('should handle "already exists" error as success', async () => {
      mockCacheSave.mockRejectedValue(new Error('Cache already exists'));

      const result = await saveToCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: true,
        cacheKey: 'cache-key',
      });
    });

    it('should handle other cache save errors', async () => {
      mockCacheSave.mockRejectedValue(new Error('Network error'));

      const result = await saveToCache(['/tmp/file.tar'], 'cache-key');

      expect(result).toEqual({
        success: false,
        error: 'Network error',
      });
    });
  });

  describe('saveManifestToCache', () => {
    it('should save manifest to file and cache successfully', async () => {
      const manifest: DockerImageManifest = { digest: 'sha256:digest' };
      mockFsWriteFile.mockResolvedValue(undefined);
      mockCacheSave.mockResolvedValue(123);

      const result = await saveManifestToCache(manifest, '/tmp/manifest.json', 'manifest-cache-key');

      expect(result).toBe(true);
      expect(mockFsWriteFile).toHaveBeenCalled();
      expect(mockCacheSave).toHaveBeenCalledWith(['/tmp/manifest.json'], 'manifest-cache-key');
    });

    it('should return false if file save fails', async () => {
      const manifest: DockerImageManifest = { digest: 'sha256:digest' };
      mockFsWriteFile.mockRejectedValue(new Error('Write failed'));

      const result = await saveManifestToCache(manifest, '/tmp/manifest.json', 'manifest-cache-key');

      expect(result).toBe(false);
      expect(mockCacheSave).not.toHaveBeenCalled();
    });

    it('should return false if cache save fails', async () => {
      const manifest: DockerImageManifest = { digest: 'sha256:digest' };
      mockFsWriteFile.mockResolvedValue(undefined);
      mockCacheSave.mockRejectedValue(new Error('Cache error'));

      const result = await saveManifestToCache(manifest, '/tmp/manifest.json', 'manifest-cache-key');

      expect(result).toBe(false);
    });
  });
});
