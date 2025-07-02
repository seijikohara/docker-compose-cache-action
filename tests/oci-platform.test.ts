import { getCurrentPlatformInfo, parseOciPlatformString } from '../src/oci-platform';

describe('platform', () => {
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
      expect(platformInfo).toEqual({ os: 'unknown', arch: 'amd64', variant: undefined });
      mockPlatformAndArch('linux', 'unknown');
      platformInfo = getCurrentPlatformInfo();
      expect(platformInfo).toEqual({ os: 'linux', arch: 'unknown', variant: undefined });
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

  describe('parseOciPlatformString', () => {
    it('should correctly parse standard platform strings', () => {
      const linuxAmd64 = parseOciPlatformString('linux/amd64');
      expect(linuxAmd64).toEqual({
        os: 'linux',
        arch: 'amd64',
        variant: undefined,
      });
      const windowsArm64 = parseOciPlatformString('windows/arm64');
      expect(windowsArm64).toEqual({
        os: 'windows',
        arch: 'arm64',
        variant: undefined,
      });
    });

    it('should correctly parse platform strings with variants', () => {
      const linuxArmV7 = parseOciPlatformString('linux/arm/v7');
      expect(linuxArmV7).toEqual({
        os: 'linux',
        arch: 'arm',
        variant: 'v7',
      });
      const linuxArmV6 = parseOciPlatformString('linux/arm/v6');
      expect(linuxArmV6).toEqual({
        os: 'linux',
        arch: 'arm',
        variant: 'v6',
      });
    });

    it('should handle Node.js platform mappings correctly', () => {
      const darwinX64 = parseOciPlatformString('darwin/x64');
      expect(darwinX64).toEqual({
        os: 'darwin',
        arch: 'amd64',
        variant: undefined,
      });
      const linuxX86 = parseOciPlatformString('linux/x86');
      expect(linuxX86).toEqual({
        os: 'linux',
        arch: '386',
        variant: undefined,
      });
    });

    it('should return undefined for invalid platform strings', () => {
      expect(parseOciPlatformString('')).toBeUndefined();
      expect(parseOciPlatformString('/')).toBeUndefined();
      expect(parseOciPlatformString('linux')).toBeUndefined();
      expect(parseOciPlatformString('linux/')).toBeUndefined();
      expect(parseOciPlatformString('/amd64')).toBeUndefined();
      // For unknown OS or arch, the function returns the input as-is, not undefined
      expect(parseOciPlatformString('unknown/amd64')).toEqual({ os: 'unknown', arch: 'amd64', variant: undefined });
      expect(parseOciPlatformString('linux/unknown')).toEqual({ os: 'linux', arch: 'unknown', variant: undefined });
    });

    it('should handle undefined input', () => {
      expect(parseOciPlatformString(undefined)).toBeUndefined();
    });
  });
});
