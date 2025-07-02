import * as core from '@actions/core';

import * as cache from '../src/cache';
import * as dockerCommand from '../src/docker-command';
import { ComposeService } from '../src/docker-compose-file';
import { processService } from '../src/docker-compose-service-processing';

jest.mock('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

jest.mock('../src/cache', () => ({
  generateCacheKey: jest.fn((prefix, name, tag, platform) => `${prefix}-${name}-${tag}-${platform || 'default'}`),
  generateManifestCacheKey: jest.fn(
    (prefix, name, tag, platform) => `${prefix}-${name}-${tag}-${platform || 'default'}-manifest`
  ),
  generateTarPath: jest.fn((name, tag, platform) => `/tmp/${name}-${tag}-${platform || 'default'}.tar`),
  generateManifestPath: jest.fn((name, tag, platform) => `/tmp/${name}-${tag}-${platform || 'default'}-manifest.json`),
  restoreFromCache: jest.fn(),
  saveToCache: jest.fn(),
  saveManifestToCache: jest.fn(),
  readManifestFromFile: jest.fn(),
}));

jest.mock('../src/docker-command', () => ({
  inspectImageRemote: jest.fn(),
  inspectImageLocal: jest.fn(),
  pullImage: jest.fn(),
  saveImageToTar: jest.fn(),
  loadImageFromTar: jest.fn(),
}));

describe('docker-compose-service-processing', () => {
  const mockCoreInfo = core.info as jest.Mock;
  const mockCoreWarning = core.warning as jest.Mock;
  const mockCoreDebug = core.debug as jest.Mock;

  const mockCacheRestore = cache.restoreFromCache as jest.Mock;
  const mockCacheSave = cache.saveToCache as jest.Mock;
  const mockSaveManifestToCache = cache.saveManifestToCache as jest.Mock;
  const mockReadManifestFromFile = cache.readManifestFromFile as jest.Mock;

  const mockInspectImageRemote = dockerCommand.inspectImageRemote as jest.Mock;
  const mockInspectImageLocal = dockerCommand.inspectImageLocal as jest.Mock;
  const mockPullImage = dockerCommand.pullImage as jest.Mock;
  const mockSaveImageToTar = dockerCommand.saveImageToTar as jest.Mock;
  const mockLoadImageFromTar = dockerCommand.loadImageFromTar as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processService', () => {
    const serviceDefinition: ComposeService = {
      image: 'nginx:latest',
    };

    const serviceWithPlatform: ComposeService = {
      image: 'nginx:latest',
      platform: 'linux/arm64',
    };

    const mockManifest = {
      digest: 'sha256:testdigest',
      schemaVersion: 2,
      mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
    };

    const mockInspectInfo = {
      Id: 'sha256:imageid',
      Size: 1024000,
      Architecture: 'amd64',
      Os: 'linux',
      RepoTags: ['nginx:latest'],
      RepoDigests: ['nginx@sha256:testdigest'],
      Created: '2023-01-01T00:00:00Z',
    };

    it('should process service with cache miss successfully', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValue({ success: false });
      mockPullImage.mockResolvedValue(true);
      mockSaveImageToTar.mockResolvedValue(true);
      mockSaveManifestToCache.mockResolvedValue(true);
      mockCacheSave.mockResolvedValue({ success: true });
      mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result).toEqual({
        success: true,
        restoredFromCache: false,
        imageName: 'nginx:latest',
        cacheKey: 'test-cache-nginx-latest-default',
        digest: 'sha256:testdigest',
        platform: undefined,
        imageSize: 1024000,
      });

      expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
      expect(mockSaveImageToTar).toHaveBeenCalled();
    });

    it('should process service with cache hit successfully', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' });
      mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'manifest-cache-key' });
      mockLoadImageFromTar.mockResolvedValue(true);
      mockInspectImageLocal.mockResolvedValue(mockInspectInfo);
      mockReadManifestFromFile.mockResolvedValue(mockManifest);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result).toEqual({
        success: true,
        restoredFromCache: true,
        imageName: 'nginx:latest',
        cacheKey: 'test-cache-nginx-latest-default',
        digest: 'sha256:testdigest',
        platform: undefined,
        imageSize: 1024000,
      });

      expect(mockLoadImageFromTar).toHaveBeenCalled();
      expect(mockPullImage).not.toHaveBeenCalled();
    });

    it('should handle service with platform specification', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValue({ success: false });
      mockPullImage.mockResolvedValue(true);
      mockSaveImageToTar.mockResolvedValue(true);
      mockSaveManifestToCache.mockResolvedValue(true);
      mockCacheSave.mockResolvedValue({ success: true });
      mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

      const result = await processService(serviceWithPlatform, 'test-cache', false);

      expect(result.platform).toBe('linux/arm64');
      expect(mockCoreInfo).toHaveBeenCalledWith('Using platform linux/arm64 for nginx:latest');
      expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', 'linux/arm64');
    });

    it('should handle manifest retrieval failure', async () => {
      mockInspectImageRemote.mockResolvedValue(undefined);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result).toEqual({
        success: false,
        restoredFromCache: false,
        imageName: 'nginx:latest',
        cacheKey: '',
        digest: undefined,
        platform: undefined,
        error: 'Could not get digest for nginx:latest',
      });

      expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
    });

    it('should handle manifest without digest', async () => {
      mockInspectImageRemote.mockResolvedValue({ schemaVersion: 2 });

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Could not get digest');
    });

    it('should skip latest check when flag is enabled', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' });
      mockCacheRestore.mockResolvedValueOnce({ success: false }); // No manifest cache
      mockLoadImageFromTar.mockResolvedValue(true);
      mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

      const result = await processService(serviceDefinition, 'test-cache', true);

      expect(result.success).toBe(true);
      expect(result.restoredFromCache).toBe(true);
      expect(mockCoreInfo).toHaveBeenCalledWith('Skipped latest check for nginx:latest, using cached version');
      expect(mockReadManifestFromFile).not.toHaveBeenCalled();
    });

    it('should handle manifest mismatch when not skipping latest check', async () => {
      const cachedManifest = { digest: 'sha256:olddigest' };
      const remoteManifest = { digest: 'sha256:newdigest' };

      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' });
      mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'manifest-cache-key' });
      mockLoadImageFromTar.mockResolvedValue(true);
      mockInspectImageLocal.mockResolvedValue(mockInspectInfo);
      mockReadManifestFromFile.mockResolvedValue(cachedManifest);
      mockInspectImageRemote.mockResolvedValueOnce(remoteManifest); // Second call for comparison

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(true);
      expect(result.restoredFromCache).toBe(true);
      expect(mockCoreInfo).toHaveBeenCalledWith('Manifest mismatch detected for nginx:latest, pulling fresh image');
      expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
    });

    it('should handle load from tar failure', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValue({ success: true, cacheKey: 'cache-key' });
      mockLoadImageFromTar.mockResolvedValue(false);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result).toEqual({
        success: false,
        restoredFromCache: false,
        imageName: 'nginx:latest',
        cacheKey: 'test-cache-nginx-latest-default',
        digest: 'sha256:testdigest',
        platform: undefined,
        error: 'Failed to load image from cache: nginx:latest',
      });
    });

    it('should handle pull image failure', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValue({ success: false });
      mockPullImage.mockResolvedValue(false);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to pull image');
    });

    it('should handle manifest loading failure for cached image', async () => {
      mockInspectImageRemote
        .mockResolvedValueOnce(mockManifest) // First call succeeds (for initial manifest)
        .mockResolvedValueOnce(mockManifest); // Second call succeeds (during manifest comparison)
      mockCacheRestore
        .mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' }) // Image cache hit
        .mockResolvedValueOnce({ success: true, cacheKey: 'manifest-cache-key' }); // Manifest cache hit
      mockLoadImageFromTar.mockResolvedValue(true);
      mockReadManifestFromFile.mockResolvedValue(undefined); // No cached manifest

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(true);
      expect(result.restoredFromCache).toBe(true);
      expect(mockCoreDebug).toHaveBeenCalledWith('Cannot compare manifests for nginx:latest: missing data');
    });

    it('should handle manifest loading failure for remote image', async () => {
      mockInspectImageRemote
        .mockResolvedValueOnce(mockManifest) // First call succeeds (for initial manifest)
        .mockResolvedValueOnce(undefined); // Second call fails (during manifest comparison)
      mockCacheRestore
        .mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' }) // Image cache hit
        .mockResolvedValueOnce({ success: true, cacheKey: 'manifest-cache-key' }); // Manifest cache hit
      mockLoadImageFromTar.mockResolvedValue(true);
      mockReadManifestFromFile.mockResolvedValue(mockManifest);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(true);
      expect(result.restoredFromCache).toBe(true);
      expect(mockCoreDebug).toHaveBeenCalledWith('Cannot compare manifests for nginx:latest: missing data');
    });

    it('should handle pull failure after manifest mismatch', async () => {
      const cachedManifest = { digest: 'sha256:cacheddigest' };
      const remoteManifest = { digest: 'sha256:remotedigest' };

      mockInspectImageRemote.mockResolvedValue(remoteManifest);
      mockCacheRestore.mockResolvedValue({ success: true, cacheKey: 'cache-key' });
      mockLoadImageFromTar.mockResolvedValue(true);
      mockReadManifestFromFile.mockResolvedValue(cachedManifest);
      mockPullImage.mockResolvedValue(false); // Pull fails

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(true);
      expect(result.restoredFromCache).toBe(true);
      expect(mockCoreWarning).toHaveBeenCalledWith('Failed to pull updated image nginx:latest');
    });

    it('should handle save image to tar failure', async () => {
      mockInspectImageRemote.mockResolvedValue(mockManifest);
      mockCacheRestore.mockResolvedValue({ success: false });
      mockPullImage.mockResolvedValue(true);
      mockSaveImageToTar.mockResolvedValue(false);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to save image to tar');
    });

    it('should handle digest mismatch after pull', async () => {
      const initialManifest = { digest: 'sha256:testdigest' };
      const afterPullManifest = { digest: 'sha256:differentdigest' };

      mockInspectImageRemote.mockResolvedValueOnce(initialManifest).mockResolvedValueOnce(afterPullManifest);
      mockCacheRestore.mockResolvedValue({ success: false });
      mockPullImage.mockResolvedValue(true);

      const result = await processService(serviceDefinition, 'test-cache', false);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Digest mismatch');
    });
  });
});
