import * as fs from 'fs';
import * as core from '@actions/core';
import * as yaml from 'js-yaml';
import { getErrorMessage } from '../errors';

/**
 * Image information with name and optional platform
 */
export type ImageInfo = {
  readonly imageName: string;
  readonly platform?: string;
};

/**
 * Internal type definitions for parsing compose file structure
 */
type ComposeService = {
  readonly image?: string;
  readonly platform?: string;
};

type ComposeConfig = {
  readonly services?: { readonly [key: string]: ComposeService };
};

/**
 * Parser for Docker Compose files that extracts image information
 */
export class DockerComposeFileParser {
  private readonly filePaths: readonly string[];

  /**
   * Creates a new Docker Compose file parser
   * @param filePaths Paths to Docker Compose files to parse
   * @throws Error if no paths provided or files not found
   */
  constructor(filePaths: readonly string[]) {
    if (filePaths.length === 0) throw new Error('No Compose file paths provided.');

    // Check if all files exist using every() method
    const allFilesExist = filePaths.every((filePath) => fs.existsSync(filePath));
    if (!allFilesExist) {
      const missingFile = filePaths.find((filePath) => !fs.existsSync(filePath));
      throw new Error(`Compose file not found: ${missingFile}`);
    }

    this.filePaths = filePaths;
  }

  /**
   * Extracts unique, sorted list of images from all compose files
   * @returns Array of unique ImageInfo objects
   */
  getImageList(): readonly ImageInfo[] {
    const imageInfos = this.filePaths.flatMap((filePath): ImageInfo[] => {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(fileContents) as ComposeConfig | null | undefined;
        const services = data?.services ?? {};

        return Object.entries(services).reduce<ImageInfo[]>(
          (accumulator, [, service]) =>
            service?.image ? [...accumulator, { imageName: service.image, platform: service.platform }] : accumulator,
          []
        );
      } catch (error) {
        core.error(`Failed to read/parse YAML file '${filePath}': ${getErrorMessage(error)}`);
        throw new Error(`Could not process compose file: ${filePath}`);
      }
    });

    const uniqueImageInfos = imageInfos.reduce<ImageInfo[]>((uniqueList, currentInfo) => {
      const key = `${currentInfo.imageName}@@${currentInfo.platform ?? 'default'}`;
      const exists = uniqueList.some((item) => `${item.imageName}@@${item.platform ?? 'default'}` === key);
      return exists ? uniqueList : [...uniqueList, currentInfo];
    }, []);

    return [...uniqueImageInfos].sort((infoA, infoB) => {
      const nameCompare = infoA.imageName.localeCompare(infoB.imageName);
      if (nameCompare !== 0) return nameCompare;

      const platformA = infoA.platform;
      const platformB = infoB.platform;

      if (platformA === platformB) return 0;
      if (platformA === undefined) return -1;
      if (platformB === undefined) return 1;
      return platformA.localeCompare(platformB);
    });
  }
}
