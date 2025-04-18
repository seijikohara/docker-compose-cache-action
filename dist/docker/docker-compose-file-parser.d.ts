/**
 * Image information with name and optional platform
 */
export type ImageInfo = {
    readonly imageName: string;
    readonly platform?: string;
};
/**
 * Parser for Docker Compose files that extracts image information
 */
export declare class DockerComposeFileParser {
    private readonly filePaths;
    /**
     * Creates a new Docker Compose file parser
     * @param filePaths Paths to Docker Compose files to parse
     * @throws Error if no paths provided or files not found
     */
    constructor(filePaths: readonly string[]);
    /**
     * Extracts unique, sorted list of images from all compose files
     * @returns Array of unique ImageInfo objects
     */
    getImageList(): readonly ImageInfo[];
}
