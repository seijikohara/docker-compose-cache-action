export type ImageInfo = {
    readonly imageName: string;
    readonly platform?: string;
};
export declare class ComposeParser {
    private readonly filePaths;
    constructor(filePaths: readonly string[]);
    /**
     * Reads and parses all specified Compose files to extract a sorted, unique list
     * of image information (name and platform).
     * @returns A readonly array of unique ImageInfo objects, sorted by name then platform.
     */
    getImageList(): readonly ImageInfo[];
}
