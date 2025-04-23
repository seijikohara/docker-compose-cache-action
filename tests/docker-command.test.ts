import { actionCore, actionExec } from '../src/actions-wrapper';
import { getImageDigest, loadImageFromTar, pullImage, saveImageToTar } from '../src/docker-command';

// Setup mocks
jest.mock('../src/actions-wrapper', () => ({
  actionCore: {
    warning: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    setOutput: jest.fn(),
    setFailed: jest.fn(),
    getInput: jest.fn(),
  },
  actionExec: {
    exec: jest.fn(),
  },
}));

describe('Docker Command Module', () => {
  // Reset all mocks before each test
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getImageDigest', () => {
    it('should return digest when command succeeds', async () => {
      const mockDigest = 'sha256:1234567890abcdef';
      const mockManifest = {
        schemaVersion: 2,
        mediaType: 'application/vnd.docker.distribution.manifest.v2+json',
        digest: mockDigest,
        size: 1000,
        manifests: [],
      };

      // Mock actionExec.exec
      (actionExec.exec as jest.Mock).mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from(JSON.stringify(mockManifest)));
        }
        return Promise.resolve(0);
      });

      const result = await getImageDigest('nginx:latest');

      expect(result).toBe(mockDigest);
      expect(actionExec.exec).toHaveBeenCalledWith(
        'docker',
        ['buildx', 'imagetools', 'inspect', '--format', '{{json .Manifest}}', 'nginx:latest'],
        expect.any(Object)
      );
    });

    it('should return null when command fails', async () => {
      // Mock actionExec.exec with error
      (actionExec.exec as jest.Mock).mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stderr) {
          options.listeners.stderr(Buffer.from('Command failed'));
        }
        return Promise.resolve(1);
      });

      const result = await getImageDigest('invalid:image');

      expect(result).toBeNull();
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to get digest'));
    });

    it('should handle JSON parse errors', async () => {
      // Mock actionExec.exec with invalid JSON output
      (actionExec.exec as jest.Mock).mockImplementation((cmd, args, options) => {
        if (options && options.listeners && options.listeners.stdout) {
          options.listeners.stdout(Buffer.from('Invalid JSON'));
        }
        return Promise.resolve(0);
      });

      const result = await getImageDigest('nginx:latest');

      expect(result).toBeNull();
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse manifest JSON'));
    });

    it('should handle exceptions', async () => {
      // Mock actionExec.exec to throw error
      (actionExec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const result = await getImageDigest('nginx:latest');

      expect(result).toBeNull();
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Error getting digest'));
    });
  });

  describe('saveImageToTar', () => {
    it('should return true when save succeeds', async () => {
      // Mock successful execution
      (actionExec.exec as jest.Mock).mockResolvedValue(0);

      const result = await saveImageToTar('nginx:latest', '/tmp/nginx.tar');

      expect(result).toBe(true);
      expect(actionExec.exec).toHaveBeenCalledWith(
        'docker',
        ['save', '-o', '/tmp/nginx.tar', 'nginx:latest'],
        expect.any(Object)
      );
    });

    it('should return false when save fails', async () => {
      // Mock failed execution
      (actionExec.exec as jest.Mock).mockResolvedValue(1);

      const result = await saveImageToTar('invalid:image', '/tmp/invalid.tar');

      expect(result).toBe(false);
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to save image'));
    });
  });

  describe('loadImageFromTar', () => {
    it('should return true when load succeeds', async () => {
      // Mock successful execution
      (actionExec.exec as jest.Mock).mockResolvedValue(0);

      const result = await loadImageFromTar('/tmp/nginx.tar');

      expect(result).toBe(true);
      expect(actionExec.exec).toHaveBeenCalledWith('docker', ['load', '-i', '/tmp/nginx.tar'], expect.any(Object));
    });

    it('should return false when load fails', async () => {
      // Mock failed execution
      (actionExec.exec as jest.Mock).mockResolvedValue(1);

      const result = await loadImageFromTar('/tmp/invalid.tar');

      expect(result).toBe(false);
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to load image'));
    });
  });

  describe('pullImage', () => {
    it('should return true when pull succeeds', async () => {
      // Mock successful execution
      (actionExec.exec as jest.Mock).mockResolvedValue(0);

      const result = await pullImage('nginx:latest');

      expect(result).toBe(true);
      expect(actionExec.exec).toHaveBeenCalledWith('docker', ['pull', 'nginx:latest'], expect.any(Object));
    });

    it('should return false when pull fails', async () => {
      // Mock failed execution
      (actionExec.exec as jest.Mock).mockResolvedValue(1);

      const result = await pullImage('invalid:image');

      expect(result).toBe(false);
      expect(actionCore.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to pull image'));
    });

    it('should use platform flag when platform is specified', async () => {
      // Mock successful execution and info logging
      (actionExec.exec as jest.Mock).mockResolvedValue(0);
      (actionCore.info as jest.Mock) = jest.fn();

      const result = await pullImage('nginx:latest', 'linux/arm64');

      expect(result).toBe(true);
      expect(actionExec.exec).toHaveBeenCalledWith(
        'docker',
        ['pull', '--platform', 'linux/arm64', 'nginx:latest'],
        expect.any(Object)
      );
      expect(actionCore.info).toHaveBeenCalledWith('Pulling image nginx:latest for platform linux/arm64');
    });

    it('should handle errors when pulling with platform', async () => {
      // Mock execution error
      (actionExec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('Platform not supported');
      });

      const result = await pullImage('nginx:latest', 'unsupported/platform');

      expect(result).toBe(false);
      expect(actionCore.warning).toHaveBeenCalledWith(
        expect.stringContaining('Failed to pull image nginx:latest for platform unsupported/platform')
      );
    });
  });
});
