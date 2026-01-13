/**
 * Re-export encryption hook from context.
 *
 * All encryption state is shared via EncryptionContext.
 * Components using useEncryption() will see the same state.
 */

'use client';

export {
  useEncryptionContext as useEncryption,
  EncryptionProvider,
  type EncryptionState,
  type TransportKeypair,
  type EncryptionContextValue as UseEncryptionReturn,
} from '@/contexts/EncryptionContext';
