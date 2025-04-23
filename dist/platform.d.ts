/**
 * Platform utility module for mapping between Node.js and OCI/Docker platform identifiers.
 */
/**
 * Platform information type definition
 */
export type PlatformInfo = {
    /** Operating system identifier */
    readonly os: string;
    /** Architecture identifier */
    readonly arch: string;
    /** Platform variant (optional) */
    readonly variant?: string;
};
/**
 * Parses a platform string into its components (OS, architecture, variant)
 * @param platform - Platform string in "os/arch[/variant]" format
 * @returns Parsed platform components, or null if format is invalid
 */
export declare function parsePlatformString(platform: string | null | undefined): PlatformInfo | null;
/**
 * Gets the platform information for the current environment
 * @returns Current environment's platform information, or null if unavailable
 */
export declare function getCurrentPlatformInfo(): PlatformInfo | null;
/**
 * Normalizes a platform component string for safe use in cache keys
 * @param component - Component string to normalize (OS, architecture, or variant)
 * @returns Safely normalized string, 'none' if component is undefined
 */
export declare function sanitizePlatformComponent(component: string | undefined): string;
