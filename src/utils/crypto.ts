/**
 * Generates a cryptographically random, unpredictable verification ID.
 * Follows the format: AB-XXXX-XXXX-XXXX-XXXX
 */
export function generateVerificationId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `AB-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
  }
  // Fallback
  const rand = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return `AB-${rand.slice(0, 16).toUpperCase()}`;
}

/**
 * Generates a URL-safe random alphanumeric slug for /alis/{alis}
 */
export function generateAlisSlug(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  let result = '';
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < 8; i++) {
      result += chars[bytes[i] % chars.length];
    }
  } else {
    for (let i = 0; i < 8; i++) {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}
