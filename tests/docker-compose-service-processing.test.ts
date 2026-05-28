import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('@actions/core', () => ({
  info: jest.fn(),
  warning: jest.fn(),
  debug: jest.fn(),
}));

jest.unstable_mockModule('../src/cache.js', () => ({
  generateCacheKey: jest.fn(
    (prefix: string, name: string, tag: string, platform?: string) =>
      `${prefix}-${name}-${tag}-${platform ?? 'default'}`
  ),
  generateCacheKeyPrefix: jest.fn(
    (prefix: string, name: string, tag: string, platform?: string) =>
      `${prefix}-${name}-${tag}-${platform ?? 'default'}`
  ),
  generateManifestCacheKey: jest.fn(
    (prefix: string, name: string, tag: string, platform?: string) =>
      `${prefix}-${name}-${tag}-${platform ?? 'default'}-manifest`
  ),
  generateTarPath: jest.fn(
    (name: string, tag: string, platform?: string) => `/tmp/${name}-${tag}-${platform ?? 'default'}.tar`
  ),
  generateManifestPath: jest.fn(
    (name: string, tag: string, platform?: string) => `/tmp/${name}-${tag}-${platform ?? 'default'}-manifest.json`
  ),
  restoreFromCache: jest.fn(),
  saveToCache: jest.fn(),
  saveManifestToCache: jest.fn(),
  readManifestFromFile: jest.fn(),
}));

jest.unstable_mockModule('../src/docker-command.js', () => ({
  inspectImageRemote: jest.fn(),
  inspectImageLocal: jest.fn(),
  pullImage: jest.fn(),
  saveImageToTar: jest.fn(),
  loadImageFromTar: jest.fn(),
}));

const core = await import('@actions/core');
const cache = await import('../src/cache.js');
const dockerCommand = await import('../src/docker-command.js');
const { processService } = await import('../src/docker-compose-service-processing.js');
type ComposeService = import('../src/docker-compose-file.js').ComposeService;

const mockCoreInfo = jest.mocked(core.info);
const mockCoreWarning = jest.mocked(core.warning);
const mockCoreDebug = jest.mocked(core.debug);

const mockCacheRestore = jest.mocked(cache.restoreFromCache);
const mockCacheSave = jest.mocked(cache.saveToCache);
const mockSaveManifestToCache = jest.mocked(cache.saveManifestToCache);
const mockReadManifestFromFile = jest.mocked(cache.readManifestFromFile);

const mockInspectImageRemote = jest.mocked(dockerCommand.inspectImageRemote);
const mockInspectImageLocal = jest.mocked(dockerCommand.inspectImageLocal);
const mockPullImage = jest.mocked(dockerCommand.pullImage);
const mockSaveImageToTar = jest.mocked(dockerCommand.saveImageToTar);
const mockLoadImageFromTar = jest.mocked(dockerCommand.loadImageFromTar);

