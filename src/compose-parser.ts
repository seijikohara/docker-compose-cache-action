import * as fs from 'fs';
import * as yaml from 'js-yaml';
import * as core from '@actions/core';

type ComposeService = {
  image?: string;
};

type ComposeConfig = {
  services?: { [key: string]: ComposeService };
};

export class ComposeParser {
  private readonly filePaths: readonly string[];

  constructor(filePaths: readonly string[]) {
    if (filePaths.length === 0) {
      throw new Error('No Compose file paths provided.');
    }
    filePaths.forEach((file) => {
      if (!fs.existsSync(file)) {
        throw new Error(`Compose file not found: ${file}`);
      }
    });
    this.filePaths = filePaths;
  }

  getImageList(): string[] {
    const images = this.filePaths.flatMap((filePath) => {
      try {
        const fileContents = fs.readFileSync(filePath, 'utf8');
        const data = yaml.load(fileContents) as ComposeConfig | null | undefined;
        return data?.services
          ? Object.entries(data.services).reduce<string[]>(
              (acc, [, service]) => (service?.image ? [...acc, service.image] : acc),
              []
            )
          : [];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        core.error(`Failed to read/parse YAML file '${filePath}': ${message}`);
        throw new Error(`Could not process compose file: ${filePath}`);
      }
    });
    return [...new Set(images)].sort();
  }
}
