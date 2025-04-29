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
 * Maps Node.js architecture identifiers (`process.arch`) to their OCI equivalents.
 * Includes common aliases.
 * @see https://nodejs.org/api/process.html#processarch
 */
const NODE_TO_OCI_ARCH_MAP: ReadonlyMap<string, string> = new Map([
  ['x64', 'amd64'],
  ['arm64', 'arm64'],
  ['ia32', '386'],
  ['arm', 'arm'],
  ['ppc64', 'ppc64le'],
  ['s390x', 's390x'],
  ['mips', 'mips'],
  ['mipsel', 'mipsle'],
  ['loong64', 'loong64'],
  ['riscv64', 'riscv64'],
  // Aliases
  ['aarch64', 'arm64'],
  ['x86_64', 'amd64'],
  ['x86', '386'],
  ['ppc', 'ppc'],
  ['s390', 's390'],
  ['mips64el', 'mips64le'],
]);

/** A set containing all valid OCI architecture values derived from the map. */
const VALID_OCI_ARCHS: ReadonlySet<string> = new Set(NODE_TO_OCI_ARCH_MAP.values());

/**
 * Maps Node.js platform identifiers (`process.platform`) to their OCI OS equivalents.
 * @see https://nodejs.org/api/process.html#processplatform
 */
const NODE_TO_OCI_OS_MAP: ReadonlyMap<string, string> = new Map([
  ['linux', 'linux'],
  ['win32', 'windows'],
  ['darwin', 'darwin'],
  ['aix', 'aix'],
  ['freebsd', 'freebsd'],
  ['openbsd', 'openbsd'],
  ['sunos', 'solaris'],
  ['android', 'android'],
]);

/** A set containing all valid OCI OS values derived from the map. */
const VALID_OCI_OSS: ReadonlySet<string> = new Set(NODE_TO_OCI_OS_MAP.values());

/**
 * Maps Node.js specific ARM version identifiers or explicit variant strings
 * to their canonical OCI variant equivalents.
 */
const NODE_TO_OCI_VARIANT_MAP: ReadonlyMap<string, string> = new Map([
  // Node.js `arm_version` specific values
  ['6', 'v6'],
  ['7', 'v7'],
  // Explicit OCI variants (allow passthrough)
  ['v5', 'v5'],
  ['v6', 'v6'],
  ['v7', 'v7'],
  ['v8', 'v8'],
]);

/** A set containing all valid OCI variant values derived from the map. */
const VALID_OCI_VARIANTS: ReadonlySet<string> = new Set(NODE_TO_OCI_VARIANT_MAP.values());

/**
 * Internal helper to resolve an OCI architecture identifier.
 *
 * @param arch - The architecture string to map (Node.js or OCI).
 * @returns The canonical OCI architecture string or `undefined`.
 */
function resolveOciArch(arch: string | undefined): string | undefined {
  if (!arch) return undefined;
  return NODE_TO_OCI_ARCH_MAP.get(arch) ?? (VALID_OCI_ARCHS.has(arch) ? arch : undefined);
}

/**
 * Internal helper to resolve an OCI OS identifier.
 *
 * @param os - The OS string to map (Node.js or OCI).
 * @returns The canonical OCI OS string or `undefined`.
 */
function resolveOciOs(os: string | undefined): string | undefined {
  if (!os) return undefined;
  return NODE_TO_OCI_OS_MAP.get(os) ?? (VALID_OCI_OSS.has(os) ? os : undefined);
}

/**
 * Internal helper to resolve an OCI variant identifier.
 *
 * @param variant - The variant string to map (Node.js arm_version or OCI).
 * @returns The canonical OCI variant string or `undefined`.
 */
function resolveOciVariant(variant: string | undefined): string | undefined {
  if (!variant) return undefined;
  return NODE_TO_OCI_VARIANT_MAP.get(variant) ?? (VALID_OCI_VARIANTS.has(variant) ? variant : undefined);
}

/**
 * Determines the OCI platform string (os/arch[/variant]) for the current Node.js runtime.
 *
 * @returns The OCI platform string (e.g., "linux/amd64", "linux/arm/v7"), or `null` if resolution fails.
 */
export function getCurrentOciPlatformString(): string | null {
  const os = resolveOciOs(process.platform);
  if (!os) {
    // Could not resolve OS
    return null;
  }

  const arch = resolveOciArch(process.arch);
  if (!arch) {
    // Could not resolve architecture
    return null;
  }

  // Determine variant primarily for 'arm' architecture using Node's specific variable.
  const nodeArmVersion = (process.config?.variables as Record<string, unknown>)?.arm_version as string | undefined;
  const variant = arch === 'arm' ? resolveOciVariant(nodeArmVersion) : undefined;

  return variant ? `${os}/${arch}/${variant}` : `${os}/${arch}`;
}

/**
 * Parses an OCI platform string into its components (OS, architecture, variant).
 *
 * @param platformString - The platform string to parse (e.g., "linux/amd64", "windows/amd64/v8").
 * @returns A `PlatformInfo` object, or `null` if the string is invalid.
 */
export function parsePlatformString(platformString: string | null | undefined): PlatformInfo | null {
  if (!platformString) {
    return null;
  }

  const parts = platformString.split('/');
  // Must have at least os/arch, and they must not be empty strings
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    // Invalid format
    return null;
  }

  const os = resolveOciOs(parts[0]);
  const arch = resolveOciArch(parts[1]);
  const variantInput = parts.length > 2 && parts[2] ? parts[2] : undefined;
  const variant = resolveOciVariant(variantInput);

  // OS and Arch are mandatory and must be valid
  if (!os || !arch) {
    // Invalid or unrecognized OS or Arch
    return null;
  }

  const result: PlatformInfo = { os, arch, ...(variant && { variant }) };
  return result;
}

/**
 * Retrieves the OCI platform information (`PlatformInfo`) for the current Node.js runtime.
 *
 * @returns A `PlatformInfo` object for the current environment, or `null` if resolution fails.
 */
export function getCurrentPlatformInfo(): PlatformInfo | null {
  const platformString = getCurrentOciPlatformString();
  return parsePlatformString(platformString);
}
