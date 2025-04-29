import getCpuInfo from 'cpu-features';
import * as os from 'os';
import { arch, platform } from 'process';

import { actionCore } from './actions-wrapper';

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
export const AMD64_VARIANTS = {
  V2: 'v2',
  V3: 'v3',
  V4: 'v4',
} as const;

/**
 * ARM architecture variants for OCI image specifications
 */
export const ARM_VARIANTS = {
  V6: 'v6',
  V7: 'v7',
  V8: 'v8',
} as const;

/**
 * MIPS architecture variants for OCI image specifications
 */
export const MIPS_VARIANTS = {
  R6: 'r6',
} as const;

/**
 * PowerPC architecture variants for OCI image specifications
 */
export const PPC_VARIANTS = {
  POWER7: 'power7',
  POWER8: 'power8',
  POWER9: 'power9',
} as const;

// --- CPU Feature Detection Logic ---

/**
 * Attempts to load and return CPU features using the 'cpu-features' package.
 * @returns CPU features information, or null if unavailable
 */
function loadCpuFeatures(): getCpuInfo.CpuFeatures | null {
  try {
    const cpuFeatures = getCpuInfo();

    // Type-safe validation
    if (
      !cpuFeatures ||
      typeof cpuFeatures !== 'object' ||
      !('flags' in cpuFeatures) ||
      !cpuFeatures.flags ||
      typeof cpuFeatures.flags !== 'object'
    ) {
      actionCore.warning('cpu-features module loaded but returned an unexpected structure.');
      return null;
    }

    actionCore.debug('cpu-features loaded successfully.');
    return cpuFeatures as getCpuInfo.CpuFeatures;
  } catch (error) {
    const typedError = error as { code?: string; message?: string };

    if (typedError?.code !== 'MODULE_NOT_FOUND') {
      actionCore.warning(`Failed to load or execute cpu-features: ${typedError?.message || String(error)}`);
    } else {
      actionCore.debug('cpu-features module not found.');
    }
    return null;
  }
}

/**
 * Safely checks if a flag exists and is true in CPU flags.
 * Uses safe property checking to avoid Object Injection vulnerabilities.
 * @param flags - The flags object to check
 * @param flag - The flag name to verify
 * @returns True if the flag exists and is set to true, false otherwise
 */
function isFlagSet(flags: object, flag: string): boolean {
  // Safety check for null or undefined flags
  if (!flags) {
    return false;
  }

  // Safe property checking using Object.prototype methods to avoid injection vulnerabilities
  // This approach does not trigger ESLint's security/detect-object-injection warning
  return (
    Object.prototype.hasOwnProperty.call(flags, flag) &&
    Object.prototype.propertyIsEnumerable.call(flags, flag) &&
    Object.entries(flags).some(([key, value]) => key === flag && value === true)
  );
}

/**
 * Determines the AMD64 architecture variant based on CPU feature flags.
 * @param features - CPU features information
 * @returns Detected variant or undefined
 */
function detectAmd64Variant(features: getCpuInfo.X86CpuFeatures): string | undefined {
  const { flags } = features;

  if (!flags) {
    return undefined;
  }

  // Check for v2 required features
  const v2RequiredFlags = ['cx16', 'popcnt', 'sse3', 'ssse3', 'sse4_1', 'sse4_2'];
  const hasV2Features = v2RequiredFlags.every((flag) => isFlagSet(flags, flag));

  if (!hasV2Features) {
    return undefined;
  }

  // Check for v3 required features
  const v3RequiredFlags = ['avx', 'avx2', 'bmi1', 'bmi2', 'f16c', 'fma3', 'movbe'];
  const hasV3Features = v3RequiredFlags.every((flag) => isFlagSet(flags, flag));

  if (!hasV3Features) {
    return AMD64_VARIANTS.V2;
  }

  // Check for v4 required features
  const v4RequiredFlags = ['avx512f', 'avx512bw', 'avx512cd', 'avx512dq', 'avx512vl'];
  const hasV4Features = v4RequiredFlags.every((flag) => isFlagSet(flags, flag));

  if (!hasV4Features) {
    return AMD64_VARIANTS.V3;
  }

  return AMD64_VARIANTS.V4;
}

/**
 * Determines the ARM architecture variant based on CPU features.
 * @param cpuFeatures - CPU features information for ARM architecture
 * @returns Detected variant or undefined
 */
