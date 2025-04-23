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
 * Mapping from Node.js architecture identifiers to OCI architecture identifiers
 */
const NODE_TO_OCI_ARCH_MAP: ReadonlyMap<string, string> = new Map<string, string>([
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
  // Common aliases
  ['aarch64', 'arm64'],
  ['x86_64', 'amd64'],
  ['x86', '386'],
  ['ppc', 'ppc'],
  ['s390', 's390'],
  ['mips64el', 'mips64le'],
]);

/**
 * Set of known OCI architecture values for fast lookup
 */
const OCI_ARCH_VALUES: ReadonlySet<string> = new Set<string>(NODE_TO_OCI_ARCH_MAP.values());

/**
 * Mapping from Node.js platform identifiers to OCI OS identifiers
 */
const NODE_TO_OCI_OS_MAP: ReadonlyMap<string, string> = new Map<string, string>([
  ['linux', 'linux'],
  ['win32', 'windows'],
  ['darwin', 'darwin'],
  ['aix', 'aix'],
  ['freebsd', 'freebsd'],
  ['openbsd', 'openbsd'],
  ['sunos', 'solaris'],
  ['android', 'android'],
]);

/**
 * Set of known OCI OS values for fast lookup
 */
const OCI_OS_VALUES: ReadonlySet<string> = new Set<string>(NODE_TO_OCI_OS_MAP.values());

/**
 * Maps Node.js architecture identifier to OCI architecture identifier
 * @param nodeArch - Node.js architecture identifier (e.g., 'x64', 'arm64')
 * @returns Corresponding OCI architecture identifier, or undefined if no mapping exists
 */
function mapNodeArchToOciArch(nodeArch: string): string | undefined {
  return NODE_TO_OCI_ARCH_MAP.get(nodeArch) ?? (OCI_ARCH_VALUES.has(nodeArch) ? nodeArch : undefined);
}

/**
 * Maps Node.js OS identifier to OCI OS identifier
 * @param nodePlatform - Node.js OS identifier (e.g., 'linux', 'win32')
 * @returns Corresponding OCI OS identifier, or undefined if no mapping exists
 */
function mapNodeOsToOciOs(nodePlatform: string): string | undefined {
  return NODE_TO_OCI_OS_MAP.get(nodePlatform) ?? (OCI_OS_VALUES.has(nodePlatform) ? nodePlatform : undefined);
}

/**
 * Gets the OCI platform string for the current Node.js environment
 * @returns Platform string in "os/arch" format, or null if conversion failed
 */
function getCurrentOciPlatform(): string | null {
  const os = mapNodeOsToOciOs(process.platform);
  const arch = mapNodeArchToOciArch(process.arch);

  if (!os || !arch) {
    return null;
  }

  return `${os}/${arch}`;
}

/**
 * Parses a platform string into its components (OS, architecture, variant)
 * @param platform - Platform string in "os/arch[/variant]" format
 * @returns Parsed platform components, or null if format is invalid
 */
export function parsePlatformString(platform: string | null | undefined): PlatformInfo | null {
  if (!platform) {
    return null;
  }

  const parts = platform.split('/');
  if (parts.length < 2) {
    return null;
  }

  return {
    os: parts[0],
    arch: parts[1],
    variant: parts.length > 2 ? parts[2] : undefined,
  };
}

/**
 * Gets the platform information for the current environment
 * @returns Current environment's platform information, or null if unavailable
 */
export function getCurrentPlatformInfo(): PlatformInfo | null {
  return parsePlatformString(getCurrentOciPlatform());
}

/**
 * Normalizes a platform component string for safe use in cache keys
 * @param component - Component string to normalize (OS, architecture, or variant)
 * @returns Safely normalized string, 'none' if component is undefined
 */
export function sanitizePlatformComponent(component: string | undefined): string {
  if (!component) {
    return 'none';
  }

  return component.replace(/[^a-zA-Z0-9._-]/g, '_');
}
