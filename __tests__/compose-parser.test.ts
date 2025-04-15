import * as core from '@actions/core';
import * as fs from 'fs';
import { ComposeParser, ImageInfo } from '../src/compose-parser'; // Import ImageInfo type

// Mocks
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

// Helper for sorting expected results consistently (same as production logic)
const sortImageInfos = (infos: ImageInfo[]): ImageInfo[] => {
  return [...infos].sort((infoA, infoB) => {
    const nameCompare = infoA.imageName.localeCompare(infoB.imageName);
    if (nameCompare !== 0) return nameCompare;
    const platformA = infoA.platform;
    const platformB = infoB.platform;
    if (platformA === platformB) return 0;
    if (platformA === undefined) return -1;
    if (platformB === undefined) return 1;
    return platformA.localeCompare(platformB);
  });
};

describe('ComposeParser', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks to default behavior
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('');
  });

  describe('constructor', () => {
    test('should create instance successfully with valid file paths', () => {
      const filePaths = ['docker-compose.yml', 'override.yml'];
      expect(() => new ComposeParser(filePaths)).not.toThrow();
      expect(fsMock.existsSync).toHaveBeenCalledTimes(2);
    });

    test('should throw error if filePaths array is empty', () => {
      expect(() => new ComposeParser([])).toThrow('No Compose file paths provided.');
    });

    test('should throw error if any file path does not exist', () => {
      const filePaths = ['exists.yml', 'not-exists.yml'];
      fsMock.existsSync.mockImplementation((path) => path === 'exists.yml');
      expect(() => new ComposeParser(filePaths)).toThrow('Compose file not found: not-exists.yml');
    });
  });

  describe('getImageList', () => {
    test('should return sorted unique ImageInfo objects from a single file', () => {
      // Arrange
      const yamlContent = `
services:
  app:
    image: my-app:1.0
    platform: linux/amd64
  db:
    image: postgres:14-alpine # No platform specified
  redis:
    image: redis:latest
    platform: linux/arm64
  worker:
    image: my-app:1.0 # Duplicate image name, different platform
    platform: linux/arm64
  another_worker:
    image: my-app:1.0 # Duplicate image name and platform
    platform: linux/arm64
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['docker-compose.yml']);
      const expectedImageInfos: readonly ImageInfo[] = sortImageInfos([
        { imageName: 'my-app:1.0', platform: 'linux/amd64' },
        { imageName: 'my-app:1.0', platform: 'linux/arm64' }, // Unique combination
        { imageName: 'postgres:14-alpine', platform: undefined },
        { imageName: 'redis:latest', platform: 'linux/arm64' },
      ]);

      // Act
      const imageInfos = parser.getImageList();

      // Assert
      expect(imageInfos).toEqual(expectedImageInfos);
      expect(fsMock.readFileSync).toHaveBeenCalledTimes(1);
      expect(fsMock.readFileSync).toHaveBeenCalledWith('docker-compose.yml', 'utf8');
      expect(coreMock.error).not.toHaveBeenCalled();
    });

    test('should merge, deduplicate, and sort ImageInfo objects from multiple files', () => {
      // Arrange
      const yamlContent1 = `
services:
  web: { image: nginx:stable, platform: linux/amd64 }
  api: { image: my-api:v2 } # Platform undefined
`;
      const yamlContent2 = `
services:
  api: { image: my-api:v2, platform: linux/amd64 } # Add platform
  db: { image: mysql:8, platform: linux/amd64 }
  web: { image: nginx:stable, platform: linux/amd64 } # Duplicate from file 1
`;
      fsMock.readFileSync.mockReturnValueOnce(yamlContent1).mockReturnValueOnce(yamlContent2);
      const parser = new ComposeParser(['compose.yml', 'override.yml']);
      const expectedImageInfos: readonly ImageInfo[] = sortImageInfos([
        { imageName: 'my-api:v2', platform: undefined },
        { imageName: 'my-api:v2', platform: 'linux/amd64' },
        { imageName: 'mysql:8', platform: 'linux/amd64' },
        { imageName: 'nginx:stable', platform: 'linux/amd64' },
      ]);

      // Act
      const imageInfos = parser.getImageList();

      // Assert
      expect(imageInfos).toEqual(expectedImageInfos);
      expect(fsMock.readFileSync).toHaveBeenCalledTimes(2);
    });

    test('should return an empty array if no services have image keys', () => {
      const yamlContent = `services:\n  app:\n    build: .\n    platform: linux/amd64`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['compose.yml']);
      expect(parser.getImageList()).toEqual([]);
    });

    test('should return an empty array if services key is missing', () => {
      const yamlContent = `version: '3.8'`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['compose.yml']);
      expect(parser.getImageList()).toEqual([]);
    });

    test('should ignore services with null or empty image values but return valid ones', () => {
      const yamlContent = `
services:
  app: { image: valid:tag, platform: linux/amd64 }
  invalid1: { image: null, platform: linux/amd64 }
  invalid2: { image: "", platform: linux/amd64 }
`;
      fsMock.readFileSync.mockReturnValue(yamlContent);
      const parser = new ComposeParser(['compose.yml']);
      expect(parser.getImageList()).toEqual([{ imageName: 'valid:tag', platform: 'linux/amd64' }]);
    });

    test('should handle readFileSync errors', () => {
      const readError = new Error('Read fail');
      fsMock.readFileSync.mockImplementation(() => {
        throw readError;
      });
      const parser = new ComposeParser(['fail.yml']);
      expect(() => parser.getImageList()).toThrow('Could not process compose file: fail.yml');
      expect(coreMock.error).toHaveBeenCalledWith(
        expect.stringContaining("Failed to read/parse YAML file 'fail.yml': Read fail")
      );
    });

    test('should handle yaml.load errors', () => {
      const invalidYaml = `services: { image: bad`;
      fsMock.readFileSync.mockReturnValue(invalidYaml);
      const parser = new ComposeParser(['bad.yml']);
      expect(() => parser.getImageList()).toThrow('Could not process compose file: bad.yml');
      expect(coreMock.error).toHaveBeenCalledWith(expect.stringContaining("Failed to read/parse YAML file 'bad.yml':"));
    });
  });
});
