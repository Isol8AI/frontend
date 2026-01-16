/**
 * Encryption Context Provider.
 *
 * Provides shared encryption state across all components.
 * This ensures that when encryption is set up or keys are unlocked,
 * all components see the same state.
 *
 * Security Model:
 * - Private keys only exist in memory when unlocked
 * - Keys are automatically cleared on unmount
 * - No plaintext keys are ever stored or transmitted
 */

'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import {
  generateAndEncryptKeys,
  decryptPrivateKeyFromResponse,
  toStoreKeysRequest,
  type FetchKeysResponse,
} from '@/lib/crypto/key-management';
import {
  encryptMessageToEnclave,
  decryptMessageFromEnclave,
  decryptStoredMessage,
  reEncryptHistoryForTransport,
  decryptOrgKey,
  type SerializedEncryptedPayload,
  type EncryptedMessage,
} from '@/lib/crypto/message-crypto';
import {
  generateX25519Keypair,
  bytesToHex,
  hexToBytes,
  generateSalt,
  deriveKeyFromPasscode,
  encryptAesGcm,
  encryptToPublicKey,
} from '@/lib/crypto';

// =============================================================================
// Types
// =============================================================================

export interface EncryptionState {
  /** Whether user has encryption keys set up */
  isSetup: boolean;
  /** Whether keys are currently unlocked (private key in memory) */
  isUnlocked: boolean;
  /** User's public key (available even when locked) */
  publicKey: string | null;
  /** Enclave's transport public key */
  enclavePublicKey: string | null;
  /** Whether we're currently loading encryption status */
  isLoading: boolean;
  /** Current error message if any */
  error: string | null;
}

export interface TransportKeypair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptionContextValue {
  /** Current encryption state */
  state: EncryptionState;
  /** Set up encryption with a new passcode (does NOT set isSetup until confirmSetup is called) */
  setupEncryption: (passcode: string) => Promise<{ recoveryCode: string }>;
  /** Confirm setup completion after recovery code is saved */
  confirmSetup: () => void;
  /** Unlock keys with passcode */
  unlockKeys: (passcode: string) => Promise<void>;
  /** Unlock keys with recovery code */
  unlockWithRecovery: (recoveryCode: string) => Promise<void>;
  /** Lock keys (clear from memory) */
  lockKeys: () => void;
  /** Set up organization encryption (admin only) */
  setupOrgEncryption: (orgId: string, passcode: string) => Promise<void>;
  /** Unlock organization key */
  unlockOrgKey: (encryptedOrgKey: SerializedEncryptedPayload) => void;
  /** Lock organization key */
  lockOrgKey: () => void;
  /** Whether org key is currently unlocked */
  isOrgUnlocked: boolean;
  /** Encrypt a message for transport to enclave */
  encryptMessage: (message: string) => SerializedEncryptedPayload;
  /** Decrypt a transport response from enclave */
  decryptTransportResponse: (payload: SerializedEncryptedPayload) => string;
  /** Decrypt stored messages from database. useOrgKey determines which key to use. */
  decryptStoredMessages: (messages: EncryptedMessage[], useOrgKey: boolean) => string[];
  /** Re-encrypt history for transport to enclave. useOrgKey determines which key to use. */
  prepareHistoryForTransport: (
    messages: EncryptedMessage[],
    useOrgKey: boolean
  ) => SerializedEncryptedPayload[];
  /** Generate ephemeral transport keypair */
  generateTransportKeypair: () => TransportKeypair;
  /** Set transport private key for decryption */
  setTransportPrivateKey: (privateKey: string) => void;
  /** Refresh encryption status from server */
  refreshStatus: () => Promise<void>;
  /** Get private key for admin operations (key distribution) */
  getPrivateKey: () => string | null;
  /** Get org private key for admin operations */
  getOrgPrivateKey: () => string | null;
}

// =============================================================================
// Context
// =============================================================================

const EncryptionContext = createContext<EncryptionContextValue | null>(null);

// =============================================================================
// Provider
// =============================================================================

interface EncryptionProviderProps {
  children: React.ReactNode;
}

