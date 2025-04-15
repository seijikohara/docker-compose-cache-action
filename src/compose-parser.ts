import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as core from '@actions/core';

// Type definition for the object returned by getImageList
export type ImageInfo = {
  readonly imageName: string;
  readonly platform?: string;
};

// Internal type definitions for parsing YAML
type ComposeService = {
  readonly image?: string;
  readonly platform?: string;
};

type ComposeConfig = {
  readonly services?: { readonly [key: string]: ComposeService };
};

export class ComposeParser {
  private readonly filePaths: readonly string[];

  constructor(filePaths: readonly string[]) {
    if (filePaths.length === 0) throw new Error('No Compose file paths provided.');
    // Ensure all specified files exist upon instantiation
    filePaths.forEach((filePath) => {
      if (!fs.existsSync(filePath)) throw new Error(`Compose file not found: ${filePath}`);
    });
    this.filePaths = filePaths;
  }

  /**
   * Reads and parses all specified Compose files to extract a sorted, unique list
   * of image information (name and platform).
   * @returns A readonly array of unique ImageInfo objects, sorted by name then platform.
   */
  getImageList(): readonly ImageInfo[] {
    const imageInfos = this.filePaths.flatMap((filePath): ImageInfo[] => {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(fileContents) as ComposeConfig | null | undefined;

        // Use optional chaining and nullish coalescing for safety
        const services = data?.services ?? {};

        // Extract ImageInfo objects using reduce
        return Object.entries(services).reduce<ImageInfo[]>(
          (accumulator, [, service]) =>
            // Only add if service and service.image are defined
            service?.image ? [...accumulator, { imageName: service.image, platform: service.platform }] : accumulator,
          [] // Initial value for the accumulator
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.error(`Failed to read/parse YAML file '${filePath}': ${message}`);
        throw new Error(`Could not process compose file: ${filePath}`);
      }
    });

    // Deduplicate based on the combination of imageName and platform using reduce
    const uniqueImageInfos = imageInfos.reduce<ImageInfo[]>((uniqueList, currentInfo) => {
      // Create a unique key for each image+platform combination
      const key = `${currentInfo.imageName}@@${currentInfo.platform ?? 'default'}`;
      // Check if an item with the same key already exists in the accumulator
      const exists = uniqueList.some((item) => `${item.imageName}@@${item.platform ?? 'default'}` === key);
      // If it doesn't exist, add it to the unique list
      return exists ? uniqueList : [...uniqueList, currentInfo];
    }, []); // Initial value for the accumulator

    // Sort the unique list, primarily by image name, then by platform (undefined first)
    // Create a mutable copy for sorting, then return as readonly
    return [...uniqueImageInfos].sort((infoA, infoB) => {
      const nameCompare = infoA.imageName.localeCompare(infoB.imageName);
      if (nameCompare !== 0) return nameCompare;

      const platformA = infoA.platform;
      const platformB = infoB.platform;

      if (platformA === platformB) return 0; // Both same (or both undefined)
      if (platformA === undefined) return -1; // Undefined platforms come first
      if (platformB === undefined) return 1;
      return platformA.localeCompare(platformB); // Sort defined platforms alphabetically
    });
  }
}
