import { getCurrentPlatformInfo, parsePlatformString, PlatformInfo, sanitizePlatformComponent } from '../src/platform';

/**
 * Test suite for the platform utility module.
 *
 * These tests verify the functionality of platform detection and platform string
 * handling utilities that are critical for cross-platform Docker image cache keys.
 */
describe('Platform Module', () => {
  /**
   * Tests for getCurrentPlatformInfo which provides platform information for the current environment.
   */
  describe('getCurrentPlatformInfo', () => {
    // Store original platform and architecture values
    const originalPlatform = process.platform;
    const originalArch = process.arch;

    // Mock setup and teardown
    beforeEach(() => {
      jest.resetAllMocks();
    });

    // Restore original values after all tests
    afterAll(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      Object.defineProperty(process, 'arch', { value: originalArch });
    });

    /**
     * Helper function to mock process.platform and process.arch for testing
     */
    const mockPlatformAndArch = (platform: string, arch: string): void => {
      Object.defineProperty(process, 'platform', { value: platform });
      Object.defineProperty(process, 'arch', { value: arch });
    };

    it('should return platform info for Linux x64', () => {
      // Arrange
      mockPlatformAndArch('linux', 'x64');

      // Act
      const result = getCurrentPlatformInfo();

      // Assert
      expect(result).not.toBeNull();
      expect(result?.os).toBe('linux');
      expect(result?.arch).toBe('amd64');
      expect(result?.variant).toBeUndefined();
    });

    it('should return platform info for Windows arm64', () => {
      // Arrange
      mockPlatformAndArch('win32', 'arm64');

      // Act
      const result = getCurrentPlatformInfo();

      // Assert
      expect(result).not.toBeNull();
      expect(result?.os).toBe('windows');
      expect(result?.arch).toBe('arm64');
      // ARM64 should typically have a variant
      expect(result?.variant).toBe('v8');
    });

    it('should return platform info for macOS', () => {
      // Arrange
      mockPlatformAndArch('darwin', 'x64');

      // Act
      const result = getCurrentPlatformInfo();

      // Assert
      expect(result).not.toBeNull();
      expect(result?.os).toBe('darwin');
      expect(result?.arch).toBe('amd64');
    });

    it('should handle unknown platform', () => {
      // Arrange
      mockPlatformAndArch('unknown', 'x64');

      // Act
      const result = getCurrentPlatformInfo();

      // Assert
      expect(result).toBeNull();
    });

    it('should handle unknown architecture', () => {
      // Arrange
      mockPlatformAndArch('linux', 'unknown');

      // Act
      const result = getCurrentPlatformInfo();

      // Assert
      expect(result).toBeNull();
    });
  });

  /**
   * Tests for parsePlatformString which parses platform strings into components.
   */
  describe('parsePlatformString', () => {
    it('should parse valid platform strings', () => {
      // Basic platform strings
      expect(parsePlatformString('linux/amd64')).toEqual({
        os: 'linux',
        arch: 'amd64',
      });

      // Platform strings with variant
      expect(parsePlatformString('linux/amd64/v2')).toEqual({
        os: 'linux',
        arch: 'amd64',
        variant: 'v2',
      });

      expect(parsePlatformString('windows/arm64/v8')).toEqual({
        os: 'windows',
        arch: 'arm64',
        variant: 'v8',
      });
    });

    it('should handle invalid platform strings', () => {
      // Empty string
      expect(parsePlatformString('')).toBeNull();

      // Null or undefined
      expect(parsePlatformString(null)).toBeNull();
      expect(parsePlatformString(undefined)).toBeNull();

      // Invalid format (too few parts)
      expect(parsePlatformString('linux')).toBeNull();

      // Invalid format (too many parts)
      expect(parsePlatformString('linux/amd64/v2/extra')).toBeNull();
    });
  });

  /**
   * Tests for sanitizePlatformComponent which normalizes platform components for safe use.
   */
  describe('sanitizePlatformComponent', () => {
    it('should keep valid characters unchanged', () => {
      // Standard components should remain unchanged
      expect(sanitizePlatformComponent('linux')).toBe('linux');
      expect(sanitizePlatformComponent('amd64')).toBe('amd64');
      expect(sanitizePlatformComponent('v8')).toBe('v8');

      // Special characters that are allowed
      expect(sanitizePlatformComponent('special.name-here')).toBe('special.name-here');
      expect(sanitizePlatformComponent('name_with_underscore')).toBe('name_with_underscore');
    });

    it('should replace invalid characters', () => {
      // Replace invalid characters with underscores
      expect(sanitizePlatformComponent('linux/amd64')).toBe('linux_amd64');
      expect(sanitizePlatformComponent('invalid*chars?')).toBe('invalid_chars_');
      expect(sanitizePlatformComponent('spaces should be replaced')).toBe('spaces_should_be_replaced');
    });

    it('should handle empty or undefined input', () => {
      // Special handling for empty or undefined
      expect(sanitizePlatformComponent('')).toBe('none');
      expect(sanitizePlatformComponent(undefined)).toBe('none');
    });
  });
});
