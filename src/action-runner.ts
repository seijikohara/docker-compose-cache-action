import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as core from '@actions/core';
import { CacheManager } from './cache-manager';
import { DockerBuildxCommand } from './docker/docker-buildx-command';
import { DockerCommand } from './docker/docker-command';
import { DockerComposeFileParser, ImageInfo } from './docker/docker-compose-file-parser';
import { getErrorMessage } from './errors';
import { getCurrentOciPlatform, normalizePlatform } from './platform';

/** Type alias for image name */
type ImageName = string;
/** Type alias for image digest */
type Digest = string;
/** Type alias for cache key */
type CacheKey = string;
/** Type alias for file path */
type FilePath = string;
/** Type alias for platform specification */
type Platform = string | undefined;

/** Core image metadata */
type ImageMetadata = {
  readonly imageName: ImageName;
  readonly remoteDigest: Digest;
  readonly platform: Platform;
};

/** Extended image information with caching details */
type ImageProcessingInfo = ImageMetadata & {
  readonly primaryKey: CacheKey;
  readonly cachePath: FilePath;
  readonly needsPull: boolean;
};

/**
 * Main runner class for the Docker Compose Cache action.
 * Coordinates the entire caching workflow:
 * 1. Parses Docker Compose files to identify images
 * 2. Fetches remote image digests to validate caches
 * 3. Restores images from cache when valid
 * 4. Pulls and caches images when needed
 */
export class ActionRunner {
  private readonly composeFiles: readonly FilePath[];
  private readonly excludeImages: ReadonlySet<ImageName>;
  private readonly cacheKeyPrefix: string;
  private readonly dockerCommand: DockerCommand;
  private readonly cacheManager: CacheManager;
  private readonly dockerBuildxCommand: DockerBuildxCommand;

  /**
   * Creates a new ActionRunner with the necessary dependencies
   * @param dockerCommand Docker command executor
   * @param cacheManager Cache manager for GitHub Actions cache
   * @param dockerBuildxCommand Docker buildx command executor
   */
  constructor(dockerCommand: DockerCommand, cacheManager: CacheManager, dockerBuildxCommand: DockerBuildxCommand) {
    this.dockerCommand = dockerCommand;
    this.cacheManager = cacheManager;
    this.dockerBuildxCommand = dockerBuildxCommand;
    this.cacheKeyPrefix = core.getInput('cache-key-prefix', { required: true });
    this.excludeImages = new Set(core.getMultilineInput('exclude-images'));
    this.composeFiles = this.determineComposeFiles(core.getMultilineInput('compose-files'));

    if (this.excludeImages.size > 0) {
      core.info(`Excluding images: ${[...this.excludeImages].join(', ')}`);
    }
    if (!getCurrentOciPlatform()) {
      core.warning(
        `Could not determine OCI platform for the current runner environment (${process.platform}/${process.arch}). Default cache keys might be inconsistent.`
      );
    }
  }

