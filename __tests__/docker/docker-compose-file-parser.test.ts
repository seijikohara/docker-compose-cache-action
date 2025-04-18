import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { DockerComposeFileParser } from '../../src/docker/docker-compose-file-parser';

// Setup mocks
jest.mock('fs');
jest.mock('js-yaml');
// Mock @actions/core with a more direct approach to avoid fs.promises issue
jest.mock('@actions/core', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
}));

describe('DockerComposeFileParser', () => {
  // Setup common test variables
  const mockFilePath = '/path/to/compose.yaml';
  const mockFilePaths = [mockFilePath];

  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  describe('constructor', () => {
    describe('normal cases', () => {
      it('should create an instance when valid file paths are provided', () => {
        // Arrange & Act
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Assert
        expect(parser).toBeInstanceOf(DockerComposeFileParser);
        expect(fs.existsSync).toHaveBeenCalledWith(mockFilePath);
      });

      it('should create an instance with multiple file paths', () => {
        // Arrange
        const multipleFilePaths = ['/path/to/compose1.yaml', '/path/to/compose2.yaml'];

        // Act
        const parser = new DockerComposeFileParser(multipleFilePaths);

        // Assert
        expect(parser).toBeInstanceOf(DockerComposeFileParser);
        expect(fs.existsSync).toHaveBeenCalledTimes(2);
      });
    });

    describe('edge cases', () => {
      it('should throw an error when no file paths are provided', () => {
        // Arrange & Act & Assert
        expect(() => new DockerComposeFileParser([])).toThrow('No Compose file paths provided.');
      });
    });

    describe('error cases', () => {
      it('should throw an error when file does not exist', () => {
        // Arrange
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Act & Assert
        expect(() => new DockerComposeFileParser(mockFilePaths)).toThrow(`Compose file not found: ${mockFilePath}`);
      });
    });
  });

  describe('getImageList', () => {
    describe('normal cases', () => {
      it('should return sorted image list from a single compose file', () => {
        // Arrange
        const mockYamlContent = {
          services: {
            service1: { image: 'image1:latest' },
            service2: { image: 'image2:latest' },
          },
        };
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([{ imageName: 'image1:latest' }, { imageName: 'image2:latest' }]);
        expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath, 'utf8');
      });

      it('should handle platforms correctly', () => {
        // Arrange
        const mockYamlContent = {
          services: {
            service1: { image: 'image1:latest', platform: 'linux/amd64' },
            service2: { image: 'image2:latest', platform: 'linux/arm64' },
          },
        };
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([
          { imageName: 'image1:latest', platform: 'linux/amd64' },
          { imageName: 'image2:latest', platform: 'linux/arm64' },
        ]);
      });

      it('should sort images by name and then by platform', () => {
        // Arrange
        const mockYamlContent = {
          services: {
            service1: { image: 'image2:latest', platform: 'linux/arm64' },
            service2: { image: 'image1:latest', platform: 'linux/amd64' },
            service3: { image: 'image1:latest' },
          },
        };
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([
          { imageName: 'image1:latest' },
          { imageName: 'image1:latest', platform: 'linux/amd64' },
          { imageName: 'image2:latest', platform: 'linux/arm64' },
        ]);
      });

      it('should deduplicate identical image information', () => {
        // Arrange
        const mockYamlContent = {
          services: {
            service1: { image: 'image1:latest', platform: 'linux/amd64' },
            service2: { image: 'image1:latest', platform: 'linux/amd64' },
            service3: { image: 'image2:latest' },
            service4: { image: 'image2:latest' },
          },
        };
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([
          { imageName: 'image1:latest', platform: 'linux/amd64' },
          { imageName: 'image2:latest' },
        ]);
        expect(result.length).toBe(2);
      });
    });

    describe('edge cases', () => {
      it('should handle services without images', () => {
        // Arrange
        const mockYamlContent = {
          services: {
            service1: { image: 'image1:latest' },
            service2: {
              /* no image */
            },
          },
        };
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([{ imageName: 'image1:latest' }]);
      });

      it('should handle compose files without services', () => {
        // Arrange
        const mockYamlContent = {}; // Empty object
        (fs.readFileSync as jest.Mock).mockReturnValue('yaml-content');
        (yaml.load as jest.Mock).mockReturnValue(mockYamlContent);
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act
        const result = parser.getImageList();

        // Assert
        expect(result).toEqual([]);
      });
    });

    describe('error cases', () => {
      it('should throw an error when file cannot be read or parsed', () => {
        // Arrange
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
          throw new Error('File read error');
        });
        const parser = new DockerComposeFileParser(mockFilePaths);

        // Act & Assert
        expect(() => parser.getImageList()).toThrow(`Could not process compose file: ${mockFilePath}`);
      });
    });
  });
});
