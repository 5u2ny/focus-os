import { safeStorage } from 'electron';

export const secureStore = {
  isAvailable(): boolean {
    return safeStorage.isEncryptionAvailable();
  },

  encrypt(plain: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: base64 obfuscation (NOT secure — no keychain available)
      console.warn('[secureStore] safeStorage unavailable — using base64 fallback');
      return Buffer.from(plain).toString('base64');
    }
    return safeStorage.encryptString(plain).toString('base64');
  },

  decrypt(encrypted: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
      return Buffer.from(encrypted, 'base64').toString('utf-8');
    }
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  },
};