  /**
   * Determines which compose files to use based on input or defaults
   * @param input User-provided file paths from action input
   * @returns Array of validated file paths
   */
  private determineComposeFiles(input: readonly string[]): readonly FilePath[] {
    if (input.length > 0) {
      core.info(`Using specified compose files: ${input.join(', ')}`);

      // Check each file exists using every() method
      const allFilesExist = input.every((file) => fs.existsSync(file));
      if (!allFilesExist) {
        const missingFiles = input.filter((file) => !fs.existsSync(file));
        throw new Error(`Specified compose file not found: ${missingFiles[0]}`);
      }

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

  /**
   * Tries to find a default compose file
   * @returns Path to found file or undefined
   */
  private findDefaultComposeFile(): FilePath | undefined {
    const defaultFiles: readonly FilePath[] = [
      'compose.yaml',
      'compose.yml',
      'docker-compose.yaml',
      'docker-compose.yml',
    ];
    return defaultFiles.find(fs.existsSync);
  }

  /**
   * Calculates hash of compose file contents
   * @returns SHA-256 hash of combined file contents
   */
  private calculateFilesHash(): Digest {
    // 安全な型の流れを確保しつつ、イミュータブルな操作を行う
    const sortedFiles = [...this.composeFiles].sort();
    const fileContents = sortedFiles.map((file) => fs.readFileSync(file, 'utf8'));
    const combinedContent = fileContents.join('');
    return crypto.createHash('sha256').update(combinedContent).digest('hex');
  }

  /**
   * Generates cache key for an image
   * @param imageName Image name
   * @param platform Target platform
   * @param remoteDigest Image digest
   * @param filesHash Hash of compose files
   * @returns Cache key string
   */
  private generateCacheKey(
    imageName: ImageName,
    platform: Platform,
    remoteDigest: Digest,
    filesHash: Digest
  ): CacheKey {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    const safePlatform = normalizePlatform(platform);
    return `${this.cacheKeyPrefix}-${process.env.RUNNER_OS}-${safeImageName}-plt_${safePlatform}-${remoteDigest}-${filesHash}`;
  }

  /**
   * Generates filesystem path for cached image
   * @param imageName Image name
   * @param platform Target platform
   * @param remoteDigest Image digest
   * @param filesHash Hash of compose files
   * @returns Path for tar file
   */
  private generateCachePath(
    imageName: ImageName,
    platform: Platform,
    remoteDigest: Digest,
    filesHash: Digest
  ): FilePath {
    const safeImageName = imageName.replace(/[/:]/g, '_');
    const safePlatform = normalizePlatform(platform);
    const tempDir = process.env.RUNNER_TEMP ?? '/tmp';
    return path.join(tempDir, `docker-image-${safeImageName}-plt_${safePlatform}-${remoteDigest}-${filesHash}.tar`);
  }

  /**
   * Main execution method for the action
   * @returns Promise that resolves when all operations are complete
   */
  async run(): Promise<void> {
    core.info(`Processing compose file(s): ${this.composeFiles.join(', ')}`);
    const parser = new DockerComposeFileParser(this.composeFiles);
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

    // Fetch remote digests for all images in parallel
    const metadataResults = await Promise.allSettled(
      imageInfosToProcess.map(async (imageInfo): Promise<ImageMetadata> => {
        const remoteDigest = await this.dockerBuildxCommand.getRemoteDigest(imageInfo.imageName, imageInfo.platform);
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

    // Prepare processing information with cache keys and paths
    const initialProcessingInfos: readonly ImageProcessingInfo[] = validMetadata.map((meta) => ({
      ...meta,
      primaryKey: this.generateCacheKey(meta.imageName, meta.platform, meta.remoteDigest, filesHash),
      cachePath: this.generateCachePath(meta.imageName, meta.platform, meta.remoteDigest, filesHash),
      needsPull: true,
    }));

    // Try to restore each image from cache
    const restoredProcessingInfos: readonly ImageProcessingInfo[] = await Promise.all(
      initialProcessingInfos.map(async (info) => ({
        ...info,
        needsPull: !(await this.cacheManager.restore(info.primaryKey, info.cachePath)),
      }))
    );

    // Try to load cached images into Docker
    const verifiedProcessingInfos: readonly ImageProcessingInfo[] = await Promise.all(
      restoredProcessingInfos.map(async (info): Promise<ImageProcessingInfo> => {
        if (info.needsPull) return info;
        try {
          core.info(
            `Loading image ${info.imageName} (Platform: ${normalizePlatform(info.platform)}) from cache: ${info.cachePath}`
          );
          await this.dockerCommand.load(info.cachePath);
          core.info(`Image ${info.imageName} loaded successfully from cache.`);
          return { ...info, needsPull: false };
        } catch (loadError) {
          core.warning(`Failed to load ${info.imageName} from cache: ${getErrorMessage(loadError)}.`);
          return { ...info, needsPull: true };
        }
      })
    );

    // Determine if we had a complete cache hit
    const imagesToPullInfo = verifiedProcessingInfos.filter((info) => info.needsPull);
    const allCacheHit = imagesToPullInfo.length === 0 && verifiedProcessingInfos.length === validMetadata.length;
    core.setOutput('cache-hit', allCacheHit.toString());

    if (allCacheHit) {
      core.info('All required images were successfully restored from cache.');
      return;
    }

    // Pull images that couldn't be restored from cache
    core.info(`Pulling ${imagesToPullInfo.length} image(s)...`);

    // Process each image with its own pull operation and track results
    const pullResultsWithInfo = await Promise.all(
      imagesToPullInfo.map(async (info) => {
        try {
          await this.dockerCommand.pull(info.imageName);
          return { info, successful: true };
        } catch (error) {
          core.error(`Failed to pull image ${info.imageName}: ${getErrorMessage(error)}`);
          return { info, successful: false };
        }
      })
    );

    // Extract only successfully pulled images
    const successfullyPulledInfo = pullResultsWithInfo.filter(({ successful }) => successful).map(({ info }) => info);

    if (successfullyPulledInfo.length === 0) {
      core.warning('No images were successfully pulled, skipping cache save.');
      return;
    }

    // Save successfully pulled images to cache
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
