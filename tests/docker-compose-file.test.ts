import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('@actions/core', () => ({
  debug: jest.fn(),
  warning: jest.fn(),
}));

jest.unstable_mockModule('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

const fs = await import('node:fs');
const core = await import('@actions/core');
const { getComposeFilePathsToProcess, getComposeServicesFromFiles, matchesExcludePattern } = await import(
  '../src/docker-compose-file.js'
);

const existsSyncMock = jest.mocked(fs.existsSync);
const readFileSyncMock = jest.mocked(fs.readFileSync);
const warningMock = jest.mocked(core.warning);
const debugMock = jest.mocked(core.debug);

describe('docker-compose-file', () => {
  describe('getComposeServicesFromFiles', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      existsSyncMock.mockReturnValue(true);
    });

    const createYaml = (services: Record<string, { image?: string; platform?: string }>) =>
      `services:\n${Object.entries(services)
        .map(
          ([name, conf]) =>
            `  ${name}:\n    ${conf.image ? `image: ${conf.image}` : ''}${conf.platform ? `\n    platform: ${conf.platform}` : ''}`
        )
        .join('\n')}`;

    it('extracts services with image from a single file', () => {
      readFileSyncMock.mockReturnValue(createYaml({ nginx: { image: 'nginx:latest' } }));
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('extracts platform if present', () => {
      readFileSyncMock.mockReturnValue(createYaml({ nginx: { image: 'nginx:latest', platform: 'linux/amd64' } }));
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest', platform: 'linux/amd64' }]);
    });

    it('excludes images in exclude list', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({ nginx: { image: 'nginx:latest' }, redis: { image: 'redis:alpine' } })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['redis:alpine']);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('merges services from multiple files', () => {
      readFileSyncMock.mockImplementation((file) => {
        if (file === 'a.yml') {
          return createYaml({ nginx: { image: 'nginx:latest' } });
        }
        if (file === 'b.yml') {
          return createYaml({ redis: { image: 'redis:alpine' } });
        }
        return '';
      });
      const result = getComposeServicesFromFiles(['a.yml', 'b.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }, { image: 'redis:alpine' }]);
    });

    it('ignores services without image', () => {
      readFileSyncMock.mockReturnValue('services:\n  app:\n    build: .\n  nginx:\n    image: nginx:latest');
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('searches default files if no input', () => {
      readFileSyncMock.mockReturnValue(createYaml({ nginx: { image: 'nginx:latest' } }));
      const result = getComposeServicesFromFiles(['compose.yaml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('returns empty if file is empty', () => {
      readFileSyncMock.mockReturnValue('');
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([]);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('Empty or invalid YAML file'));
    });

    it('returns empty if no services section', () => {
      readFileSyncMock.mockReturnValue('version: "3.8"');
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([]);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('No services section'));
    });

    it('returns empty and warns on parse error', () => {
      readFileSyncMock.mockImplementation(() => {
        throw new Error('parse error');
      });
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([]);
      expect(warningMock).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    });
  });

  describe('getComposeFilePathsToProcess', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should return provided file paths when they exist', () => {
      existsSyncMock.mockImplementation((filePath) => {
        return filePath === 'docker-compose.yml' || filePath === 'docker-compose.override.yml';
      });

      const result = getComposeFilePathsToProcess([
        'docker-compose.yml',
        'docker-compose.override.yml',
        'nonexistent.yml',
      ]);
      expect(result).toEqual(['docker-compose.yml', 'docker-compose.override.yml']);
    });

    it('should return empty array when no provided files exist', () => {
      existsSyncMock.mockReturnValue(false);

      const result = getComposeFilePathsToProcess(['nonexistent1.yml', 'nonexistent2.yml']);
      expect(result).toEqual([]);
    });

    it('should return default compose files when no paths provided and defaults exist', () => {
      existsSyncMock.mockImplementation((filePath) => {
        return filePath === 'docker-compose.yml';
      });

      const result = getComposeFilePathsToProcess([]);
      expect(result).toEqual(['docker-compose.yml']);
    });

    it('should return empty array when no paths provided and no defaults exist', () => {
      existsSyncMock.mockReturnValue(false);

      const result = getComposeFilePathsToProcess([]);
      expect(result).toEqual([]);
    });

    it('should handle mixed existing and non-existing default files', () => {
      existsSyncMock.mockImplementation((filePath) => {
        return filePath === 'docker-compose.yaml'; // Only .yaml exists, not .yml
      });

      const result = getComposeFilePathsToProcess([]);
      expect(result).toEqual(['docker-compose.yaml']);
    });
  });

  describe('matchesExcludePattern', () => {
    describe('exact matching', () => {
      it('should match exact image name', () => {
        expect(matchesExcludePattern('nginx:latest', ['nginx:latest'])).toBe(true);
      });

      it('should not match different image name', () => {
        expect(matchesExcludePattern('nginx:latest', ['redis:alpine'])).toBe(false);
      });

      it('should match one of multiple patterns', () => {
        expect(matchesExcludePattern('redis:alpine', ['nginx:latest', 'redis:alpine'])).toBe(true);
      });

      it('should return false for empty patterns', () => {
        expect(matchesExcludePattern('nginx:latest', [])).toBe(false);
      });
    });

    describe('wildcard * matching', () => {
      it('should match all tags with image:*', () => {
        expect(matchesExcludePattern('nginx:latest', ['nginx:*'])).toBe(true);
        expect(matchesExcludePattern('nginx:1.25', ['nginx:*'])).toBe(true);
        expect(matchesExcludePattern('nginx:alpine', ['nginx:*'])).toBe(true);
      });

      it('should not match different image with image:*', () => {
        expect(matchesExcludePattern('redis:alpine', ['nginx:*'])).toBe(false);
      });

      it('should match all images with specific tag using *:tag', () => {
        expect(matchesExcludePattern('nginx:latest', ['*:latest'])).toBe(true);
        expect(matchesExcludePattern('redis:latest', ['*:latest'])).toBe(true);
        expect(matchesExcludePattern('myregistry.com/app:latest', ['*:latest'])).toBe(true);
      });

      it('should not match different tag with *:tag', () => {
        expect(matchesExcludePattern('nginx:alpine', ['*:latest'])).toBe(false);
      });

      it('should match registry prefix with registry/*', () => {
        expect(matchesExcludePattern('ghcr.io/myorg/app:latest', ['ghcr.io/myorg/*'])).toBe(true);
        expect(matchesExcludePattern('ghcr.io/myorg/another:v1', ['ghcr.io/myorg/*'])).toBe(true);
      });

      it('should not match different registry', () => {
        expect(matchesExcludePattern('docker.io/myorg/app:latest', ['ghcr.io/myorg/*'])).toBe(false);
      });

      it('should match with wildcard in middle', () => {
        expect(matchesExcludePattern('myregistry.com/app:latest', ['myregistry.com/*:latest'])).toBe(true);
        expect(matchesExcludePattern('myregistry.com/service:latest', ['myregistry.com/*:latest'])).toBe(true);
      });

      it('should match everything with *', () => {
        expect(matchesExcludePattern('nginx:latest', ['*'])).toBe(true);
        expect(matchesExcludePattern('ghcr.io/org/app:v1.0.0', ['*'])).toBe(true);
      });
    });

    describe('wildcard ? matching', () => {
      it('should match single character with ?', () => {
        expect(matchesExcludePattern('app1:latest', ['app?:latest'])).toBe(true);
        expect(matchesExcludePattern('app2:latest', ['app?:latest'])).toBe(true);
        expect(matchesExcludePattern('appX:latest', ['app?:latest'])).toBe(true);
      });

      it('should not match multiple characters with single ?', () => {
        expect(matchesExcludePattern('app12:latest', ['app?:latest'])).toBe(false);
      });

      it('should match multiple single characters with multiple ?', () => {
        expect(matchesExcludePattern('app12:latest', ['app??:latest'])).toBe(true);
      });
    });

    describe('combined patterns', () => {
      it('should match with both * and ?', () => {
        expect(matchesExcludePattern('app1:v1.0', ['app?:v*'])).toBe(true);
        expect(matchesExcludePattern('app2:v2.0.1', ['app?:v*'])).toBe(true);
      });

      it('should handle complex patterns', () => {
        expect(matchesExcludePattern('myregistry.com/team-a/service:1.0', ['myregistry.com/team-?/*:*'])).toBe(true);
      });
    });

    describe('special regex characters', () => {
      it('should escape dots in pattern', () => {
        expect(matchesExcludePattern('myregistry.com/app:latest', ['myregistry.com/*'])).toBe(true);
        expect(matchesExcludePattern('myregistryXcom/app:latest', ['myregistry.com/*'])).toBe(false);
      });

      it('should escape other special characters', () => {
        expect(matchesExcludePattern('app[1]:latest', ['app[1]:latest'])).toBe(true);
        expect(matchesExcludePattern('app(test):latest', ['app(test):latest'])).toBe(true);
      });
    });
  });

  describe('getComposeServicesFromFiles with wildcard patterns', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      existsSyncMock.mockReturnValue(true);
    });

    const createYaml = (services: Record<string, { image?: string; platform?: string }>) =>
      `services:\n${Object.entries(services)
        .map(
          ([name, conf]) =>
            `  ${name}:\n    ${conf.image ? `image: ${conf.image}` : ''}${conf.platform ? `\n    platform: ${conf.platform}` : ''}`
        )
        .join('\n')}`;

    it('should exclude images matching wildcard pattern nginx:*', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({
          nginx1: { image: 'nginx:latest' },
          nginx2: { image: 'nginx:alpine' },
          redis: { image: 'redis:alpine' },
        })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['nginx:*']);
      expect(result).toEqual([{ image: 'redis:alpine' }]);
    });

    it('should exclude all latest tags with *:latest pattern', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({
          nginx: { image: 'nginx:latest' },
          redis: { image: 'redis:latest' },
          postgres: { image: 'postgres:15' },
        })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['*:latest']);
      expect(result).toEqual([{ image: 'postgres:15' }]);
    });

    it('should exclude registry-specific images', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({
          app: { image: 'ghcr.io/myorg/app:latest' },
          service: { image: 'ghcr.io/myorg/service:v1' },
          nginx: { image: 'nginx:latest' },
        })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['ghcr.io/myorg/*']);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('should support multiple wildcard patterns', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({
          nginx: { image: 'nginx:latest' },
          redis: { image: 'redis:alpine' },
          postgres: { image: 'postgres:15' },
          mysql: { image: 'mysql:8' },
        })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['nginx:*', 'mysql:*']);
      expect(result).toEqual([{ image: 'redis:alpine' }, { image: 'postgres:15' }]);
    });

    it('should support mixed exact and wildcard patterns', () => {
      readFileSyncMock.mockReturnValue(
        createYaml({
          nginx: { image: 'nginx:latest' },
          redis: { image: 'redis:alpine' },
          postgres: { image: 'postgres:15' },
        })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['nginx:latest', 'postgres:*']);
      expect(result).toEqual([{ image: 'redis:alpine' }]);
    });
  });
});
