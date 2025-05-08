import * as core from '@actions/core';
import * as fs from 'fs';

import { getComposeServicesFromFiles } from '../src/docker-compose-file';

// Mock dependencies
jest.mock('@actions/core', () => ({
  debug: jest.fn(),
  warning: jest.fn(),
}));

jest.mock('fs');

describe('Docker Compose File Module', () => {
  const warningMock = core.warning as jest.Mock;
  const debugMock = core.debug as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock existsSync to return true by default
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  describe('getComposeServicesFromFiles', () => {
    /**
     * Helper function to create YAML content for testing
     */
    const createComposeYaml = (serviceDefinitions: Record<string, { image: string; platform?: string }>) => {
      return `services:
${Object.entries(serviceDefinitions)
  .map(
    ([serviceName, serviceConfig]) => `  ${serviceName}:
    image: ${serviceConfig.image}${serviceConfig.platform ? `\n    platform: ${serviceConfig.platform}` : ''}`
  )
  .join('\n')}`;
    };

    it('should find services from specific compose file', () => {
      const mockComposeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
        redis: { image: 'redis:alpine' },
      });

      // Mock file reading
      (fs.readFileSync as jest.Mock).mockReturnValue(mockComposeContent);

      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(2);
      expect(extractedServices).toContainEqual({ image: 'nginx:latest' });
      expect(extractedServices).toContainEqual({ image: 'redis:alpine' });
    });

    it('should handle platform specifications', () => {
      // Create compose file YAML with platform specifications
      const mockComposeContent = createComposeYaml({
        nginx: { image: 'nginx:latest', platform: 'linux/amd64' },
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockComposeContent);

      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(1);
      expect(extractedServices[0]).toEqual({ image: 'nginx:latest', platform: 'linux/amd64' });
    });

    it('should exclude specified images', () => {
      const mockComposeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
        redis: { image: 'redis:alpine' },
        postgres: { image: 'postgres:13' },
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockComposeContent);

      // Exclude redis and postgres
      const imagesToExclude = ['redis:alpine', 'postgres:13'];
      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], imagesToExclude);

      expect(extractedServices.length).toBe(1);
      expect(extractedServices[0]).toEqual({ image: 'nginx:latest' });
    });

    it('should process multiple compose files', () => {
      const mockComposeContent1 = createComposeYaml({
        nginx: { image: 'nginx:latest' },
      });

      const mockComposeContent2 = createComposeYaml({
        redis: { image: 'redis:alpine' },
      });

      // Mock file reading for different files
      (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
        if (filePath === 'docker-compose.yml') {
          return mockComposeContent1;
        } else if (filePath === 'docker-compose.override.yml') {
          return mockComposeContent2;
        }
        return '';
      });

      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml', 'docker-compose.override.yml'], []);

      expect(extractedServices.length).toBe(2);
      expect(extractedServices).toContainEqual({ image: 'nginx:latest' });
      expect(extractedServices).toContainEqual({ image: 'redis:alpine' });
    });

    it('should handle services without images', () => {
      const mockComposeContent = `services:
  app:
    build: .
  nginx:
    image: nginx:latest`;

      (fs.readFileSync as jest.Mock).mockReturnValue(mockComposeContent);
      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(1);
      expect(extractedServices[0]).toEqual({ image: 'nginx:latest' });
    });

    it('should search for default compose files when no input is provided', () => {
      const mockComposeContent = createComposeYaml({
        nginx: { image: 'nginx:latest' },
      });

      (fs.readFileSync as jest.Mock).mockReturnValue(mockComposeContent);

      // Configure existsSync behavior to match default file count
      (fs.existsSync as jest.Mock).mockImplementation((filePath) => {
        // Only the first file exists
        return filePath === 'compose.yaml';
      });

      // Empty input should search for default files
      const extractedServices = getComposeServicesFromFiles([], []);

      // fs.existsSync should be called for each of the 4 default files
      expect(fs.existsSync).toHaveBeenCalledTimes(4);
      // Only one file exists, so services count should be 1
      expect(extractedServices.length).toBe(1);
    });

    it('should handle empty compose file', () => {
      // Mock empty file
      (fs.readFileSync as jest.Mock).mockReturnValue('');
      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(0);
      expect(debugMock).toHaveBeenCalledWith(expect.stringContaining('Empty or invalid YAML file'));
    });

    it('should handle compose file without services section', () => {
      // Mock file without services section
      (fs.readFileSync as jest.Mock).mockReturnValue('version: "3.8"');

      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(0);
      expect(debugMock).toHaveBeenCalled();
    });

    it('should handle file read errors', () => {
      // Mock readFileSync to throw an error
      (fs.readFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('File read error');
      });

      const extractedServices = getComposeServicesFromFiles(['docker-compose.yml'], []);

      expect(extractedServices.length).toBe(0);
      expect(warningMock).toHaveBeenCalledWith(expect.stringContaining('Failed to parse'));
    });

    it('should handle non-existent files', () => {
      // Mock existsSync to return false
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const extractedServices = getComposeServicesFromFiles(['non-existent.yml'], []);

      expect(extractedServices.length).toBe(0);
      // The file doesn't exist, so it shouldn't be read
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });
  });
});
