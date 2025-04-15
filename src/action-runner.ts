import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ComposeParser } from './compose-parser';
import { DockerCommand } from './docker-command';
import { CacheManager } from './cache-manager';
import { SkopeoInstaller } from './skopeo-installer';
import { RemoteRegistryClient } from './remote-registry';
import { getErrorMessage } from './utils';

type ImageName = string;
type Digest = string;
type CacheKey = string;
type FilePath = string;

type ImageMetadata = {
  readonly imageName: ImageName;
  readonly remoteDigest: Digest;
};

type ImageProcessingInfo = ImageMetadata & {
  readonly primaryKey: CacheKey;
  readonly cachePath: FilePath;
  readonly needsPull: boolean;
};

export class ActionRunner {
  private readonly composeFiles: readonly FilePath[];
  private readonly excludeImages: ReadonlySet<ImageName>;
  private readonly cacheKeyPrefix: string;
  private readonly dockerCommand: DockerCommand;
  private readonly cacheManager: CacheManager;
  private readonly remoteRegistry: RemoteRegistryClient;
  private readonly skopeoInstaller: SkopeoInstaller;

  constructor() {
    this.skopeoInstaller = new SkopeoInstaller();
    this.dockerCommand = new DockerCommand();
    this.cacheManager = new CacheManager();
    this.remoteRegistry = new RemoteRegistryClient(this.skopeoInstaller);
    this.cacheKeyPrefix = core.getInput('cache-key-prefix', { required: true });
    this.excludeImages = new Set(core.getMultilineInput('exclude-images'));
    this.composeFiles = this.determineComposeFiles(core.getMultilineInput('compose-files'));

    if (this.excludeImages.size > 0) {
      core.info(`Excluding images: ${[...this.excludeImages].join(', ')}`);
    }
  }

  private determineComposeFiles(input: readonly string[]): readonly FilePath[] {
    if (input.length > 0) {
      core.info(`Using specified compose files: ${input.join(', ')}`);
      input.forEach((file) => {
        if (!fs.existsSync(file)) throw new Error(`Specified compose file not found: ${file}`);
      });
      return input;
    }
    core.info('Compose files not specified, searching for default files...');
    const foundFile = this.findDefaultComposeFile();
    if (foundFile) {
      core.info(`Using automatically found compose file: ${foundFile}`);
      return [foundFile];
    }
    throw new Error('No default compose files found.');
  }

  private findDefaultComposeFile(): FilePath | undefined {
    const defaultFiles: readonly FilePath[] = [
      'compose.yaml',
      'compose.yml',
      'docker-compose.yaml',
      'docker-compose.yml',
    ];
    return defaultFiles.find(fs.existsSync);
  }

  private calculateFilesHash(): Digest {
    const sortedFiles = [...this.composeFiles].sort();
    const combinedContent = sortedFiles.reduce((content, file) => content + fs.readFileSync(file, 'utf8'), '');
    return crypto.createHash('sha256').update(combinedContent).digest('hex');
  }

  private generateCacheKey(imageName: ImageName, remoteDigest: Digest, filesHash: Digest): CacheKey {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    return `${this.cacheKeyPrefix}-${process.env.RUNNER_OS}-${safeImageName}-${remoteDigest}-${filesHash}`;
  }

  private generateCachePath(imageName: ImageName, remoteDigest: Digest, filesHash: Digest): FilePath {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    const tempDir = process.env.RUNNER_TEMP ?? '/tmp';
    return path.join(tempDir, `docker-image-${safeImageName}-${remoteDigest}-${filesHash}.tar`);
  }

