/**
 * @fileoverview Provides utilities for handling OCI (Open Container Initiative)
 * platform identifiers (os, architecture, variant) within a Node.js environment.
 * Includes mapping from Node.js values, parsing platform strings, and sanitization.
 */
/**
 * Represents the components of an OCI platform identifier (e.g., "linux/amd64", "linux/arm/v7").
 * @see https://github.com/opencontainers/image-spec/blob/main/image-index.md#platform-object
 */
export type PlatformInfo = {
    /** The normalized OCI operating system identifier (e.g., 'linux', 'windows'). */
    readonly os: string;
    /** The normalized OCI architecture identifier (e.g., 'amd64', 'arm64'). */
    readonly arch: string;
    /** The normalized OCI architecture variant identifier (e.g., 'v7', 'v8'), if applicable. */
    readonly variant?: string;
};
/**
 * Determines the OCI platform string (os/arch[/variant]) for the current Node.js runtime.
 * @returns The OCI platform string (e.g., "linux/amd64", "linux/arm/v7"), or `null` if resolution fails.
 */
export declare function getCurrentOciPlatformString(): string | null;
/**
 * Parses an OCI platform string into its components (OS, architecture, variant).
 * @param platformString - The platform string to parse (e.g., "linux/amd64", "windows/amd64/v8").
 * @returns A `PlatformInfo` object, or `null` if the string is invalid.
 */
export declare function parsePlatformString(platformString: string | null | undefined): PlatformInfo | null;
/**
 * Retrieves the OCI platform information (`PlatformInfo`) for the current Node.js runtime.
 * @returns A `PlatformInfo` object for the current environment, or `null` if resolution fails.
 */
export declare function getCurrentPlatformInfo(): PlatformInfo | null;
/**
 * Sanitizes a platform component string (OS, arch, or variant) for safe use (e.g., in file names).
 * Replaces non-alphanumeric characters (excluding '.', '_', '-') with underscores.
 * @param component - The platform component string to sanitize.
 * @returns A sanitized string. Returns 'none' if the input is null or undefined.
 */
export declare function sanitizePlatformComponent(component: string | null | undefined): string;
