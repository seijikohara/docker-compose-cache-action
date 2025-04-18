import { getCurrentOciPlatform, mapNodeArchToOciArch, mapNodeOsToOciOs, normalizePlatform } from '../src/platform';

// Mock the process.platform and process.arch
const originalPlatform = process.platform;
const originalArch = process.arch;

describe('Platform Utilities', () => {
  // Restore the original process properties after all tests
  afterAll(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    Object.defineProperty(process, 'arch', {
      value: originalArch,
    });
  });

  // Reset mocks before each test
  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    Object.defineProperty(process, 'arch', {
      value: originalArch,
    });
  });

  describe('mapNodeArchToOciArch', () => {
    describe('normal cases', () => {
      it('should map common Node.js architectures to OCI architectures', () => {
        // Arrange & Act & Assert
        expect(mapNodeArchToOciArch('x64')).toBe('amd64');
        expect(mapNodeArchToOciArch('arm64')).toBe('arm64');
        expect(mapNodeArchToOciArch('ia32')).toBe('386');
      });

      it('should handle architectures that are already OCI format', () => {
        // Arrange & Act & Assert
        expect(mapNodeArchToOciArch('amd64')).toBe('amd64');
        expect(mapNodeArchToOciArch('s390x')).toBe('s390x');
      });
    });

    describe('edge cases', () => {
      it('should handle alternative architecture names', () => {
        // Arrange & Act & Assert
        expect(mapNodeArchToOciArch('x86_64')).toBe('amd64');
        expect(mapNodeArchToOciArch('aarch64')).toBe('arm64');
      });
    });

    describe('error cases', () => {
      it('should return undefined for unknown architectures', () => {
        // Arrange & Act & Assert
        expect(mapNodeArchToOciArch('unknown-arch')).toBeUndefined();
      });
    });
  });

  describe('mapNodeOsToOciOs', () => {
    describe('normal cases', () => {
      it('should map common Node.js platform identifiers to OCI OS identifiers', () => {
        // Arrange & Act & Assert
        expect(mapNodeOsToOciOs('linux')).toBe('linux');
        expect(mapNodeOsToOciOs('win32')).toBe('windows');
        expect(mapNodeOsToOciOs('darwin')).toBe('darwin');
      });

      it('should handle OS names that are already OCI format', () => {
        // Arrange & Act & Assert
        expect(mapNodeOsToOciOs('linux')).toBe('linux');
        expect(mapNodeOsToOciOs('freebsd')).toBe('freebsd');
      });
    });

    describe('error cases', () => {
      it('should return undefined for unknown OS identifiers', () => {
        // Arrange & Act & Assert
        expect(mapNodeOsToOciOs('unknown-os')).toBeUndefined();
      });
    });
  });

  describe('getCurrentOciPlatform', () => {
    describe('normal cases', () => {
      it('should return correct platform string for linux/amd64', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'linux' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        // Act
        const result = getCurrentOciPlatform();

        // Assert
        expect(result).toBe('linux/amd64');
      });

      it('should return correct platform string for darwin/arm64', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'darwin' });
        Object.defineProperty(process, 'arch', { value: 'arm64' });

        // Act
        const result = getCurrentOciPlatform();

        // Assert
        expect(result).toBe('darwin/arm64');
      });

      it('should return correct platform string for windows/amd64', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'win32' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        // Act
        const result = getCurrentOciPlatform();

        // Assert
        expect(result).toBe('windows/amd64');
      });
    });

    describe('error cases', () => {
      it('should return null when platform mapping fails', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'unknown-platform' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        // Act
        const result = getCurrentOciPlatform();

        // Assert
        expect(result).toBeNull();
      });

      it('should return null when architecture mapping fails', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'linux' });
        Object.defineProperty(process, 'arch', { value: 'unknown-arch' });

        // Act
        const result = getCurrentOciPlatform();

        // Assert
        expect(result).toBeNull();
      });
    });
  });

  describe('normalizePlatform', () => {
    describe('normal cases', () => {
      it('should replace slashes with underscores in platform string', () => {
        // Arrange & Act & Assert
        expect(normalizePlatform('linux/amd64')).toBe('linux_amd64');
        expect(normalizePlatform('linux/arm64/v8')).toBe('linux_arm64_v8');
      });

      it('should use current platform when input is undefined', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'linux' });
        Object.defineProperty(process, 'arch', { value: 'x64' });

        // Act
        const result = normalizePlatform(undefined);

        // Assert
        expect(result).toBe('linux_amd64');
      });
    });

    describe('edge cases', () => {
      it('should fall back to unknown_platform when platform detection fails', () => {
        // Arrange
        Object.defineProperty(process, 'platform', { value: 'unknown-platform' });
        Object.defineProperty(process, 'arch', { value: 'unknown-arch' });

        // Act
        const result = normalizePlatform(undefined);

        // Assert
        expect(result).toBe('unknown_platform');
      });

      it('should handle empty platform string', () => {
        // Arrange & Act & Assert
        expect(normalizePlatform('')).toBe('');
      });
    });
  });
});
