import { getCurrentPlatformInfo } from '../src/platform';

describe('Platform Module', () => {
  describe('getCurrentPlatformInfo', () => {
    // Store original platform and architecture values
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    /**
     * Helper function to mock process.platform and process.arch for testing
     */
    const mockPlatformAndArch = (platformValue: string, archValue: string) => {
      Object.defineProperty(process, 'platform', { value: platformValue });
      Object.defineProperty(process, 'arch', { value: archValue });
    };

    // Restore original values after tests
    afterAll(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      Object.defineProperty(process, 'arch', { value: originalArch });
    });

    it('should return platform info for Linux x64', () => {
      mockPlatformAndArch('linux', 'x64');
      const platformInfo = getCurrentPlatformInfo();

      expect(platformInfo).not.toBeUndefined();
      expect(platformInfo?.os).toBe('linux');
      expect(platformInfo?.arch).toBe('amd64');
      expect(platformInfo?.variant).toBeUndefined();
    });

    it('should return platform info for Windows arm64', () => {
      mockPlatformAndArch('win32', 'arm64');
      const platformInfo = getCurrentPlatformInfo();

      expect(platformInfo).not.toBeUndefined();
      expect(platformInfo?.os).toBe('windows');
      expect(platformInfo?.arch).toBe('arm64');
    });

    it('should return platform info for macOS', () => {
      mockPlatformAndArch('darwin', 'x64');
      const platformInfo = getCurrentPlatformInfo();

      expect(platformInfo).not.toBeUndefined();
      expect(platformInfo?.os).toBe('darwin');
      expect(platformInfo?.arch).toBe('amd64');
    });

    it('should handle unknown platform or architecture', () => {
      mockPlatformAndArch('unknown', 'x64');
      let platformInfo = getCurrentPlatformInfo();
      expect(platformInfo).toBeUndefined();

      mockPlatformAndArch('linux', 'unknown');
      platformInfo = getCurrentPlatformInfo();
      expect(platformInfo).toBeUndefined();
    });

    it('should return platform info for Linux arm v7', () => {
      mockPlatformAndArch('linux', 'arm');
      Object.defineProperty(process, 'config', {
        value: { variables: { arm_version: '7' } },
      });
      const platformInfo = getCurrentPlatformInfo();

      expect(platformInfo).not.toBeUndefined();
      expect(platformInfo?.os).toBe('linux');
      expect(platformInfo?.arch).toBe('arm');
      expect(platformInfo?.variant).toBe('v7');
    });
  });
});
