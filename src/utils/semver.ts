/**
 * Semantic Version Comparison Utility
 * Compares semantic version strings numerically (e.g. 1.10.0 > 1.2.0).
 */

export function parseSemver(version: string): [number, number, number] {
  if (!version || typeof version !== 'string') {
    return [0, 0, 0];
  }

  // Remove leading 'v' or 'V' and any build metadata
  const clean = version.trim().replace(/^[vV]/, '').split('-')[0].split('+')[0];
  const parts = clean.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : Math.max(0, num);
  });

  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

/**
 * Returns:
 *  -1 if v1 < v2
 *   0 if v1 === v2
 *   1 if v1 > v2
 */
export function semverCompare(v1: string, v2: string): number {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;

  return 0;
}

/**
 * Checks if a force update is required based on current app version,
 * certified minimum version, and force update flag.
 */
export function isForceUpdateRequired(
  currentVersion: string,
  minVersion: string,
  forceUpdateEnabled: boolean
): boolean {
  if (!forceUpdateEnabled) return false;
  return semverCompare(currentVersion, minVersion) < 0;
}
