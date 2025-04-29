/**
 * Platform utility module for OCI (Open Container Initiative) compatibility.
 * This module provides utilities for detecting and working with platform information
 * (OS, architecture, and variants) based on OCI specifications. It's used primarily
 * for Docker container image caching to ensure correct platform-specific cache handling.
 * References:
 * [1] https://github.com/opencontainers/image-spec/blob/main/image-index.md
 * [2] https://github.com/docker/buildx/blob/master/docs/reference/buildx_build.md#platform
 * [3] https://docs.docker.com/build/building/multi-platform/
 * [4] https://github.com/containerd/containerd/blob/main/platforms/platforms.go
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
 * AMD64 architecture variants for OCI image specifications
 */
export declare const AMD64_VARIANTS: {
    readonly V2: "v2";
    readonly V3: "v3";
    readonly V4: "v4";
};
/**
 * ARM architecture variants for OCI image specifications
 */
export declare const ARM_VARIANTS: {
    readonly V6: "v6";
    readonly V7: "v7";
    readonly V8: "v8";
};
/**
 * MIPS architecture variants for OCI image specifications
 */
export declare const MIPS_VARIANTS: {
    readonly R6: "r6";
};
/**
 * PowerPC architecture variants for OCI image specifications
 */
export declare const PPC_VARIANTS: {
    readonly POWER7: "power7";
    readonly POWER8: "power8";
    readonly POWER9: "power9";
};
/**
 * Parses a platform string into its components.
 * @param platformString - Platform string in "os/arch[/variant]" format
 * @returns Parsed platform components or null if invalid
 * @example
 * // Returns { os: "linux", arch: "amd64", variant: "v2" }
 * parsePlatformString("linux/amd64/v2")
 * // Returns { os: "darwin", arch: "arm64" }
 * parsePlatformString("darwin/arm64")
 */
export declare function parsePlatformString(platformString: string | null | undefined): PlatformInfo | null;
/**
 * Gets the platform information for the current environment.
 * @returns Current environment's platform information or null if unavailable
 * @example
 * // Example output: { os: "linux", arch: "amd64", variant: "v2" }
 */
export declare function getCurrentPlatformInfo(): PlatformInfo | null;
/**
 * Normalizes a platform component string for safe use in cache keys.
 * Removes any characters that might be problematic in file paths or cache key identifiers.
 * @param component - Platform component string to normalize
 * @returns Safely normalized string, 'none' if component is undefined
 * @example
 * // Returns "linux"
 * sanitizePlatformComponent("linux")
 * // Returns "windows_server_2022"
 * sanitizePlatformComponent("windows/server-2022")
 * // Returns "none"
 * sanitizePlatformComponent(undefined)
 */
export declare function sanitizePlatformComponent(component: string | undefined): string;
