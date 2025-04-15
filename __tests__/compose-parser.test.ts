import * as core from '@actions/core';
import * as fs from 'fs';
import { ComposeParser } from '../src/compose-parser';
// js-yaml is not mocked, use the actual implementation

// Mock dependencies
jest.mock('@actions/core');
jest.mock('fs', () => {
  const originalFs = jest.requireActual('fs');
  return {
    ...originalFs,
    existsSync: jest.fn().mockReturnValue(true), // Default: exists
    readFileSync: jest.fn().mockReturnValue(''), // Default: empty content
  };
});

// Typed mocks
const coreMock = core as jest.Mocked<typeof core>;

const fsMock = fs as jest.Mocked<typeof fs>;

describe('ComposeParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default behavior if needed (existsSync already defaults to true)
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('');
  });

  describe('constructor', () => {
    test('should create instance successfully with valid file paths', () => {
      // Arrange
      const filePaths = ['docker-compose.yml', 'override.yml'];
      fsMock.existsSync.mockReturnValue(true); // Ensure existsSync returns true

      // Act & Assert
      expect(() => new ComposeParser(filePaths)).not.toThrow();
      expect(fsMock.existsSync).toHaveBeenCalledTimes(2);
      expect(fsMock.existsSync).toHaveBeenCalledWith('docker-compose.yml');
      expect(fsMock.existsSync).toHaveBeenCalledWith('override.yml');
    });

    test('should throw error if filePaths array is empty', () => {
      // Arrange
      const filePaths: string[] = [];

      // Act & Assert
      expect(() => new ComposeParser(filePaths)).toThrow('No Compose file paths provided.');
    });

    test('should throw error if any file path does not exist', () => {
      // Arrange
      const filePaths = ['exists.yml', 'not-exists.yml'];
      fsMock.existsSync.mockImplementation((path) => path === 'exists.yml'); // Only first file exists

      // Act & Assert
      expect(() => new ComposeParser(filePaths)).toThrow('Compose file not found: not-exists.yml');
      expect(fsMock.existsSync).toHaveBeenCalledWith('exists.yml');
      expect(fsMock.existsSync).toHaveBeenCalledWith('not-exists.yml');
    });
  });

  describe('getImageList', () => {
    test('should return sorted unique image names from a single file', () => {
      // Arrange
      const yamlContent = `
services:
  app:
    image: my-app:1.0
  db:
    image: postgres:14-alpine
  redis:
    image: redis:latest
  worker:
    image: my-app:1.0 # Duplicate
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);
      const expectedImages = ['my-app:1.0', 'postgres:14-alpine', 'redis:latest'];

      // Act
      const images = parser.getImageList();

      // Assert
      expect(images).toEqual(expectedImages);
      expect(fsMock.readFileSync).toHaveBeenCalledTimes(1);
      expect(fsMock.readFileSync).toHaveBeenCalledWith('docker-compose.yml', 'utf8');
      expect(coreMock.error).not.toHaveBeenCalled();
    });

    test('should merge, deduplicate, and sort image names from multiple files', () => {
      // Arrange
      const yamlContent1 = `
services:
  web:
    image: nginx:stable
  api:
    image: my-api:v2
`;
      const yamlContent2 = `
services:
  api: # Override api service (but image might be same or different)
    image: my-api:v2 # Duplicate
  db:
    image: mysql:8
`;
      fsMock.readFileSync.mockReturnValueOnce(yamlContent1).mockReturnValueOnce(yamlContent2);
      const parser = new ComposeParser(['docker-compose.yml', 'override.yml']);
      const expectedImages = ['my-api:v2', 'mysql:8', 'nginx:stable']; // Sorted unique list

      // Act
      const images = parser.getImageList();

      // Assert
      expect(images).toEqual(expectedImages);
      expect(fsMock.readFileSync).toHaveBeenCalledTimes(2);
      expect(fsMock.readFileSync).toHaveBeenCalledWith('docker-compose.yml', 'utf8');
      expect(fsMock.readFileSync).toHaveBeenCalledWith('override.yml', 'utf8');
    });

    test('should return an empty array if no services have image keys', () => {
      // Arrange
      const yamlContent = `
services:
  app:
    build: .
  db:
    # No image key
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);

      // Act
      const images = parser.getImageList();

      // Assert
      expect(images).toEqual([]);
    });

    test('should return an empty array if services key is missing or empty', () => {
      // Arrange
      const yamlContent = `
version: '3.8'
# No services key
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);

      // Act
      const images = parser.getImageList();

      // Assert
      expect(images).toEqual([]);
    });

    test('should ignore services with null or empty image values', () => {
      // Arrange
      const yamlContent = `
services:
  app:
    image: my-app:1.0
  invalid1:
    image: null
  invalid2:
    image: ""
  valid:
      image: another/image:tag
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);
      const expectedImages = ['another/image:tag', 'my-app:1.0'];

      // Act
      const images = parser.getImageList();

      // Assert
      expect(images).toEqual(expectedImages);
    });

    test('should throw error and log core.error if readFileSync fails', () => {
      // Arrange
      const readError = new Error('Permission denied');
      fsMock.readFileSync.mockImplementation(() => {
        throw readError;
      });
      const parser = new ComposeParser(['docker-compose.yml']);

      // Act & Assert
      expect(() => parser.getImageList()).toThrow('Could not process compose file: docker-compose.yml');
      expect(coreMock.error).toHaveBeenCalledTimes(1);
      expect(coreMock.error).toHaveBeenCalledWith(
        `Failed to read/parse YAML file 'docker-compose.yml': ${readError.message}`
      );
    });

    test('should throw error and log core.error if yaml.load fails', () => {
      // Arrange
      const invalidYamlContent = `services: { image: bad-yaml`; // Invalid YAML
      fsMock.readFileSync.mockReturnValue(invalidYamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);

      // Act & Assert
      // Use a broader error check as js-yaml error messages can vary
      expect(() => parser.getImageList()).toThrow(Error); // Expect any error
      expect(coreMock.error).toHaveBeenCalledTimes(1);
      expect(coreMock.error).toHaveBeenCalledWith(
        expect.stringContaining(`Failed to read/parse YAML file 'docker-compose.yml':`)
      );
    });
  });
});
