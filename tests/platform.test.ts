import { getCurrentPlatformInfo, sanitizePlatformComponent } from '../src/platform';

describe('Platform Module', () => {
  describe('getCurrentPlatformInfo', () => {
    // Store original platform and architecture values
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    /**
     * Helper function to mock process.platform and process.arch for testing
     */
    const mockPlatformAndArch = (platform: string, arch: string) => {
      Object.defineProperty(process, 'platform', { value: platform });
      Object.defineProperty(process, 'arch', { value: arch });
    };

    // Restore original values after tests
    afterAll(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      Object.defineProperty(process, 'arch', { value: originalArch });
    });

    it('should return platform info for Linux x64', () => {
      mockPlatformAndArch('linux', 'x64');
      const result = getCurrentPlatformInfo();

      expect(result).not.toBeNull();
      expect(result?.os).toBe('linux');
      expect(result?.arch).toBe('amd64');
      expect(result?.variant).toBeUndefined();
    });

    it('should return platform info for Windows arm64', () => {
      mockPlatformAndArch('win32', 'arm64');
      const result = getCurrentPlatformInfo();

      expect(result).not.toBeNull();
      expect(result?.os).toBe('windows');
      expect(result?.arch).toBe('arm64');
    });

    it('should return platform info for macOS', () => {
      mockPlatformAndArch('darwin', 'x64');
      const result = getCurrentPlatformInfo();

      expect(result).not.toBeNull();
      expect(result?.os).toBe('darwin');
      expect(result?.arch).toBe('amd64');
    });

    it('should handle unknown platform or architecture', () => {
      mockPlatformAndArch('unknown', 'x64');
      let result = getCurrentPlatformInfo();
      expect(result).toBeNull();

      mockPlatformAndArch('linux', 'unknown');
      result = getCurrentPlatformInfo();
      expect(result).toBeNull();
    });

    it('should return platform info for Linux arm v7', () => {
      mockPlatformAndArch('linux', 'arm');
      Object.defineProperty(process, 'config', {
        value: { variables: { arm_version: '7' } },
      });
      const result = getCurrentPlatformInfo();

      expect(result).not.toBeNull();
      expect(result?.os).toBe('linux');
      expect(result?.arch).toBe('arm');
      expect(result?.variant).toBe('v7');
    });
  });

  describe('sanitizePlatformComponent', () => {
    it('should sanitize platform components correctly', () => {
      expect(sanitizePlatformComponent('linux')).toBe('linux');
      expect(sanitizePlatformComponent('amd64')).toBe('amd64');
      expect(sanitizePlatformComponent('v8')).toBe('v8');
      expect(sanitizePlatformComponent('linux/amd64')).toBe('linux_amd64');
      expect(sanitizePlatformComponent('special.name-here')).toBe('special.name-here');
      expect(sanitizePlatformComponent('invalid*chars?')).toBe('invalid_chars_');
      expect(sanitizePlatformComponent('')).toBe('none');
      expect(sanitizePlatformComponent(undefined)).toBe('none');
    });
  });
});
