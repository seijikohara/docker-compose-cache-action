import * as core from '@actions/core';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ComposeParser, ImageInfo } from './compose-parser';
import { DockerCommand } from './docker-command';
import { CacheManager } from './cache-manager';
import { SkopeoInstaller } from './skopeo-installer';
import { RemoteRegistryClient } from './remote-registry';
import { getErrorMessage } from './utils';

type ImageName = string;
type Digest = string;
type CacheKey = string;
type FilePath = string;
type Platform = string | undefined;

type ImageMetadata = {
  readonly imageName: ImageName;
  readonly remoteDigest: Digest;
  readonly platform: Platform;
};

type ImageProcessingInfo = ImageMetadata & {
  readonly primaryKey: CacheKey;
  readonly cachePath: FilePath;
  readonly needsPull: boolean; // True if cache miss or load failure
};

const getNormalizedPlatform = (platform: Platform): string =>
  platform ? platform.replace(/[/]/g, '_') : `${process.platform}_${process.arch}`;

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

  private generateCacheKey(
    imageName: ImageName,
    platform: Platform,
    remoteDigest: Digest,
    filesHash: Digest
  ): CacheKey {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    const safePlatform = getNormalizedPlatform(platform);
    return `${this.cacheKeyPrefix}-${process.env.RUNNER_OS}-${safeImageName}-plt_${safePlatform}-${remoteDigest}-${filesHash}`;
  }

  private generateCachePath(
    imageName: ImageName,
    platform: Platform,
    remoteDigest: Digest,
    filesHash: Digest
  ): FilePath {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    const safePlatform = getNormalizedPlatform(platform);
    const tempDir = process.env.RUNNER_TEMP ?? '/tmp';
    return path.join(tempDir, `docker-image-${safeImageName}-plt_${safePlatform}-${remoteDigest}-${filesHash}.tar`);
  }

  async run(): Promise<void> {
    // Step 1: Ensure Skopeo is installed
    await this.skopeoInstaller.ensureInstalled();

    core.info(`Processing compose file(s): ${this.composeFiles.join(', ')}`);
    // Step 2: Parse Compose files and identify images to process
    const parser = new ComposeParser(this.composeFiles);
    const allImageInfos: readonly ImageInfo[] = parser.getImageList();
    const imageInfosToProcess = allImageInfos.filter((info) => !this.excludeImages.has(info.imageName));

    if (imageInfosToProcess.length === 0) {
      core.info('No images to process. Skipping operations.');
      core.setOutput('cache-hit', 'false');
      core.setOutput('image-list', '');
      return;
    }
    core.setOutput('image-list', imageInfosToProcess.map((info) => info.imageName).join(' '));
    core.info(`Processing ${imageInfosToProcess.length} image(s)...`);
    const filesHash = this.calculateFilesHash();

    // Step 3: Fetch remote digests for target images
    const metadataResults = await Promise.allSettled(
      imageInfosToProcess.map(async (imageInfo): Promise<ImageMetadata> => {
        const remoteDigest = await this.remoteRegistry.getRemoteDigest(imageInfo.imageName, imageInfo.platform);
        if (!remoteDigest)
          throw new Error(
            `Digest fetch failed for ${imageInfo.imageName} (platform: ${imageInfo.platform ?? 'default'})`
          );
        return { imageName: imageInfo.imageName, remoteDigest, platform: imageInfo.platform };
      })
    );
    const validMetadata: readonly ImageMetadata[] = metadataResults
      .filter((result): result is PromiseFulfilledResult<ImageMetadata> => result.status === 'fulfilled')
      .map((result) => result.value);
    metadataResults
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .forEach((rejectedResult) => core.warning(getErrorMessage(rejectedResult.reason)));

    if (validMetadata.length === 0) {
      core.warning('Could not retrieve digest for any image.');
      core.setOutput('cache-hit', 'false');
      return;
    }

    // Step 4: Attempt to restore image caches based on remote digests
    const initialProcessingInfos: readonly ImageProcessingInfo[] = validMetadata.map((meta) => ({
      ...meta,
      primaryKey: this.generateCacheKey(meta.imageName, meta.platform, meta.remoteDigest, filesHash),
      cachePath: this.generateCachePath(meta.imageName, meta.platform, meta.remoteDigest, filesHash),
      needsPull: true, // Assume needs pull initially
    }));

    const restoredProcessingInfos: readonly ImageProcessingInfo[] = await Promise.all(
      initialProcessingInfos.map(async (info) => ({
        ...info,
        needsPull: !(await this.cacheManager.restore(info.primaryKey, info.cachePath)),
      }))
    );

    // Step 5: Attempt to load restored images from cache
    const verifiedProcessingInfos: readonly ImageProcessingInfo[] = await Promise.all(
      restoredProcessingInfos.map(async (info): Promise<ImageProcessingInfo> => {
        if (info.needsPull) return info; // Skip load if cache wasn't restored
        try {
          core.info(
            `Loading image ${info.imageName} (Platform: ${info.platform ?? getNormalizedPlatform(undefined)}) from cache: ${info.cachePath}`
          );
          await this.dockerCommand.load(info.cachePath);
          core.info(`Image ${info.imageName} loaded successfully from cache.`);
          return { ...info, needsPull: false }; // Load successful
        } catch (loadError) {
          core.warning(`Failed to load ${info.imageName} from cache: ${getErrorMessage(loadError)}.`);
          return { ...info, needsPull: true }; // Load failed, requires pull
        }
      })
    );

    // Step 6: Determine final pull list and set overall cache-hit output
    const imagesToPullInfo = verifiedProcessingInfos.filter((info) => info.needsPull);
    const allCacheHit = imagesToPullInfo.length === 0 && verifiedProcessingInfos.length === validMetadata.length;
    core.setOutput('cache-hit', allCacheHit.toString());

    if (allCacheHit) {
      core.info('All required images were successfully restored from cache.');
      return;
    }

    // Step 7: Pull missing or outdated images
    core.info(`Pulling ${imagesToPullInfo.length} image(s)...`);
    const pullResults = await Promise.allSettled(
      imagesToPullInfo.map((info) => this.dockerCommand.pull(info.imageName))
    );

    const successfullyPulledInfo = imagesToPullInfo.filter((info, index) => {
      // eslint-disable-next-line security/detect-object-injection
      const result = pullResults[index];
      const wasFulfilled = result.status === 'fulfilled';
      if (!wasFulfilled) {
        core.error(`Failed to pull image ${info.imageName}: ${getErrorMessage(result.reason)}`);
      }
      return wasFulfilled;
    });

    if (successfullyPulledInfo.length === 0) {
      core.warning('No images were successfully pulled, skipping cache save.');
      return;
    }

    // Step 8: Save successfully pulled and verified images to cache
    core.info(`Saving ${successfullyPulledInfo.length} image(s) to cache...`);
    await Promise.allSettled(
      successfullyPulledInfo.map(async (info) => {
        try {
          // Verify digest AFTER pull
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
