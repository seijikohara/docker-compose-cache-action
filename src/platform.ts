/**
 * @fileoverview Provides utilities for handling OCI (Open Container Initiative)
 * platform identifiers (os, architecture, variant) within a Node.js environment.
 * Includes mapping from Node.js values, parsing platform strings, and sanitization.
 */

/**
 * Represents the components of an OCI platform identifier (e.g., "linux/amd64", "linux/arm/v7").
 * @see https://github.com/opencontainers/image-spec/blob/main/image-index.md#platform-object
 */
export type OciPlatform = {
  /** The normalized OCI operating system identifier (e.g., 'linux', 'windows'). */
  readonly os: string;
  /** The normalized OCI architecture identifier (e.g., 'amd64', 'arm64'). */
  readonly arch: string;
  /** The normalized OCI architecture variant identifier (e.g., 'v7', 'v8'), if applicable. */
  readonly variant?: string;
};

/**
 * Maps Node.js architecture identifiers (`process.arch`) to their OCI equivalents.
 * Only includes entries where Node.js and OCI values differ.
 * @see https://nodejs.org/api/process.html#processarch
 */
const NODE_TO_OCI_ARCH: Readonly<Record<string, string>> = {
  x64: 'amd64',
  ia32: '386',
  ppc64: 'ppc64le',
  mipsel: 'mipsle',
  aarch64: 'arm64',
  x86_64: 'amd64',
  x86: '386',
  mips64el: 'mips64le',
} as const;

/**
 * Maps Node.js platform identifiers (`process.platform`) to their OCI OS equivalents.
 * Only includes entries where Node.js and OCI values differ.
 * @see https://nodejs.org/api/process.html#processplatform
 */
const NODE_TO_OCI_OS: Readonly<Record<string, string>> = {
  win32: 'windows',
  sunos: 'solaris',
} as const;

/**
 * Maps Node.js specific ARM version identifiers or explicit variant strings
 * to their canonical OCI variant equivalents.
 * Only includes entries where Node.js and OCI values differ.
 */
const NODE_TO_OCI_VARIANT: Readonly<Record<string, string>> = {
  '6': 'v6',
  '7': 'v7',
} as const;

/**
 * Converts a Node.js platform identifier to its OCI OS equivalent.
 * If not found in the mapping, returns the original value.
 *
 * @param os - Node.js platform identifier (e.g., 'linux', 'win32').
 * @returns OCI OS identifier (e.g., 'linux', 'windows').
 */
function toOciOs(os: string): string {
  return NODE_TO_OCI_OS[os as keyof typeof NODE_TO_OCI_OS] ?? os;
}

/**
 * Converts a Node.js architecture identifier to its OCI architecture equivalent.
 * If not found in the mapping, returns the original value.
 *
 * @param arch - Node.js architecture identifier (e.g., 'x64', 'arm64').
 * @returns OCI architecture identifier (e.g., 'amd64', 'arm64').
 */
function toOciArch(arch: string): string {
  return NODE_TO_OCI_ARCH[arch as keyof typeof NODE_TO_OCI_ARCH] ?? arch;
}

/**
 * Converts a Node.js ARM variant or explicit variant string to its OCI variant equivalent.
 * If not found in the mapping, returns the original value.
 *
 * @param variant - Node.js ARM variant or OCI variant string (e.g., 'v7', 'v8', '6', '7').
 * @returns OCI variant string or undefined if not provided.
 */
function toOciVariant(variant: string | undefined): string | undefined {
  if (!variant) return undefined;
  return NODE_TO_OCI_VARIANT[variant as keyof typeof NODE_TO_OCI_VARIANT] ?? variant;
}

/**
 * Determines the OCI platform string (os/arch[/variant]) for the current Node.js runtime.
 *
 * @returns The OCI platform string (e.g., "linux/amd64", "linux/arm/v7"), or `undefined` if resolution fails.
 */
export function getCurrentOciPlatformString(): string | undefined {
  const os = toOciOs(process.platform);
  const arch = toOciArch(process.arch);
  // Determine variant primarily for 'arm' architecture using Node's specific variable.
  const nodeArmVersion = (process.config?.variables as Record<string, unknown>)?.arm_version as string | undefined;
  const variant = arch === 'arm' ? toOciVariant(nodeArmVersion) : undefined;
  return variant ? `${os}/${arch}/${variant}` : `${os}/${arch}`;
}

/**
 * Parses an OCI platform string into its components (OS, architecture, variant).
 *
 * @param ociPlatformString - The platform string to parse (e.g., "linux/amd64", "windows/amd64/v8").
 * @returns A `OciPlatform` object, or `undefined` if the string is invalid.
 */
export function parseOciPlatformString(ociPlatformString: string | undefined): OciPlatform | undefined {
  if (!ociPlatformString) {
    return undefined;
  }
  const platformComponents = ociPlatformString.split('/');
  if (platformComponents.length < 2 || !platformComponents[0] || !platformComponents[1]) {
    return undefined;
  }
  const [os, arch, variant] = platformComponents;
  return {
    os: toOciOs(os),
    arch: toOciArch(arch),
    variant: toOciVariant(variant),
  };
}

/**
 * Retrieves the OCI platform information (`OciPlatform`) for the current Node.js runtime.
 *
 * @returns A `OciPlatform` object for the current environment, or `undefined` if resolution fails.
 */
export function getCurrentPlatformInfo(): OciPlatform | undefined {
  const currentOciPlatformString = getCurrentOciPlatformString();
  return parseOciPlatformString(currentOciPlatformString);
}