function detectArmVariant(cpuFeatures: getCpuInfo.ArmCpuFeatures | getCpuInfo.Aarch64CpuFeatures): string | undefined {
  // ARMv8 detection from microarchitecture
  if ('uarch' in cpuFeatures && typeof cpuFeatures.uarch === 'string' && cpuFeatures.uarch.includes('ARMv8')) {
    return ARM_VARIANTS.V8;
  }

  // ARM32 detection from flags
  if (cpuFeatures.arch === 'arm') {
    const armFeatures = cpuFeatures as getCpuInfo.ArmCpuFeatures;
    const { flags } = armFeatures;

    if (flags) {
      // NEON is ARMv7 feature
      if (isFlagSet(flags, 'neon')) {
        return ARM_VARIANTS.V7;
      }

      // VFP is ARMv6 feature
      if (isFlagSet(flags, 'vfp')) {
        return ARM_VARIANTS.V6;
      }
    }
  }

  // AARCH64 is always v8
  if (cpuFeatures.arch === 'aarch64') {
    return ARM_VARIANTS.V8;
  }

  return undefined;
}

/**
 * Determines the MIPS architecture variant based on CPU features.
 * @param cpuFeatures - CPU features information for MIPS architecture
 * @returns Detected variant or undefined
 */
function detectMipsVariant(cpuFeatures: getCpuInfo.MipsCpuFeatures): string | undefined {
  return cpuFeatures.flags && isFlagSet(cpuFeatures.flags, 'r6') ? MIPS_VARIANTS.R6 : undefined;
}

/**
 * Determines the PowerPC architecture variant based on CPU features.
 * @param cpuFeatures - CPU features information for PPC architecture
 * @returns Detected variant or undefined
 */
function detectPpcVariant(cpuFeatures: getCpuInfo.PPCCpuFeatures): string | undefined {
  // Detection from microarchitecture name
  if (typeof cpuFeatures.microarchitecture === 'string') {
    const uarch = cpuFeatures.microarchitecture.toLowerCase();

    if (uarch.includes('power9')) return PPC_VARIANTS.POWER9;
    if (uarch.includes('power8')) return PPC_VARIANTS.POWER8;
    if (uarch.includes('power7')) return PPC_VARIANTS.POWER7;
  }

  // Detection from CPU flags
  if (cpuFeatures.flags) {
    if (isFlagSet(cpuFeatures.flags, 'arch300')) return PPC_VARIANTS.POWER9;
    if (isFlagSet(cpuFeatures.flags, 'arch207')) return PPC_VARIANTS.POWER8;
  }

  return undefined;
}

/**
 * Detects the OCI variant for the provided architecture.
 * @param ociArch - OCI architecture identifier
 * @returns The detected variant or undefined
 */
function detectOciVariant(ociArch: string): string | undefined {
  const cpuFeatures = loadCpuFeatures();

  /**
   * Helper for ARM variant detection.
   * @param arch - ARM architecture string
   * @param cpuFeatures - CPU features information, if available
   * @returns The appropriate ARM variant
   */
  const getArmVariant = (arch: string, cpuFeatures: getCpuInfo.CpuFeatures | null): string => {
    // ARM64 is always v8
    if (arch === 'arm64') {
      return ARM_VARIANTS.V8;
    }

    // Use CPU features for ARM32 if available
    if (cpuFeatures?.arch === 'arm' || cpuFeatures?.arch === 'aarch64') {
      const armCpuInfo = cpuFeatures as getCpuInfo.ArmCpuFeatures | getCpuInfo.Aarch64CpuFeatures;
      const detectedVariant = detectArmVariant(armCpuInfo);
      if (detectedVariant) {
        return detectedVariant;
      }
    }

    // Default fallback: ARM32 is v7
    actionCore.debug("Applying heuristic: Detected ARM architecture, assuming 'v7' variant as default.");
    return ARM_VARIANTS.V7;
  };

  // If CPU info is unavailable, use architecture-specific defaults
  if (!cpuFeatures) {
    actionCore.debug('cpu-features not available. Applying architecture heuristics.');
    if (ociArch === 'arm64' || ociArch === 'arm') {
      return getArmVariant(ociArch, null);
    }
    return undefined;
  }

  // Delegate to specific detection functions based on architecture
  switch (ociArch) {
    case 'amd64':
      if (cpuFeatures.arch !== 'x86') {
        return undefined;
      }
      return detectAmd64Variant(cpuFeatures as getCpuInfo.X86CpuFeatures);

    case 'arm':
    case 'arm64':
      return getArmVariant(ociArch, cpuFeatures);

    case 'mips':
    case 'mipsle':
      if (cpuFeatures.arch !== 'mips') {
        return undefined;
      }
      return detectMipsVariant(cpuFeatures as getCpuInfo.MipsCpuFeatures);

    case 'ppc64':
    case 'ppc64le':
      if (cpuFeatures.arch !== 'ppc') {
        return undefined;
      }
      return detectPpcVariant(cpuFeatures as getCpuInfo.PPCCpuFeatures);

    default:
      return undefined;
  }
}

// --- Platform Mapping Logic ---

