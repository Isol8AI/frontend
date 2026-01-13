/**
 * Hook for organization admin operations including key distribution.
 *
 * This hook provides:
 * - Loading pending members who need key distribution
 * - Distributing org key to individual members
 * - Batch distribution to all pending members
 * - Member list management
 * - Key revocation
 *
 * Security Model:
 * - Admin decrypts their copy of org key client-side
 * - Re-encrypts to each member's public key
 * - Server never sees plaintext org key
 */

'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { useEncryption } from './useEncryption';
import {
  distributeOrgKeyToMember,
  distributeOrgKeyToMembers,
} from '@/lib/crypto/org-crypto';
import type { SerializedEncryptedPayload } from '@/lib/crypto/message-crypto';

// =============================================================================
// Types
// =============================================================================

export interface PendingMember {
  /** Membership record ID */
  membershipId: string;
  /** User ID */
  userId: string;
  /** User's public key for encryption */
  userPublicKey: string;
  /** User's role in the org */
  role: string;
  /** When user joined the org */
  joinedAt: Date;
}

export interface OrgMember {
  /** Membership record ID */
  membershipId: string;
  /** User ID */
  userId: string;
  /** User's role (admin or member) */
  role: string;
  /** Whether user has personal encryption keys */
  hasPersonalKeys: boolean;
  /** Whether user has received org key */
  hasOrgKey: boolean;
  /** When the key was distributed */
  keyDistributedAt?: Date;
  /** When user joined */
  joinedAt?: Date;
}

export interface DistributionProgress {
  current: number;
  total: number;
}

export interface UseOrgAdminReturn {
  /** Members pending key distribution */
  pendingMembers: PendingMember[];
  /** Load pending members for an org */
  loadPendingMembers: (orgId: string) => Promise<void>;

  /** Distribute key to a single member */
  distributeToMember: (
    orgId: string,
    membershipId: string,
    memberPublicKey: string
  ) => Promise<void>;
  /** Distribute key to all pending members */
  distributeToAll: (orgId: string) => Promise<void>;

  /** All org members */
  members: OrgMember[];
  /** Load all members */
  loadMembers: (orgId: string) => Promise<void>;
  /** Revoke a member's org key */
  revokeMemberKey: (orgId: string, userId: string, reason?: string) => Promise<void>;

  /** Admin's encrypted org key */
  adminOrgKey: SerializedEncryptedPayload | null;
  /** Load admin's org key */
  loadAdminOrgKey: (orgId: string) => Promise<void>;

