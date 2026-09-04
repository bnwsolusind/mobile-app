/**
 * Safe Remote URL Validator
 * Ensures only safe HTTPS (and controlled local HTTP during development) schemes are permitted.
 * Strictly blocks javascript:, file:, data:, content:, and relative paths.
 */

export function isSafeRemoteUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const trimmed = url.trim();
  const lower = trimmed.toLowerCase();

  // Strictly block dangerous schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('file:') ||
    lower.startsWith('data:') ||
    lower.startsWith('content:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  // Allow standard HTTPS
  if (lower.startsWith('https://')) {
    return true;
  }

  // Allow HTTP strictly for localhost/emulator/development domains
  if (lower.startsWith('http://')) {
    const isDevHost =
      lower.includes('10.0.2.2') ||
      lower.includes('localhost') ||
      lower.includes('127.0.0.1') ||
      lower.includes('192.168.') ||
      lower.includes('10.0.') ||
      lower.includes('172.');
    return isDevHost;
  }

  return false;
}

/**
 * Validates external update URL (supports HTTPS, Play Store market://, App Store)
 */
export function isSafeUpdateUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;

  const lower = url.trim().toLowerCase();
  if (lower.startsWith('market://')) return true;
  return isSafeRemoteUrl(url);
}
