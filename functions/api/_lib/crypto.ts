/**
 * AES-256-GCM encryption/decryption using Web Crypto API.
 *
 * - Each encryption uses a random 12-byte IV (prepended to ciphertext)
 * - Key derived from hex string stored in Workers Secrets
 * - Format: [12-byte IV][ciphertext+tag]
 *
 * Validates: Requirement 52.3
 */

const IV_LENGTH = 12; // bytes — recommended for AES-GCM
const KEY_LENGTH = 32; // bytes — 256 bits

// ── Key import ────────────────────────────────────────────────

/**
 * Import a hex-encoded key string into a CryptoKey for AES-256-GCM.
 */
async function importKey(hexKey: string): Promise<CryptoKey> {
  const keyBytes = hexToBytes(hexKey);
  if (keyBytes.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${keyBytes.length}`);
  }

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Hex helpers ───────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Encrypt ───────────────────────────────────────────────────

/**
 * Encrypt data with AES-256-GCM.
 *
 * @param plaintext  Raw bytes to encrypt.
 * @param hexKey     Hex-encoded 256-bit key from Workers Secrets.
 * @returns Uint8Array containing [IV (12 bytes) | ciphertext + auth tag].
 */
export async function encrypt(plaintext: Uint8Array, hexKey: string): Promise<Uint8Array> {
  const key = await importKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  // Prepend IV to ciphertext
  const result = new Uint8Array(IV_LENGTH + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), IV_LENGTH);

  return result;
}

// ── Decrypt ───────────────────────────────────────────────────

/**
 * Decrypt data encrypted with AES-256-GCM.
 *
 * @param encrypted  Uint8Array containing [IV (12 bytes) | ciphertext + auth tag].
 * @param hexKey     Hex-encoded 256-bit key from Workers Secrets.
 * @returns Decrypted plaintext bytes.
 */
export async function decrypt(encrypted: Uint8Array, hexKey: string): Promise<Uint8Array> {
  if (encrypted.length < IV_LENGTH + 1) {
    throw new Error('Encrypted data too short');
  }

  const key = await importKey(hexKey);
  const iv = encrypted.slice(0, IV_LENGTH);
  const ciphertext = encrypted.slice(IV_LENGTH);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

// ── Generate key ──────────────────────────────────────────────

/**
 * Generate a random 256-bit key as hex string.
 * Useful for initial setup — store result in Workers Secrets.
 */
export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_LENGTH));
  return bytesToHex(bytes);
}
