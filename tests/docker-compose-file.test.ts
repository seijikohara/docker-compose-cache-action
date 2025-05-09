import * as core from '@actions/core';
import * as fs from 'fs';

import { getComposeServicesFromFiles } from '../src/docker-compose-file';

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
        if (file === 'a.yml') return createYaml({ nginx: { image: 'nginx:latest' } });
        if (file === 'b.yml') return createYaml({ redis: { image: 'redis:alpine' } });
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
});
