import {
  ImageManifestParser,
  isMultiPlatformManifest,
  MultiPlatformImageManifest,
} from '../../src/docker/image-manifest-parser';

describe('ImageManifestParser', () => {
  let parser: ImageManifestParser;

  beforeEach(() => {
    parser = new ImageManifestParser();
  });

  describe('parse', () => {
    describe('normal cases', () => {
      it('should parse a valid single-platform manifest', () => {
        // Arrange
        const singleManifestJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: 'sha256:1234567890abcdef',
          config: { digest: 'sha256:0987654321fedcba' },
        });

        // Act
        const result = parser.parse(singleManifestJson);

        // Assert
        expect(result).toEqual({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: 'sha256:1234567890abcdef',
          config: { digest: 'sha256:0987654321fedcba' },
        });
        expect(isMultiPlatformManifest(result)).toBe(false);
      });

      it('should parse a valid multi-platform manifest', () => {
        // Arrange
        const multiManifestJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:1111111111aaaaaaaa',
              platform: { architecture: 'amd64', os: 'linux' },
            },
            {
              digest: 'sha256:2222222222bbbbbbbb',
              platform: { architecture: 'arm64', os: 'linux', variant: 'v8' },
            },
          ],
        });

        // Act
        const result = parser.parse(multiManifestJson);

        // Assert
        expect(result).toEqual({
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            {
              digest: 'sha256:1111111111aaaaaaaa',
              platform: { architecture: 'amd64', os: 'linux' },
            },
            {
              digest: 'sha256:2222222222bbbbbbbb',
              platform: { architecture: 'arm64', os: 'linux', variant: 'v8' },
            },
          ],
        });
        expect(isMultiPlatformManifest(result)).toBe(true);
      });
    });

    describe('edge cases', () => {
      it('should handle additional fields in manifest', () => {
        // Arrange
        const jsonWithExtraFields = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: 'sha256:1234567890abcdef',
          schemaVersion: 2,
          extraField: 'value',
          size: 1024,
        });

        // Act
        const result = parser.parse(jsonWithExtraFields);

        // Assert
        expect(result.mediaType).toBe('application/vnd.docker.distribution.manifest.v2+json');
        expect(result.digest).toBe('sha256:1234567890abcdef');
        expect(isMultiPlatformManifest(result)).toBe(false);
      });

      it('should handle empty manifests array in multi-platform manifest', () => {
        // Arrange
        const emptyManifestsJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [],
        });

        // Act
        const result = parser.parse(emptyManifestsJson);

        // Assert
        expect(result.mediaType).toBe('application/vnd.docker.distribution.manifest.list.v2+json');
        expect(isMultiPlatformManifest(result)).toBe(true);
        expect((result as MultiPlatformImageManifest).manifests).toEqual([]);
      });
    });

    describe('error cases', () => {
      it('should throw error when input is not valid JSON', () => {
        // Arrange
        const invalidJson = '{not valid json}';

        // Act & Assert
        expect(() => parser.parse(invalidJson)).toThrow('Failed to parse input as JSON');
      });

      it('should throw error when parsed data is not an object', () => {
        // Arrange
        const nonObjectJson = JSON.stringify('string value');

        // Act & Assert
        expect(() => parser.parse(nonObjectJson)).toThrow('Parsed data is not an object');
      });

      it('should throw error when mediaType is missing', () => {
        // Arrange
        const missingMediaTypeJson = JSON.stringify({
          digest: 'sha256:1234567890abcdef',
        });

        // Act & Assert
        expect(() => parser.parse(missingMediaTypeJson)).toThrow('lacks required top-level "mediaType" string');
      });

      it('should throw error when not matching expected manifest structure', () => {
        // Arrange
        const invalidStructureJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          // Missing digest
        });

        // Act & Assert
        expect(() => parser.parse(invalidStructureJson)).toThrow(
          'does not match expected single or multi-platform manifest structure'
        );
      });

      it('should throw error when manifests array contains invalid entries', () => {
        // Arrange
        const invalidManifestsJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
          manifests: [
            { digest: 'sha256:1111111111aaaaaaaa' },
            { platform: { architecture: 'arm64', os: 'linux' } }, // Missing digest
          ],
        });

        // Act & Assert
        expect(() => parser.parse(invalidManifestsJson)).toThrow('invalid structure within "manifests" array');
      });

      it('should throw error for invalid digest format', () => {
        // Arrange
        const invalidDigestJson = JSON.stringify({
          mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
          digest: 'invalid-digest-format',
        });

        // Act & Assert
        expect(() => parser.parse(invalidDigestJson)).toThrow(
          'does not match expected single or multi-platform manifest structure'
        );
      });
    });
  });

  describe('isMultiPlatformManifest', () => {
    it('should correctly identify multi-platform manifests', () => {
      // Arrange
      const multiPlatform = {
        mediaType: 'application/vnd.docker.distribution.manifest.list.v2+json',
        manifests: [{ digest: 'sha256:1234567890abcdef' }],
      };

      // Act & Assert
      expect(isMultiPlatformManifest(multiPlatform)).toBe(true);
    });

    it('should correctly identify single-platform manifests', () => {
      // Arrange
      const singlePlatform = {
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        digest: 'sha256:1234567890abcdef',
      };

      // Act & Assert
      expect(isMultiPlatformManifest(singlePlatform)).toBe(false);
    });
  });
});