  async run(): Promise<void> {
    await this.skopeoInstaller.ensureInstalled();

    core.info(`Processing compose file(s): ${this.composeFiles.join(', ')}`);
    const parser = new ComposeParser(this.composeFiles);
    const allImages = parser.getImageList();
    const imagesToProcess = allImages.filter((imageName) => !this.excludeImages.has(imageName));

    if (imagesToProcess.length === 0) {
      core.info('No images to process. Skipping operations.');
      core.setOutput('cache-hit', 'false');
      core.setOutput('image-list', '');
      return;
    }
    core.setOutput('image-list', imagesToProcess.join(' '));
    core.info(`Processing ${imagesToProcess.length} image(s)...`);
    const filesHash = this.calculateFilesHash();

    const metadataResults = await Promise.allSettled(
      imagesToProcess.map(async (imageName): Promise<ImageMetadata> => {
        const remoteDigest = await this.remoteRegistry.getRemoteDigest(imageName);
        if (!remoteDigest) throw new Error(`Digest fetch failed for ${imageName}`);
        return { imageName, remoteDigest };
      })
    );
    const validMetadata = metadataResults
      .filter((result): result is PromiseFulfilledResult<ImageMetadata> => result.status === 'fulfilled')
      .map((result) => result.value);
    metadataResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach((result) => core.warning(getErrorMessage(result.reason)));

    if (validMetadata.length === 0) {
      core.warning('Could not retrieve digest for any image.');
      core.setOutput('cache-hit', 'false');
      return;
    }

    const initialInfos: readonly ImageProcessingInfo[] = validMetadata.map((meta) => ({
      ...meta,
      primaryKey: this.generateCacheKey(meta.imageName, meta.remoteDigest, filesHash),
      cachePath: this.generateCachePath(meta.imageName, meta.remoteDigest, filesHash),
      needsPull: true,
    }));

    const restoredInfos: readonly ImageProcessingInfo[] = await Promise.all(
      initialInfos.map(async (info) => ({
        ...info,
        needsPull: !(await this.cacheManager.restore(info.primaryKey, info.cachePath)),
      }))
    );

    const verifiedInfos: readonly ImageProcessingInfo[] = await Promise.all(
      restoredInfos.map(async (info): Promise<ImageProcessingInfo> => {
        if (info.needsPull) return info;
        let loadedSuccessfully = false;
        try {
          core.info(`Loading image ${info.imageName} from cache: ${info.cachePath}`);
          await this.dockerCommand.load(info.cachePath);
          core.info(`Image ${info.imageName} loaded successfully from cache.`);
          loadedSuccessfully = true;
        } catch (loadError) {
          core.warning(`Failed to load ${info.imageName} from cache: ${getErrorMessage(loadError)}.`);
        }
        return { ...info, needsPull: !loadedSuccessfully };
      })
    );

    const imagesToPullInfo = verifiedInfos.filter((info) => info.needsPull);
    const allCacheHit = imagesToPullInfo.length === 0 && verifiedInfos.length === validMetadata.length;
    core.setOutput('cache-hit', allCacheHit.toString());

    if (allCacheHit) {
      core.info('All required images were successfully restored from cache.');
      return;
    }

    core.info(`Pulling ${imagesToPullInfo.length} image(s)...`);
    const pullResults = await Promise.allSettled(
      imagesToPullInfo.map((info) => this.dockerCommand.pull(info.imageName))
    );
    const successfullyPulledInfo = imagesToPullInfo.filter((info, index) => {
      // eslint-disable-next-line security/detect-object-injection
      const result = pullResults[index];
      const wasFulfilled = result.status === 'fulfilled'; // Disable rule for this line
      if (!wasFulfilled) {
        core.error(`Failed to pull image ${info.imageName}: ${getErrorMessage(result.reason)}`);
      }
      return wasFulfilled;
    });

    if (successfullyPulledInfo.length === 0) {
      core.warning('No images were successfully pulled, skipping cache save.');
      return;
    }

    core.info(`Saving ${successfullyPulledInfo.length} image(s) to cache...`);
    await Promise.allSettled(
      successfullyPulledInfo.map(async (info) => {
        try {
          const pulledDigest = await this.dockerCommand.getDigest(info.imageName);
          if (pulledDigest && pulledDigest === info.remoteDigest) {
            await this.dockerCommand.save(info.cachePath, [info.imageName]);
            await this.cacheManager.save(info.primaryKey, info.cachePath);
          } else {
            core.warning(
              `Digest check failed after pulling ${info.imageName} (Local: ${pulledDigest ?? 'N/A'}, Expected: ${info.remoteDigest}). Skipping cache save.`
            );
          }
        } catch (saveError) {
          core.warning(`Failed to save image ${info.imageName} to cache: ${getErrorMessage(saveError)}`);
        }
      })
    );
  }
}