export function EncryptionProvider({ children }: EncryptionProviderProps) {
  const { getToken, userId, isLoaded: authLoaded } = useAuth();

  // Encryption state
  const [state, setState] = useState<EncryptionState>({
    isSetup: false,
    isUnlocked: false,
    publicKey: null,
    enclavePublicKey: null,
    isLoading: true,
    error: null,
  });

  // Private keys in memory (never persisted)
  const privateKeyRef = useRef<string | null>(null);
  const orgPrivateKeyRef = useRef<string | null>(null);
  const transportPrivateKeyRef = useRef<string | null>(null);

  // Track org unlocked state
  const [isOrgUnlocked, setIsOrgUnlocked] = useState(false);

  // Track pending setup (after keys created but before recovery code confirmed)
  const [pendingSetup, setPendingSetup] = useState(false);

  // Clear keys on unmount (security measure)
  useEffect(() => {
    return () => {
      privateKeyRef.current = null;
      orgPrivateKeyRef.current = null;
      transportPrivateKeyRef.current = null;
    };
  }, []);

  // Fetch encryption status from server
  const refreshStatus = useCallback(async () => {
    console.log('=== refreshStatus START ===');
    console.log('authLoaded:', authLoaded, 'userId:', userId);

    // Don't fetch until auth is fully loaded
    if (!authLoaded) {
      console.log('Auth not loaded yet, keeping loading state');
      return;
    }

    // If auth is loaded but no user, they're not signed in
    if (!userId) {
      console.log('No userId (not signed in), clearing loading state');
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getToken();
      console.log('Auth token obtained:', token ? 'yes' : 'no');
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Fetch enclave info and user encryption status in parallel
      console.log('Fetching enclave info and encryption status...');
      const [enclaveRes, statusRes] = await Promise.all([
        fetch(`${BACKEND_URL}/chat/enclave/info`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BACKEND_URL}/users/me/encryption-status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      console.log('Enclave response:', enclaveRes.status, enclaveRes.statusText);
      console.log('Status response:', statusRes.status, statusRes.statusText);

      if (!enclaveRes.ok) {
        throw new Error('Failed to fetch enclave info');
      }
      if (!statusRes.ok) {
        throw new Error('Failed to fetch encryption status');
      }

      const [enclaveData, statusData] = await Promise.all([
        enclaveRes.json(),
        statusRes.json(),
      ]);

      console.log('Enclave public key:', enclaveData.enclave_public_key?.substring(0, 20) + '...');
      console.log('User has encryption keys:', statusData.has_encryption_keys);
      console.log('User public key:', statusData.public_key?.substring(0, 20) + '...' || 'none');

      setState((prev) => ({
        ...prev,
        isSetup: statusData.has_encryption_keys,
        publicKey: statusData.public_key || null,
        enclavePublicKey: enclaveData.enclave_public_key,
        isLoading: false,
      }));
      console.log('=== refreshStatus SUCCESS ===');
    } catch (error) {
      console.error('=== refreshStatus FAILED ===');
      console.error('Error:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load encryption status',
      }));
    }
  }, [authLoaded, userId, getToken]);

  // Load status on mount and when user changes
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  // Set up encryption with new passcode
  const setupEncryption = useCallback(
    async (passcode: string): Promise<{ recoveryCode: string }> => {
      console.log('=== EncryptionContext.setupEncryption START ===');
      console.log('Passcode received:', passcode);
      // NOTE: We intentionally do NOT set isLoading: true here because
      // SetupEncryptionPrompt has its own loading state. Setting isLoading
      // in the context would cause ChatWindow to unmount SetupEncryptionPrompt.
      setState((prev) => ({ ...prev, error: null }));

      try {
        // Generate keys client-side
        console.log('Generating keys client-side...');
        const result = await generateAndEncryptKeys(passcode);
        console.log('Keys generated successfully');
        console.log('Public Key:', result.personal.publicKey.substring(0, 20) + '...');
        console.log('Recovery Code:', result.recoveryCode);

        // Store on server
        const token = await getToken();
        console.log('Auth token obtained:', token ? 'yes' : 'no');
        if (!token) {
          throw new Error('Not authenticated');
        }

        const requestBody = toStoreKeysRequest(result);
        console.log('=== API Request ===');
        console.log('URL:', `${BACKEND_URL}/users/me/keys`);
        console.log('Body:', JSON.stringify(requestBody, null, 2));

        const res = await fetch(`${BACKEND_URL}/users/me/keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(requestBody),
        });

        console.log('=== API Response ===');
        console.log('Status:', res.status, res.statusText);

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          console.error('Error response:', errorData);
          throw new Error(errorData.detail || 'Failed to store keys');
        }

        const responseData = await res.json();
        console.log('Response data:', responseData);

        // Store private key in memory (user is now unlocked)
        privateKeyRef.current = result.rawPrivateKey;
        console.log('Private key stored in memory');

        // Mark as pending setup - waiting for recovery code confirmation
        // Do NOT set isSetup: true yet - that happens in confirmSetup()
        console.log('Setting pendingSetup to true...');
        setPendingSetup(true);
        setState((prev) => ({
          ...prev,
          publicKey: result.personal.publicKey,
        }));
        console.log('State updated, returning recovery code');

        console.log('=== EncryptionContext.setupEncryption SUCCESS ===');
        return { recoveryCode: result.recoveryCode };
      } catch (error) {
        console.error('=== EncryptionContext.setupEncryption FAILED ===');
        console.error('Error:', error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : 'Failed to setup encryption',
        }));
        throw error;
      }
    },
    [getToken]
  );

  // Unlock keys with passcode
  const unlockKeys = useCallback(
    async (passcode: string): Promise<void> => {
      console.log('=== unlockKeys START ===');
      console.log('Passcode length:', passcode.length);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const token = await getToken();
        console.log('Auth token obtained:', token ? 'yes' : 'no');
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Fetch encrypted keys
        console.log('Fetching encrypted keys from /users/me/keys...');
        const res = await fetch(`${BACKEND_URL}/users/me/keys`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log('Response status:', res.status, res.statusText);
        if (!res.ok) {
          throw new Error('Failed to fetch keys');
        }

        const keys: FetchKeysResponse = await res.json();
        console.log('Keys fetched successfully');
        console.log('Public key:', keys.public_key?.substring(0, 20) + '...');

        // Decrypt private key
        console.log('Decrypting private key with passcode...');
        const privateKey = await decryptPrivateKeyFromResponse(passcode, keys);
        console.log('Private key decrypted successfully');

        // Store in memory (not state - security measure)
        privateKeyRef.current = privateKey;
        console.log('Private key stored in memory');

        setState((prev) => ({
          ...prev,
          isUnlocked: true,
          isLoading: false,
        }));
        console.log('=== unlockKeys SUCCESS ===');
      } catch (error) {
        console.error('=== unlockKeys FAILED ===');
        console.error('Error:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Incorrect passcode',
        }));
        throw error;
      }
    },
    [getToken]
  );

  // Unlock keys with recovery code
  const unlockWithRecovery = useCallback(
    async (recoveryCode: string): Promise<void> => {
      console.log('=== unlockWithRecovery START ===');
      const cleanCode = recoveryCode.replace(/-/g, '');
      console.log('Recovery code (cleaned):', cleanCode);
      console.log('Recovery code length:', cleanCode.length);
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const token = await getToken();
        console.log('Auth token obtained:', token ? 'yes' : 'no');
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Fetch recovery-encrypted keys (different endpoint than regular keys)
        console.log('Fetching recovery keys from /users/me/keys/recovery...');
        const res = await fetch(`${BACKEND_URL}/users/me/keys/recovery`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        console.log('Response status:', res.status, res.statusText);
        if (!res.ok) {
          throw new Error('Failed to fetch recovery keys');
        }

        const keys: FetchKeysResponse = await res.json();
        console.log('Recovery keys fetched successfully');
        console.log('Public key:', keys.public_key?.substring(0, 20) + '...');
        console.log('Has encrypted_private_key:', !!keys.encrypted_private_key);
        console.log('Has iv:', !!keys.iv);
        console.log('Has tag:', !!keys.tag);
        console.log('Has salt:', !!keys.salt);

        // Decrypt with recovery code
        // Note: The recovery endpoint returns the recovery-encrypted keys
        // in the standard fields (encrypted_private_key, iv, tag, salt)
        console.log('Decrypting private key with recovery code...');
        const privateKey = await decryptPrivateKeyFromResponse(
          cleanCode,
          keys
        );
        console.log('Private key decrypted successfully');

        // Store in memory
        privateKeyRef.current = privateKey;
        console.log('Private key stored in memory');

        setState((prev) => ({
          ...prev,
          isUnlocked: true,
          isLoading: false,
        }));
        console.log('=== unlockWithRecovery SUCCESS ===');
      } catch (error) {
        console.error('=== unlockWithRecovery FAILED ===');
        console.error('Error:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error
              ? error.message
              : 'Invalid recovery code',
        }));
        throw error;
      }
    },
    [getToken]
  );

  // Lock keys (clear from memory)
  const lockKeys = useCallback(() => {
    console.log('=== lockKeys called ===');
    privateKeyRef.current = null;
    orgPrivateKeyRef.current = null;
    transportPrivateKeyRef.current = null;
    setIsOrgUnlocked(false);
    setPendingSetup(false);
    setState((prev) => ({ ...prev, isUnlocked: false }));
  }, []);

  // Confirm setup completion after recovery code is saved
  const confirmSetup = useCallback(() => {
    console.log('=== confirmSetup called ===');
    console.log('pendingSetup:', pendingSetup);
    if (!pendingSetup) {
      console.log('No pending setup, returning early');
      return;
    }
    console.log('Confirming setup - setting isSetup: true, isUnlocked: true');
    setPendingSetup(false);
    setState((prev) => ({
      ...prev,
      isSetup: true,
      isUnlocked: true,
    }));
    console.log('=== confirmSetup SUCCESS ===');
  }, [pendingSetup]);

  // Set up organization encryption (admin only)
  const setupOrgEncryption = useCallback(
    async (orgId: string, passcode: string): Promise<void> => {
      console.log('=== setupOrgEncryption START ===');
      console.log('orgId:', orgId);

      // 1. Check personal keys are unlocked
      if (!privateKeyRef.current || !state.publicKey) {
        throw new Error('Personal encryption must be unlocked first');
      }

      if (passcode.length < 6) {
        throw new Error('Organization passcode must be at least 6 characters');
      }

      try {
        // 2. Generate org keypair
        console.log('Generating org keypair...');
        const orgKeypair = generateX25519Keypair();
        const orgPublicKey = bytesToHex(orgKeypair.publicKey);
        const orgPrivateKey = orgKeypair.privateKey;
        console.log('Org public key:', orgPublicKey.substring(0, 20) + '...');

        // 3. Encrypt org private key with org passcode (Argon2id + AES-GCM)
        console.log('Encrypting org private key with passcode...');
        const salt = generateSalt(32);
        const derivedKey = await deriveKeyFromPasscode(passcode, salt);
        const encrypted = encryptAesGcm(derivedKey, orgPrivateKey);

        // 4. Encrypt org private key TO admin's personal public key
        console.log('Encrypting org key to admin public key...');
        const adminPublicKey = hexToBytes(state.publicKey);
        const adminEncryptedOrgKey = encryptToPublicKey(
          adminPublicKey,
          orgPrivateKey,
          'org-key-distribution'
        );

        // 5. Call backend API
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        console.log('Calling backend API...');
        const res = await fetch(`${BACKEND_URL}/organizations/${orgId}/keys`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            org_public_key: orgPublicKey,
            admin_encrypted_private_key: bytesToHex(encrypted.ciphertext),
            admin_iv: bytesToHex(encrypted.iv),
            admin_tag: bytesToHex(encrypted.authTag),
            admin_salt: bytesToHex(salt),
            admin_member_encrypted_key: {
              ephemeral_public_key: bytesToHex(adminEncryptedOrgKey.ephemeralPublicKey),
              iv: bytesToHex(adminEncryptedOrgKey.iv),
              ciphertext: bytesToHex(adminEncryptedOrgKey.ciphertext),
              auth_tag: bytesToHex(adminEncryptedOrgKey.authTag),
              hkdf_salt: bytesToHex(adminEncryptedOrgKey.hkdfSalt),
            },
          }),
        });

        console.log('API response status:', res.status);

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.detail || 'Failed to create org encryption keys');
        }

        // 6. Store org private key in memory
        console.log('Storing org private key in memory...');
        orgPrivateKeyRef.current = bytesToHex(orgPrivateKey);
        setIsOrgUnlocked(true);

        console.log('=== setupOrgEncryption SUCCESS ===');
      } catch (error) {
        console.error('=== setupOrgEncryption FAILED ===');
        console.error('Error:', error);
        throw error;
      }
    },
    [getToken, state.publicKey]
  );

  // Unlock organization key
  const unlockOrgKey = useCallback(
    (encryptedOrgKey: SerializedEncryptedPayload) => {
      if (!privateKeyRef.current) {
        throw new Error('Personal keys must be unlocked first');
      }

      const orgKey = decryptOrgKey(privateKeyRef.current, encryptedOrgKey);
      orgPrivateKeyRef.current = orgKey;
      setIsOrgUnlocked(true);
    },
    []
  );

  // Lock organization key
  const lockOrgKey = useCallback(() => {
    orgPrivateKeyRef.current = null;
    setIsOrgUnlocked(false);
  }, []);

  // Encrypt message for transport to enclave
  const encryptMessage = useCallback(
    (message: string): SerializedEncryptedPayload => {
      if (!state.enclavePublicKey) {
        throw new Error('Enclave public key not available');
      }
      return encryptMessageToEnclave(state.enclavePublicKey, message);
    },
    [state.enclavePublicKey]
  );

  // Decrypt transport response from enclave
  const decryptTransportResponse = useCallback(
    (payload: SerializedEncryptedPayload): string => {
      if (!transportPrivateKeyRef.current) {
        throw new Error('Transport private key not set');
      }
      return decryptMessageFromEnclave(transportPrivateKeyRef.current, payload);
    },
    []
  );

  // Decrypt stored messages
  const decryptStoredMessagesWrapper = useCallback(
    (messages: EncryptedMessage[], useOrgKey: boolean): string[] => {
      // Select key based on explicit context
      const key = useOrgKey ? orgPrivateKeyRef.current : privateKeyRef.current;
      if (!key) {
        throw new Error(useOrgKey ? 'Org keys not unlocked' : 'Personal keys not unlocked');
      }

      return messages.map((msg) =>
        decryptStoredMessage(key, msg.encrypted_content, msg.role)
      );
    },
    []
  );

  // Re-encrypt history for transport
  const prepareHistoryForTransport = useCallback(
    (messages: EncryptedMessage[], useOrgKey: boolean): SerializedEncryptedPayload[] => {
      // Select key based on explicit context
      const key = useOrgKey ? orgPrivateKeyRef.current : privateKeyRef.current;
      if (!key) {
        throw new Error(useOrgKey ? 'Org keys not unlocked' : 'Personal keys not unlocked');
      }
      if (!state.enclavePublicKey) {
        throw new Error('Enclave public key not available');
      }

      return reEncryptHistoryForTransport(
        key,
        state.enclavePublicKey,
        messages
      );
    },
    [state.enclavePublicKey]
  );

  // Generate ephemeral transport keypair
  const generateTransportKeypair = useCallback((): TransportKeypair => {
    const keypair = generateX25519Keypair();
    const publicKey = bytesToHex(keypair.publicKey);
    const privateKey = bytesToHex(keypair.privateKey);

    // Store private key for later decryption
    transportPrivateKeyRef.current = privateKey;

    return { publicKey, privateKey };
  }, []);

  // Set transport private key directly
  const setTransportPrivateKey = useCallback((privateKey: string) => {
    transportPrivateKeyRef.current = privateKey;
  }, []);

  // Get private key for admin operations (key distribution)
  // WARNING: Only use for key distribution, never log or transmit
  const getPrivateKey = useCallback((): string | null => {
    return privateKeyRef.current;
  }, []);

  // Get org private key for admin operations
  const getOrgPrivateKey = useCallback((): string | null => {
    return orgPrivateKeyRef.current;
  }, []);

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo<EncryptionContextValue>(
    () => ({
      state,
      setupEncryption,
      confirmSetup,
      unlockKeys,
      unlockWithRecovery,
      lockKeys,
      setupOrgEncryption,
      unlockOrgKey,
      lockOrgKey,
      isOrgUnlocked,
      encryptMessage,
      decryptTransportResponse,
      decryptStoredMessages: decryptStoredMessagesWrapper,
      prepareHistoryForTransport,
      generateTransportKeypair,
      setTransportPrivateKey,
      refreshStatus,
      getPrivateKey,
      getOrgPrivateKey,
    }),
    [
      state,
      setupEncryption,
      confirmSetup,
      unlockKeys,
      unlockWithRecovery,
      lockKeys,
      setupOrgEncryption,
      unlockOrgKey,
      lockOrgKey,
      isOrgUnlocked,
      encryptMessage,
      decryptTransportResponse,
      decryptStoredMessagesWrapper,
      prepareHistoryForTransport,
      generateTransportKeypair,
      setTransportPrivateKey,
      refreshStatus,
      getPrivateKey,
      getOrgPrivateKey,
    ]
  );

  return (
    <EncryptionContext.Provider value={value}>
      {children}
    </EncryptionContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access encryption functionality.
 * Must be used within an EncryptionProvider.
 */
export function useEncryptionContext(): EncryptionContextValue {
  const context = useContext(EncryptionContext);
  if (!context) {
    throw new Error('useEncryptionContext must be used within an EncryptionProvider');
  }
  return context;
}