describe('docker-compose-service-processing', () => {
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

    describe('force refresh', () => {
      it('should skip cache restore when force refresh is enabled', async () => {
        mockInspectImageRemote.mockResolvedValue(mockManifest);
        mockPullImage.mockResolvedValue(true);
        mockSaveImageToTar.mockResolvedValue(true);
        mockSaveManifestToCache.mockResolvedValue(true);
        mockCacheSave.mockResolvedValue({ success: true });
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

        const result = await processService(serviceDefinition, 'test-cache', false, true);

        expect(result).toEqual({
          success: true,
          restoredFromCache: false,
          imageName: 'nginx:latest',
          cacheKey: 'test-cache-nginx-latest-default',
          digest: 'sha256:testdigest',
          platform: undefined,
          imageSize: 1024000,
        });

        // Cache restore should NOT be called when force refresh is enabled
        expect(mockCacheRestore).not.toHaveBeenCalled();
        // Image should be pulled
        expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', undefined);
        // Image should be saved to cache
        expect(mockCacheSave).toHaveBeenCalled();
        // Info message should indicate force refresh
        expect(mockCoreInfo).toHaveBeenCalledWith('Force refresh enabled for nginx:latest, pulling fresh image');
      });

      it('should still save to cache when force refresh pulls image', async () => {
        mockInspectImageRemote.mockResolvedValue(mockManifest);
        mockPullImage.mockResolvedValue(true);
        mockSaveImageToTar.mockResolvedValue(true);
        mockSaveManifestToCache.mockResolvedValue(true);
        mockCacheSave.mockResolvedValue({ success: true });
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

        await processService(serviceDefinition, 'test-cache', false, true);

        // Verify image is saved to cache for future use
        expect(mockSaveImageToTar).toHaveBeenCalled();
        expect(mockCacheSave).toHaveBeenCalled();
        expect(mockSaveManifestToCache).toHaveBeenCalled();
      });

      it('should handle pull failure with force refresh', async () => {
        mockInspectImageRemote.mockResolvedValue(mockManifest);
        mockPullImage.mockResolvedValue(false);

        const result = await processService(serviceDefinition, 'test-cache', false, true);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to pull image');
        expect(mockCacheRestore).not.toHaveBeenCalled();
      });

      it('should work with platform-specific images and force refresh', async () => {
        mockInspectImageRemote.mockResolvedValue(mockManifest);
        mockPullImage.mockResolvedValue(true);
        mockSaveImageToTar.mockResolvedValue(true);
        mockSaveManifestToCache.mockResolvedValue(true);
        mockCacheSave.mockResolvedValue({ success: true });
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

        const result = await processService(serviceWithPlatform, 'test-cache', false, true);

        expect(result.success).toBe(true);
        expect(result.platform).toBe('linux/arm64');
        expect(mockPullImage).toHaveBeenCalledWith('nginx:latest', 'linux/arm64');
        expect(mockCacheRestore).not.toHaveBeenCalled();
      });

      it('should use cache when force refresh is false (default behavior)', async () => {
        mockInspectImageRemote.mockResolvedValue(mockManifest);
        mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'cache-key' });
        mockCacheRestore.mockResolvedValueOnce({ success: true, cacheKey: 'manifest-cache-key' });
        mockLoadImageFromTar.mockResolvedValue(true);
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);
        mockReadManifestFromFile.mockResolvedValue(mockManifest);

        const result = await processService(serviceDefinition, 'test-cache', false, false);

        expect(result.success).toBe(true);
        expect(result.restoredFromCache).toBe(true);
        // Cache restore SHOULD be called when force refresh is false
        expect(mockCacheRestore).toHaveBeenCalled();
        expect(mockLoadImageFromTar).toHaveBeenCalled();
      });
    });

    describe('registry unavailable fallback', () => {
      it('should fallback to cached version when registry is unavailable and skip-digest-verification is enabled', async () => {
        // Registry unavailable (returns undefined)
        mockInspectImageRemote.mockResolvedValue(undefined);
        // Cache hit with prefix matching
        mockCacheRestore.mockResolvedValue({ success: true, cacheKey: 'test-cache-nginx-latest-default-abc123' });
        mockLoadImageFromTar.mockResolvedValue(true);
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

        const result = await processService(serviceDefinition, 'test-cache', true, false);

        expect(result.success).toBe(true);
        expect(result.restoredFromCache).toBe(true);
        expect(result.digest).toBeUndefined();
        expect(result.cacheKey).toBe('test-cache-nginx-latest-default-abc123');
        expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Registry unavailable for nginx:latest'));
        expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Using cached version'));
      });

      it('should fail when registry is unavailable, skip-digest-verification is enabled, but no cache exists', async () => {
        // Registry unavailable
        mockInspectImageRemote.mockResolvedValue(undefined);
        // Cache miss
        mockCacheRestore.mockResolvedValue({ success: false });

        const result = await processService(serviceDefinition, 'test-cache', true, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Could not get digest');
        expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Could not get digest'));
      });

      it('should fail when registry is unavailable and skip-digest-verification is disabled', async () => {
        // Registry unavailable
        mockInspectImageRemote.mockResolvedValue(undefined);

        const result = await processService(serviceDefinition, 'test-cache', false, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Could not get digest');
        // Should not attempt fallback cache restore
        expect(mockCacheRestore).not.toHaveBeenCalled();
      });

      it('should fail when registry is unavailable and force-refresh is enabled (even with skip-digest-verification)', async () => {
        // Registry unavailable
        mockInspectImageRemote.mockResolvedValue(undefined);

        const result = await processService(serviceDefinition, 'test-cache', true, true);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Could not get digest');
        // Should not attempt fallback cache restore when force-refresh is enabled
        expect(mockCacheRestore).not.toHaveBeenCalled();
      });

      it('should fail fallback when cache restore succeeds but image load fails', async () => {
        // Registry unavailable
        mockInspectImageRemote.mockResolvedValue(undefined);
        // Cache hit
        mockCacheRestore.mockResolvedValue({ success: true, cacheKey: 'cache-key' });
        // But image load fails
        mockLoadImageFromTar.mockResolvedValue(false);

        const result = await processService(serviceDefinition, 'test-cache', true, false);

        expect(result.success).toBe(false);
        expect(result.error).toContain('Could not get digest');
      });

      it('should handle registry unavailable fallback with platform-specific image', async () => {
        // Registry unavailable
        mockInspectImageRemote.mockResolvedValue(undefined);
        // Cache hit
        mockCacheRestore.mockResolvedValue({ success: true, cacheKey: 'test-cache-nginx-latest-linux/arm64-abc123' });
        mockLoadImageFromTar.mockResolvedValue(true);
        mockInspectImageLocal.mockResolvedValue(mockInspectInfo);

        const result = await processService(serviceWithPlatform, 'test-cache', true, false);

        expect(result.success).toBe(true);
        expect(result.restoredFromCache).toBe(true);
        expect(result.platform).toBe('linux/arm64');
        expect(mockCoreWarning).toHaveBeenCalledWith(expect.stringContaining('Registry unavailable for nginx:latest'));
      });
    });
  });
});
