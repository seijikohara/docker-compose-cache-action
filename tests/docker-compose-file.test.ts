import * as fs from 'node:fs';
import * as core from '@actions/core';

import {
  getComposeFilePathsToProcess,
  getComposeServicesFromFiles,
  matchesExcludePattern,
} from '../src/docker-compose-file';

jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  warning: jest.fn(),
}));
jest.mock('fs');

describe('docker-compose-file', () => {
  describe('getComposeServicesFromFiles', () => {
    const warningMock = core.warning as jest.Mock;
    const debugMock = core.debug as jest.Mock;

    beforeEach(() => {
      jest.clearAllMocks();
      (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    const createYaml = (services: Record<string, { image?: string; platform?: string }>) =>
      `services:\n${Object.entries(services)
        .map(
          ([name, conf]) =>
            `  ${name}:\n    ${conf.image ? `image: ${conf.image}` : ''}${conf.platform ? `\n    platform: ${conf.platform}` : ''}`
        )
        .join('\n')}`;

    it('extracts services with image from a single file', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(createYaml({ nginx: { image: 'nginx:latest' } }));
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('extracts platform if present', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(
        createYaml({ nginx: { image: 'nginx:latest', platform: 'linux/amd64' } })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest', platform: 'linux/amd64' }]);
    });

    it('excludes images in exclude list', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(
        createYaml({ nginx: { image: 'nginx:latest' }, redis: { image: 'redis:alpine' } })
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], ['redis:alpine']);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('merges services from multiple files', () => {
      (fs.readFileSync as jest.Mock).mockImplementation((file) => {
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
      (fs.readFileSync as jest.Mock).mockReturnValue(
        'services:\n  app:\n    build: .\n  nginx:\n    image: nginx:latest'
      );
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('searches default files if no input', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(createYaml({ nginx: { image: 'nginx:latest' } }));
      const result = getComposeServicesFromFiles(['compose.yaml'], []);
      expect(result).toEqual([{ image: 'nginx:latest' }]);
    });

    it('returns empty if file is empty', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('');
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([]);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('Empty or invalid YAML file'));
    });

    it('returns empty if no services section', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue('version: "3.8"');
      const result = getComposeServicesFromFiles(['docker-compose.yml'], []);
      expect(result).toEqual([]);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('No services section'));
    });

    it('returns empty and warns on parse error', () => {
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
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
      (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
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
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = getComposeFilePathsToProcess(['nonexistent1.yml', 'nonexistent2.yml']);
      expect(result).toEqual([]);
    });

    it('should return default compose files when no paths provided and defaults exist', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
        return filePath === 'docker-compose.yml';
      });

      const result = getComposeFilePathsToProcess([]);
      expect(result).toEqual(['docker-compose.yml']);
    });

    it('should return empty array when no paths provided and no defaults exist', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const result = getComposeFilePathsToProcess([]);
      expect(result).toEqual([]);
    });

    it('should handle mixed existing and non-existing default files', () => {
      (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
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
      (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    const createYaml = (services: Record<string, { image?: string; platform?: string }>) =>
      `services:\n${Object.entries(services)
        .map(
          ([name, conf]) =>
            `  ${name}:\n    ${conf.image ? `image: ${conf.image}` : ''}${conf.platform ? `\n    platform: ${conf.platform}` : ''}`
        )
        .join('\n')}`;

    it('should exclude images matching wildcard pattern nginx:*', () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(
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
      (fs.readFileSync as jest.Mock).mockReturnValue(
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
      (fs.readFileSync as jest.Mock).mockReturnValue(
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
      (fs.readFileSync as jest.Mock).mockReturnValue(
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
      (fs.readFileSync as jest.Mock).mockReturnValue(
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
