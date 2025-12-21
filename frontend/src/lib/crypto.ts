/**
 * Secure Storage Utility
 * 
 * Provides encryption for sensitive data stored in localStorage using SubtleCrypto.
 * This helps protect API keys from XSS attacks by encrypting them before storage.
 * 
 * Note: This is defense-in-depth. The encryption key is derived from a device-specific
 * fingerprint, making it harder (but not impossible) for XSS attacks to extract keys.
 * For maximum security, consider server-side key proxying.
 */

const ENCRYPTION_ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

async function getDeviceFingerprint(): Promise<string> {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.width.toString(),
    screen.height.toString(),
    new Date().getTimezoneOffset().toString(),
    navigator.hardwareConcurrency?.toString() || '0',
  ];
  return components.join('|');
}

async function deriveKey(fingerprint: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(fingerprint),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function encryptData(plaintext: string): Promise<string> {
  try {
    const fingerprint = await getDeviceFingerprint();
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(fingerprint, salt);

    const encoder = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encoder.encode(plaintext)
    );

    const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, SALT_LENGTH);
    combined.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH);

    return arrayBufferToBase64(combined.buffer);
  } catch (error) {
    console.error('[crypto] Encryption failed:', error);
    throw new Error('Failed to encrypt data');
  }
}

export async function decryptData(ciphertext: string): Promise<string> {
  try {
    const fingerprint = await getDeviceFingerprint();
    const combined = new Uint8Array(base64ToArrayBuffer(ciphertext));

    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH);

    const key = await deriveKey(fingerprint, salt);

    const decrypted = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encrypted
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  } catch (error) {
    console.error('[crypto] Decryption failed:', error);
    throw new Error('Failed to decrypt data');
  }
}

export function isEncrypted(data: string): boolean {
  try {
    const decoded = atob(data);
    return decoded.length >= SALT_LENGTH + IV_LENGTH + 1;
  } catch {
    return false;
  }
}

export async function secureStore(key: string, value: string): Promise<void> {
  const encrypted = await encryptData(value);
  localStorage.setItem(key, encrypted);
}

export async function secureRetrieve(key: string): Promise<string | null> {
  const stored = localStorage.getItem(key);
  if (!stored) return null;

  if (isEncrypted(stored)) {
    try {
      return await decryptData(stored);
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  return stored;
}
