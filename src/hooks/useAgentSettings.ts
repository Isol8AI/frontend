/**
 * Hook for reading and writing agent settings (encrypted tarball files).
 *
 * Supports both zero_trust and background encryption modes:
 *
 * Zero-trust mode:
 *   - Client fetches encrypted state from backend
 *   - Decrypts with user's private key (agent-state-storage context)
 *   - Decompresses gzip'd tarball
 *   - Extracts files via tar utilities
 *   - On save: re-packs tar, compresses, encrypts to user's public key, PUTs back
 *
 * Background mode:
 *   - Backend decrypts state via KMS in enclave
 *   - Client requests extracted files via transport encryption
 *   - On save: encrypts each file to enclave transport key, POSTs for server-side packing
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";
import { useEncryption } from "./useEncryption";

// =============================================================================
// Types
// =============================================================================

export interface AgentFile {
  path: string;
  content: string;
  originalContent: string;
  size: number;
}

interface UseAgentSettingsReturn {
  files: AgentFile[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  isDirty: boolean;
  selectedPath: string | null;
  selectFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  loadFiles: (agentName: string) => Promise<void>;
  save: (agentName: string) => Promise<void>;
  reset: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAgentSettings(): UseAgentSettingsReturn {
  const { getToken } = useAuth();
  const encryption = useEncryption();

  const [files, setFiles] = useState<AgentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Track encryption mode from load for use during save
  const encryptionModeRef = useRef<string | null>(null);

  const isDirty = files.some((f) => f.content !== f.originalContent);

  const selectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, content, size: new TextEncoder().encode(content).length }
          : f,
      ),
    );
  }, []);

  // =============================================================================
  // loadFiles
  // =============================================================================

  const loadFiles = useCallback(
    async (agentName: string): Promise<void> => {
      if (!encryption.state.isUnlocked) {
        setError("Encryption keys not unlocked");
        return;
      }

      setLoading(true);
      setError(null);
      setFiles([]);
      setSelectedPath(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Not authenticated");
        }

        const stateResponse = await fetch(
          `${BACKEND_URL}/agents/${agentName}/state`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        );

        if (!stateResponse.ok) {
          const errorData = await stateResponse.json().catch(() => ({}));
          throw new Error(
            errorData.detail ||
              `Failed to fetch agent state (${stateResponse.status})`,
          );
        }

        const data = await stateResponse.json();
        encryptionModeRef.current = data.encryption_mode;

        let agentFiles: AgentFile[];

        if (data.encryption_mode === "zero_trust") {
          agentFiles = await loadZeroTrustFiles(data.encrypted_state);
        } else {
          agentFiles = await loadBackgroundFiles(agentName, token);
        }

        setFiles(agentFiles);

        // Auto-select SOUL.md if present, otherwise first file
        const soulFile = agentFiles.find((f) => f.path.endsWith("SOUL.md"));
        if (soulFile) {
          setSelectedPath(soulFile.path);
        } else if (agentFiles.length > 0) {
          setSelectedPath(agentFiles[0].path);
        }
      } catch (err) {
        console.error("[AgentSettings] Failed to load files:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load agent files",
        );
      } finally {
        setLoading(false);
      }
    },
    [encryption, getToken],
  );

  // =============================================================================
  // loadZeroTrustFiles
  // =============================================================================

  async function loadZeroTrustFiles(
    encryptedState: Record<string, string>,
  ): Promise<AgentFile[]> {
    const { decryptWithPrivateKey, hexToBytes } = await import(
      "@/lib/crypto/primitives"
    );

    const privateKeyHex = encryption.getPrivateKey()!;
    const privateKeyBytes = hexToBytes(privateKeyHex);

    const statePayload = {
      ephemeralPublicKey: hexToBytes(encryptedState.ephemeral_public_key),
      iv: hexToBytes(encryptedState.iv),
      ciphertext: hexToBytes(encryptedState.ciphertext),
      authTag: hexToBytes(encryptedState.auth_tag),
      hkdfSalt: hexToBytes(encryptedState.hkdf_salt),
    };

    const gzippedBytes = decryptWithPrivateKey(
      privateKeyBytes,
      statePayload,
      "agent-state-storage",
    );

    const { inflate } = await import("pako");
    const tarBytes = inflate(gzippedBytes);

    const { extractTar } = await import("@/lib/tar");
    const tarEntries = extractTar(tarBytes);

    const decoder = new TextDecoder();
    return tarEntries.map((entry) => {
      const content = decoder.decode(entry.content);
      return {
        path: entry.path,
        content,
        originalContent: content,
        size: entry.content.length,
      };
    });
  }

  // =============================================================================
  // loadBackgroundFiles
  // =============================================================================

  async function loadBackgroundFiles(
    agentName: string,
    token: string,
  ): Promise<AgentFile[]> {
    const transportKeypair = encryption.generateTransportKeypair();

    const response = await fetch(
      `${BACKEND_URL}/agents/${agentName}/files/extract`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ephemeral_public_key: transportKeypair.publicKey,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Failed to extract files (${response.status})`,
      );
    }

    const { encrypted_files } = await response.json();

    const decryptedJson = encryption.decryptTransportResponse(encrypted_files);
    const fileList = JSON.parse(decryptedJson) as Array<{
      path: string;
      content: string;
    }>;

    return fileList.map((f) => ({
      path: f.path,
      content: f.content,
      originalContent: f.content,
      size: new TextEncoder().encode(f.content).length,
    }));
  }

  // =============================================================================
  // save
  // =============================================================================

  const save = useCallback(
    async (agentName: string): Promise<void> => {
      if (!encryption.state.isUnlocked) {
        setError("Encryption keys not unlocked");
        return;
      }

      setSaving(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Not authenticated");
        }

        const mode = encryptionModeRef.current;

        if (mode === "zero_trust") {
          await saveZeroTrust(agentName, token);
        } else {
          await saveBackground(agentName, token);
        }

        // Mark all files as clean after successful save
        setFiles((prev) =>
          prev.map((f) => ({
            ...f,
            originalContent: f.content,
          })),
        );
      } catch (err) {
        console.error("[AgentSettings] Failed to save files:", err);
        setError(
          err instanceof Error ? err.message : "Failed to save agent files",
        );
      } finally {
        setSaving(false);
      }
    },
    [encryption, getToken, files],
  );

  // =============================================================================
  // saveZeroTrust
  // =============================================================================

  async function saveZeroTrust(
    agentName: string,
    token: string,
  ): Promise<void> {
    const { encryptToPublicKey, hexToBytes, bytesToHex } = await import(
      "@/lib/crypto/primitives"
    );

    const encoder = new TextEncoder();

    const { createTar } = await import("@/lib/tar");
    const tarEntries = files.map((f) => ({
      path: f.path,
      content: encoder.encode(f.content),
    }));

    const tarBytes = createTar(tarEntries);

    const { deflate } = await import("pako");
    const gzipped = deflate(tarBytes);

    const userPublicKey = hexToBytes(encryption.state.publicKey!);
    const encryptedPayload = encryptToPublicKey(
      userPublicKey,
      gzipped,
      "agent-state-storage",
    );

    const encryptedState = {
      ephemeral_public_key: bytesToHex(encryptedPayload.ephemeralPublicKey),
      iv: bytesToHex(encryptedPayload.iv),
      ciphertext: bytesToHex(encryptedPayload.ciphertext),
      auth_tag: bytesToHex(encryptedPayload.authTag),
      hkdf_salt: bytesToHex(encryptedPayload.hkdfSalt),
    };

    const response = await fetch(
      `${BACKEND_URL}/agents/${agentName}/state`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          encrypted_state: encryptedState,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail ||
          `Failed to save agent state (${response.status})`,
      );
    }
  }

  // =============================================================================
  // saveBackground
  // =============================================================================

  async function saveBackground(
    agentName: string,
    token: string,
  ): Promise<void> {
    const { encryptToPublicKey, hexToBytes, bytesToHex } = await import(
      "@/lib/crypto/primitives"
    );

    const encoder = new TextEncoder();
    const enclavePublicKey = hexToBytes(encryption.state.enclavePublicKey!);

    const encryptedFiles = files.map((f) => {
      const contentBytes = encoder.encode(f.content);
      const encrypted = encryptToPublicKey(
        enclavePublicKey,
        contentBytes,
        "client-to-enclave-transport",
      );

      return {
        path: f.path,
        encrypted_content: {
          ephemeral_public_key: bytesToHex(encrypted.ephemeralPublicKey),
          iv: bytesToHex(encrypted.iv),
          ciphertext: bytesToHex(encrypted.ciphertext),
          auth_tag: bytesToHex(encrypted.authTag),
          hkdf_salt: bytesToHex(encrypted.hkdfSalt),
        },
      };
    });

    const response = await fetch(
      `${BACKEND_URL}/agents/${agentName}/files/pack`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          files: encryptedFiles,
        }),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Failed to save agent files (${response.status})`,
      );
    }
  }

  // =============================================================================
  // reset
  // =============================================================================

  const reset = useCallback(() => {
    setFiles([]);
    setSelectedPath(null);
    setError(null);
    encryptionModeRef.current = null;
  }, []);

  return {
    files,
    loading,
    saving,
    error,
    isDirty,
    selectedPath,
    selectFile,
    updateFileContent,
    loadFiles,
    save,
    reset,
  };
}
