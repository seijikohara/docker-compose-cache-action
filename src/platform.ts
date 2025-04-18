/**
 * Platform utility module for mapping between Node.js and OCI/Docker platform identifiers.
 * Provides conversion and normalization of OS/Architecture values.
 */

/**
 * Maps Node.js architecture identifiers to OCI architecture identifiers
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
  // Common Aliases
  ['aarch64', 'arm64'],
  ['x86_64', 'amd64'],
  ['x86', '386'],
  ['ppc', 'ppc'],
  ['s390', 's390'],
  ['mips64el', 'mips64le'],
]);

/** Set of known OCI architecture values for quick lookup */
const OCI_ARCH_VALUES: ReadonlySet<string> = new Set<string>(NODE_TO_OCI_ARCH_MAP.values());

/** Maps Node.js platform identifiers to OCI OS identifiers */
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

/** Set of known OCI OS values for quick lookup */
const OCI_OS_VALUES: ReadonlySet<string> = new Set<string>(NODE_TO_OCI_OS_MAP.values());

/**
 * Maps Node.js process.arch to the corresponding OCI architecture identifier
 * @param nodeArch Node.js architecture identifier
 * @returns OCI architecture identifier or undefined if not found
 */
export function mapNodeArchToOciArch(nodeArch: string): string | undefined {
  const mappedArch = NODE_TO_OCI_ARCH_MAP.get(nodeArch);
  return mappedArch ?? (OCI_ARCH_VALUES.has(nodeArch) ? nodeArch : undefined);
}

/**
 * Maps Node.js process.platform to the corresponding OCI OS identifier
 * @param nodePlatform Node.js platform identifier
 * @returns OCI OS identifier or undefined if not found
 */
export function mapNodeOsToOciOs(nodePlatform: string): string | undefined {
  const mappedOs = NODE_TO_OCI_OS_MAP.get(nodePlatform);
  return mappedOs ?? (OCI_OS_VALUES.has(nodePlatform) ? nodePlatform : undefined);
}

/**
 * Gets the OCI-standard platform string for the current Node.js environment
 * @returns Platform string in format "os/arch" or null if mapping failed
 */
export function getCurrentOciPlatform(): string | null {
  const os = mapNodeOsToOciOs(process.platform);
  const arch = mapNodeArchToOciArch(process.arch);
  return os && arch ? `${os}/${arch}` : null;
}

/**
 * Normalizes a platform string for safe use in cache keys or file paths
 * @param platform Platform string to normalize (e.g., "linux/amd64")
 * @returns Normalized string with slashes replaced by underscores
 */
export function normalizePlatform(platform: string | undefined): string {
  const targetPlatform = platform ?? getCurrentOciPlatform() ?? 'unknown_platform';
  return targetPlatform.replace(/\//g, '_');
}