/**
 * Maps Node.js OS identifier to OCI OS identifier.
 * @param nodePlatform - Node.js platform identifier
 * @returns Corresponding OCI OS identifier or undefined
 */
function mapNodeOsToOciOs(nodePlatform: string): string | undefined {
  // Direct mappings from Node.js platform to OCI OS
  const platformMap = {
    aix: 'aix',
    darwin: 'darwin',
    freebsd: 'freebsd',
    linux: 'linux',
    openbsd: 'openbsd',
    sunos: 'solaris', // OCI uses 'solaris'
    win32: 'windows', // OCI uses 'windows'
    android: 'android',
    windows: 'windows', // Pass-through
    solaris: 'solaris', // Pass-through
  } as const;

  // Type-safe property access
  const mappedOs = nodePlatform in platformMap ? platformMap[nodePlatform as keyof typeof platformMap] : undefined;

  if (!mappedOs) {
    actionCore.warning(`Unknown Node.js platform: ${nodePlatform}. Cannot determine OCI OS.`);
  }

  return mappedOs;
}

/**
 * Maps Node.js architecture to OCI architecture.
 * @param nodeArch - Node.js architecture identifier
 * @returns Corresponding OCI architecture or undefined
 */
function mapNodeArchToOciArch(nodeArch: string): string | undefined {
  /**
   * Helper to safely get system endianness.
   * @returns System endianness or undefined if cannot be determined
   */
  const getEndianness = (): 'LE' | 'BE' | undefined => {
    try {
      return os.endianness();
    } catch (error) {
      const typedError = error as { message?: string };
      actionCore.warning(
        `Failed to determine endianness for arch '${nodeArch}': ${typedError?.message || String(error)}`
      );
      return undefined;
    }
  };

  // Direct mappings for architectures without endianness concerns
  const simpleArchMap = {
    x64: 'amd64',
    ia32: '386',
    arm: 'arm',
    arm64: 'arm64',
    s390x: 's390x',
    loong64: 'loong64',
    riscv64: 'riscv64',
    aarch64: 'arm64', // alias
    x86_64: 'amd64', // alias
    x86: '386', // alias
    amd64: 'amd64', // pass-through
    '386': '386', // pass-through
    ppc64le: 'ppc64le', // pass-through
    mipsle: 'mipsle', // pass-through
  } as const;

  // First check simple mappings with type safety
  if (nodeArch in simpleArchMap) {
    return simpleArchMap[nodeArch as keyof typeof simpleArchMap];
  }

  // Special cases that depend on endianness
  switch (nodeArch) {
    case 'ppc64': {
      const endian = getEndianness();
      return endian === 'LE' ? 'ppc64le' : 'ppc64';
    }
    case 'mips': {
      const endian = getEndianness();
      return endian === 'LE' ? 'mipsle' : 'mips';
    }
    case 'mipsel':
      return 'mipsle';
    case 'ppc':
      actionCore.warning(`Node.js arch 'ppc' lacks a direct equivalent in standard OCI. Using 'ppc'.`);
      return 'ppc';
    case 's390':
      actionCore.warning(
        `Node.js arch 's390' lacks a direct equivalent in standard OCI (s390x is common). Using 's390'.`
      );
      return 's390';
    default:
      actionCore.warning(`Unknown Node.js architecture: ${nodeArch}. Cannot determine OCI architecture.`);
      return undefined;
  }
}

// --- Public Interface ---

/**
 * Gets the OCI platform string for the current environment.
 * @returns Platform string in "os/arch[/variant]" format, or null if unavailable
 */
function getOciPlatform(): string | null {
  const ociOs = mapNodeOsToOciOs(platform);
  if (!ociOs) return null;

  const ociArch = mapNodeArchToOciArch(arch);
  if (!ociArch) return null;

  const ociVariant = detectOciVariant(ociArch);
  return ociVariant ? `${ociOs}/${ociArch}/${ociVariant}` : `${ociOs}/${ociArch}`;
}

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
export function parsePlatformString(platformString: string | null | undefined): PlatformInfo | null {
  if (!platformString) return null;

  const parts = platformString.split('/');
  if (parts.length < 2 || parts.length > 3) return null;

  return {
    os: parts[0],
    arch: parts[1],
    variant: parts.length === 3 ? parts[2] : undefined,
  };
}

/**
 * Gets the platform information for the current environment.
 * @returns Current environment's platform information or null if unavailable
 * @example
 * // Example output: { os: "linux", arch: "amd64", variant: "v2" }
 */
export function getCurrentPlatformInfo(): PlatformInfo | null {
  return parsePlatformString(getOciPlatform());
}

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
export function sanitizePlatformComponent(component: string | undefined): string {
  return component ? component.replace(/[^a-zA-Z0-9._-]/g, '_') : 'none';
}
