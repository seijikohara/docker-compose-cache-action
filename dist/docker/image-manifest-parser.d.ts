/** Platform details within manifest entries */
export type PlatformInfo = {
    readonly architecture?: string;
    readonly os?: string;
    readonly variant?: string;
};
/** Entry in a manifest list */
export type ManifestListEntry = {
    readonly digest: string;
    readonly platform?: PlatformInfo;
};
/** Multi-platform image manifest (OCI index) */
export type MultiPlatformImageManifest = {
    readonly mediaType: string;
    readonly manifests: readonly ManifestListEntry[];
    readonly digest?: string;
};
/** Single-platform image manifest */
export type SinglePlatformImageManifest = {
    readonly mediaType: string;
    readonly digest: string;
};
/** Union type representing both manifest structures */
export type ImageManifest = MultiPlatformImageManifest | SinglePlatformImageManifest;
/**
 * Type guard to differentiate between manifest types
 * @param manifest Manifest to check
 * @returns True if manifest is a multi-platform manifest
 */
export declare function isMultiPlatformManifest(manifest: ImageManifest): manifest is MultiPlatformImageManifest;
/**
 * Parser for Docker image manifests
 */
export declare class ImageManifestParser {
    /**
     * Parse JSON output from docker inspect command
     * @param jsonString JSON string from Docker manifest inspection
     * @returns Typed ImageManifest object (single or multi-platform)
     * @throws Error when parsing fails or structure is invalid
     */
    parse(jsonString: string): ImageManifest;
}