  /** Loading state */
  isLoading: boolean;
  /** Current error */
  error: string | null;
  /** Distribution progress for batch operations */
  distributionProgress: DistributionProgress | null;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useOrgAdmin(): UseOrgAdminReturn {
  const { getToken } = useAuth();
  const encryption = useEncryption();

  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [adminOrgKey, setAdminOrgKey] = useState<SerializedEncryptedPayload | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [distributionProgress, setDistributionProgress] = useState<DistributionProgress | null>(null);

  /**
   * Load pending members needing key distribution.
   */
  const loadPendingMembers = useCallback(
    async (orgId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetch(
          `${BACKEND_URL}/organizations/${orgId}/pending-distributions`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to load pending members');
        }

        const data = await res.json();
        setPendingMembers(
          data.pending.map((p: {
            membership_id: string;
            user_id: string;
            user_public_key: string;
            role: string;
            joined_at: string;
          }) => ({
            membershipId: p.membership_id,
            userId: p.user_id,
            userPublicKey: p.user_public_key,
            role: p.role,
            joinedAt: new Date(p.joined_at),
          }))
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error loading pending members';
        setError(message);
        console.error('Failed to load pending members:', e);
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  /**
   * Load admin's encrypted org key from their membership.
   */
  const loadAdminOrgKey = useCallback(
    async (orgId: string): Promise<void> => {
      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetch(
          `${BACKEND_URL}/organizations/${orgId}/my-membership`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );

        if (!res.ok) {
          throw new Error('Failed to load admin org key');
        }

        const data = await res.json();
        if (data.encrypted_org_key) {
          setAdminOrgKey(data.encrypted_org_key);
        }
      } catch (e) {
        console.error('Failed to load admin org key:', e);
        throw e;
      }
    },
    [getToken]
  );

  /**
   * Distribute org key to a single member.
   */
  const distributeToMember = useCallback(
    async (
      orgId: string,
      membershipId: string,
      memberPublicKey: string
    ): Promise<void> => {
      if (!encryption.state.isUnlocked) {
        throw new Error('Personal keys must be unlocked first');
      }

      // Ensure we have admin's org key
      let orgKey = adminOrgKey;
      if (!orgKey) {
        await loadAdminOrgKey(orgId);
        orgKey = adminOrgKey;
        if (!orgKey) {
          throw new Error('Admin org key not available');
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        // Get admin's private key
        const adminPrivateKey = encryption.getPrivateKey();
        if (!adminPrivateKey) {
          throw new Error('Private key not available');
        }

        // Perform client-side key distribution
        const memberEncryptedKey = distributeOrgKeyToMember(
          adminPrivateKey,
          orgKey,
          memberPublicKey
        );

        // Send to server
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetch(
          `${BACKEND_URL}/organizations/${orgId}/distribute-key`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              membership_id: membershipId,
              encrypted_org_key: memberEncryptedKey,
            }),
          }
        );

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to distribute key');
        }

        // Remove from pending list
        setPendingMembers((prev) =>
          prev.filter((m) => m.membershipId !== membershipId)
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error distributing key';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [encryption, adminOrgKey, loadAdminOrgKey, getToken]
  );

  /**
   * Distribute org key to all pending members.
   */
  const distributeToAll = useCallback(
    async (orgId: string): Promise<void> => {
      if (pendingMembers.length === 0) {
        return;
      }

      if (!encryption.state.isUnlocked) {
        throw new Error('Personal keys must be unlocked first');
      }

      // Ensure we have admin's org key
      let orgKey = adminOrgKey;
      if (!orgKey) {
        await loadAdminOrgKey(orgId);
        orgKey = adminOrgKey;
        if (!orgKey) {
          throw new Error('Admin org key not available');
        }
      }

      setIsLoading(true);
      setError(null);
      setDistributionProgress({ current: 0, total: pendingMembers.length });

      try {
        const adminPrivateKey = encryption.getPrivateKey();
        if (!adminPrivateKey) {
          throw new Error('Private key not available');
        }

        // Batch encrypt all keys client-side
        const distributions = distributeOrgKeyToMembers(
          adminPrivateKey,
          orgKey,
          pendingMembers.map((m) => ({
            membershipId: m.membershipId,
            publicKey: m.userPublicKey,
          }))
        );

        // Send to server one by one
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        for (let i = 0; i < distributions.length; i++) {
          const { membershipId, encryptedOrgKey } = distributions[i];

          const res = await fetch(
            `${BACKEND_URL}/organizations/${orgId}/distribute-key`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                membership_id: membershipId,
                encrypted_org_key: encryptedOrgKey,
              }),
            }
          );

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(
              errorData.detail || `Failed to distribute key to member ${i + 1}`
            );
          }

          setDistributionProgress({ current: i + 1, total: distributions.length });
        }

        // Clear pending list
        setPendingMembers([]);
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error in batch distribution';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
        setDistributionProgress(null);
      }
    },
    [encryption, adminOrgKey, pendingMembers, loadAdminOrgKey, getToken]
  );

  /**
   * Load all org members.
   */
  const loadMembers = useCallback(
    async (orgId: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetch(`${BACKEND_URL}/organizations/${orgId}/members`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to load members');
        }

        const data = await res.json();
        setMembers(
          data.members.map((m: {
            membership_id: string;
            user_id: string;
            role: string;
            has_personal_keys: boolean;
            has_org_key: boolean;
            key_distributed_at?: string;
            joined_at?: string;
          }) => ({
            membershipId: m.membership_id,
            userId: m.user_id,
            role: m.role,
            hasPersonalKeys: m.has_personal_keys,
            hasOrgKey: m.has_org_key,
            keyDistributedAt: m.key_distributed_at
              ? new Date(m.key_distributed_at)
              : undefined,
            joinedAt: m.joined_at ? new Date(m.joined_at) : undefined,
          }))
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error loading members';
        setError(message);
        console.error('Failed to load members:', e);
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  /**
   * Revoke a member's org key.
   */
  const revokeMemberKey = useCallback(
    async (orgId: string, userId: string, reason?: string): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const res = await fetch(
          `${BACKEND_URL}/organizations/${orgId}/revoke-key/${userId}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reason }),
          }
        );

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to revoke key');
        }

        // Update local state
        setMembers((prev) =>
          prev.map((m) =>
            m.userId === userId ? { ...m, hasOrgKey: false } : m
          )
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Error revoking key';
        setError(message);
        throw e;
      } finally {
        setIsLoading(false);
      }
    },
    [getToken]
  );

  return {
    pendingMembers,
    loadPendingMembers,
    distributeToMember,
    distributeToAll,
    members,
    loadMembers,
    revokeMemberKey,
    adminOrgKey,
    loadAdminOrgKey,
    isLoading,
    error,
    distributionProgress,
  };
}
