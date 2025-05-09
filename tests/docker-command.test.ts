import * as core from '@actions/core';
import * as exec from '@actions/exec';

import {
  inspectImageLocal,
  inspectImageRemote,
  loadImageFromTar,
  pullImage,
  saveImageToTar,
} from '../src/docker-command';

jest.mock('@actions/core', () => ({
  warning: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  setOutput: jest.fn(),
  setFailed: jest.fn(),
  getInput: jest.fn(),
  error: jest.fn(),
}));

jest.mock('@actions/exec', () => ({
  exec: jest.fn(),
}));

describe('docker-command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pullImage', () => {
    it('returns true when pull succeeds', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(0);
      const result = await pullImage('nginx:latest', undefined);
      expect(result).toBe(true);
      expect(exec.exec).toHaveBeenCalled();
    });
    it('returns false and warns when pull fails', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(1);
      const result = await pullImage('nginx:latest', undefined);
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to pull image'));
    });
    it('returns false and warns on error', async () => {
      (exec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('err');
      });
      const result = await pullImage('nginx:latest', undefined);
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to pull image'));
    });
    it('uses platform flag if specified', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(0);
      await pullImage('nginx:latest', 'linux/arm64');
      expect(exec.exec).toHaveBeenCalledWith(
        'docker',
        ['pull', '--platform', 'linux/arm64', 'nginx:latest'],
        expect.any(Object)
      );
      expect(core.info).toHaveBeenCalledWith('Pulling image nginx:latest for platform linux/arm64');
    });
  });

  describe('inspectImageRemote', () => {
    it('returns manifest object on success', async () => {
      const manifest = { schemaVersion: 2, mediaType: 'type', digest: 'sha256:abc', size: 123, manifests: [] };
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stdout(Buffer.from(JSON.stringify(manifest)));
        return Promise.resolve(0);
      });
      const result = await inspectImageRemote('nginx:latest');
      expect(result).toEqual(manifest);
    });
    it('returns undefined and warns if command fails', async () => {
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stderr(Buffer.from('fail'));
        return Promise.resolve(1);
      });
      const result = await inspectImageRemote('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to inspect manifest'));
    });
    it('returns undefined and warns on JSON parse error', async () => {
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stdout(Buffer.from('not-json'));
        return Promise.resolve(0);
      });
      const result = await inspectImageRemote('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse manifest JSON'));
    });
    it('returns undefined and warns on exception', async () => {
      (exec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('err');
      });
      const result = await inspectImageRemote('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Error inspecting manifest'));
    });
  });

  describe('inspectImageLocal', () => {
    it('returns inspect info on success', async () => {
      const info = {
        Id: 'id',
        RepoTags: [],
        RepoDigests: [],
        Parent: '',
        Comment: '',
        Created: '',
        Container: '',
        DockerVersion: '',
        Author: '',
        Architecture: '',
        Os: '',
        Size: 1,
        VirtualSize: 1,
        ContainerConfig: {},
        Config: {},
        GraphDriver: { Data: {}, Name: '' },
        RootFS: { Type: '', Layers: [] },
        Metadata: { LastTagTime: '' },
      };
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stdout(Buffer.from(JSON.stringify(info)));
        return Promise.resolve(0);
      });
      const result = await inspectImageLocal('nginx:latest');
      expect(result).toEqual(info);
    });
    it('returns undefined and warns if command fails', async () => {
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stderr(Buffer.from('fail'));
        return Promise.resolve(1);
      });
      const result = await inspectImageLocal('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to inspect image'));
    });
    it('returns undefined and warns on JSON parse error', async () => {
      (exec.exec as jest.Mock).mockImplementation((_cmd, _args, options) => {
        options.listeners.stdout(Buffer.from('not-json'));
        return Promise.resolve(0);
      });
      const result = await inspectImageLocal('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to parse inspect JSON'));
    });
    it('returns undefined and warns on exception', async () => {
      (exec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('err');
      });
      const result = await inspectImageLocal('nginx:latest');
      expect(result).toBeUndefined();
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Error inspecting image'));
    });
  });

  describe('saveImageToTar', () => {
    it('returns true when save succeeds', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(0);
      const result = await saveImageToTar('nginx:latest', '/tmp/nginx.tar');
      expect(result).toBe(true);
      expect(exec.exec).toHaveBeenCalledWith(
        'docker',
        ['save', '-o', '/tmp/nginx.tar', 'nginx:latest'],
        expect.any(Object)
      );
    });
    it('returns false and warns when save fails', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(1);
      const result = await saveImageToTar('nginx:latest', '/tmp/nginx.tar');
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to save image'));
    });
    it('returns false and warns on error', async () => {
      (exec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('err');
      });
      const result = await saveImageToTar('nginx:latest', '/tmp/nginx.tar');
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to save image'));
    });
  });

  describe('loadImageFromTar', () => {
    it('returns true when load succeeds', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(0);
      const result = await loadImageFromTar('/tmp/nginx.tar');
      expect(result).toBe(true);
      expect(exec.exec).toHaveBeenCalledWith('docker', ['load', '-i', '/tmp/nginx.tar'], expect.any(Object));
    });
    it('returns false and warns when load fails', async () => {
      (exec.exec as jest.Mock).mockResolvedValue(1);
      const result = await loadImageFromTar('/tmp/nginx.tar');
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to load image'));
    });
    it('returns false and warns on error', async () => {
      (exec.exec as jest.Mock).mockImplementation(() => {
        throw new Error('err');
      });
      const result = await loadImageFromTar('/tmp/nginx.tar');
      expect(result).toBe(false);
      expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Failed to load image'));
    });
  });
});
