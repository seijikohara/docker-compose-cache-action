import * as core from '@actions/core';
import * as fs from 'fs';
import * as yaml from 'js-yaml';

import { getComposeServicesFromFiles } from '../src/docker-compose-file';

// Mock dependencies
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  warning: jest.fn(),
}));

jest.mock('fs');
jest.mock('js-yaml');

describe('Docker Compose File Module', () => {
  const warningMock = core.warning as jest.Mock;
  const debugMock = core.debug as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock existsSync to return true by default
    (fs.existsSync as jest.Mock).mockReturnValue(true);

    // Mock yaml.load to parse YAML content properly
    (yaml.load as jest.Mock).mockImplementation((content: string) => {
      // Return null for empty content
      if (!content) return null;

      // Version only case (no services section)
      if (content === 'version: "3.8"') {
        return { version: '3.8' };
      }

      // Parse content with services
      if (content.includes('services:')) {
        // Parse service lines from YAML content
        const serviceLines = content.split('\n').filter((line: string) => line.includes('image:'));
        const services: Record<string, Record<string, string>> = {};

        // Extract service names like 'nginx:'
        const serviceNameRegex = /\s+(\w+):/;
        const serviceNames = content
          .split('\n')
          .filter((line: string) => serviceNameRegex.test(line))
          .map((line: string) => line.match(serviceNameRegex)![1]);

        serviceNames.forEach((name: string, index: number) => {
          const serviceLine = serviceLines[index] || '';
          if (serviceLine) {
            const image = serviceLine.split('image:')[1]?.trim();
            if (image) {
              services[name] = { image };

              // Handle platform if specified
              const platformLine = content
                .split('\n')
                .find(
                  (line: string) =>
                    line.includes(`${name}:`) ||
                    (line.includes('platform:') && content.indexOf(line) > content.indexOf(`${name}:`))
                );
              if (platformLine && platformLine.includes('platform:')) {
                services[name].platform = platformLine.split('platform:')[1]?.trim();
              }
            }
          }
        });

        return { services };
      }

      return null;
    });
  });

  describe('getComposeServicesFromFiles', () => {
    /**
     * Helper function to create YAML content for testing
     */
    const createComposeYaml = (services: Record<string, { image: string; platform?: string }>) => {
      return `services:
${Object.entries(services)
  .map(
    ([name, config]) => `  ${name}:
    image: ${config.image}${config.platform ? `\n    platform: ${config.platform}` : ''}`
  )
  .join('\n')}`;
    };

    it('should find services from specific compose file', () => {
      const composeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
        redis: { image: 'redis:alpine' },
      });

      // Mock file reading
      (fs.readFileSync as jest.Mock).mockReturnValue(composeContent);

      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(2);
      expect(services).toContainEqual({ image: 'nginx:latest' });
      expect(services).toContainEqual({ image: 'redis:alpine' });
    });

    it('should handle platform specifications', () => {
      // Create compose file YAML with platform specifications
      const composeContent = `services:
  nginx:
    image: nginx:latest
    platform: linux/amd64`;

      (fs.readFileSync as jest.Mock).mockReturnValue(composeContent);

      // Configure yaml mock to include platform in service
      (yaml.load as jest.Mock).mockReturnValue({
        services: {
          nginx: {
            image: 'nginx:latest',
            platform: 'linux/amd64',
          },
        },
      });

      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(1);
      expect(services[0]).toEqual({ image: 'nginx:latest', platform: 'linux/amd64' });
    });

    it('should exclude specified images', () => {
      const composeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
        redis: { image: 'redis:alpine' },
        postgres: { image: 'postgres:13' },
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(composeContent);

      // Exclude redis and postgres
      const excludeImages = ['redis:alpine', 'postgres:13'];
      const services = getComposeServicesFromFiles(['docker-compose.yml'], excludeImages);

      expect(services.length).toBe(1);
      expect(services[0]).toEqual({ image: 'nginx:latest' });
    });

    it('should process multiple compose files', () => {
      const composeContent1 = createComposeYaml({
        nginx: { image: 'nginx:latest' },
      });

      const composeContent2 = createComposeYaml({
        redis: { image: 'redis:alpine' },
      });

      // Mock file reading for different files
      (fs.readFileSync as jest.Mock).mockImplementation((file) => {
        if (file === 'docker-compose.yml') {
          return composeContent1;
        } else if (file === 'docker-compose.override.yml') {
          return composeContent2;
        }
        return '';
      });

      const services = getComposeServicesFromFiles(['docker-compose.yml', 'docker-compose.override.yml'], []);

      expect(services.length).toBe(2);
      expect(services).toContainEqual({ image: 'nginx:latest' });
      expect(services).toContainEqual({ image: 'redis:alpine' });
    });

    it('should handle services without images', () => {
      const composeContent = `services:
  app:
    build: .
  nginx:
    image: nginx:latest`;

      (fs.readFileSync as jest.Mock).mockReturnValue(composeContent);
      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(1);
      expect(services[0]).toEqual({ image: 'nginx:latest' });
    });

    it('should search for default compose files when no input is provided', () => {
      const composeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(composeContent);

      // Configure existsSync behavior to match default file count
      (fs.existsSync as jest.Mock).mockImplementation((path) => {
        // Only the first file exists
        return path === 'compose.yaml';
      });

      // Empty input should search for default files
      const services = getComposeServicesFromFiles([], []);

      // fs.existsSync should be called for each of the 4 default files
      expect(fs.existsSync).toHaveBeenCalledTimes(4);
      // Only one file exists, so services count should be 1
      expect(services.length).toBe(1);
    });

    it('should handle empty compose file', () => {
      // Mock empty file
      (fs.readFileSync as jest.Mock).mockReturnValue('');
      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(0);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('Empty or invalid YAML file'));
    });

    it('should handle compose file without services section', () => {
      // Mock file without services section
      (fs.readFileSync as jest.Mock).mockReturnValue('version: "3.8"');

      // Mock implementation - ignoring unused parameter
      (debugMock as jest.Mock).mockImplementation((_: string) => {
        // No-op
      });

      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(0);
      expect(debugMock).toHaveBeenCalled();
    });

    it('should handle file read errors', () => {
      // Mock readFileSync to throw an error
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File read error');
      });

      const services = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(services.length).toBe(0);
      expect(warningMock).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    });

    it('should handle non-existent files', () => {
      // Mock existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const services = getComposeServicesFromFiles(['non-existent.yml'], []);

      expect(services.length).toBe(0);
      // The file doesn't exist, so it shouldn't be read
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
