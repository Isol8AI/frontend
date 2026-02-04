/**
 * Hook for fetching organization encryption status for the current user.
 *
 * Combines data from:
 * - /organizations/{orgId}/encryption-status (org has encryption?)
 * - /organizations/{orgId}/membership (user has key?)
 *
 * Used by ChatWindow to determine which org encryption UI to show.
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import type { SerializedEncryptedPayload } from '@/lib/crypto/message-crypto';

export interface OrgEncryptionStatus {
  /** Whether we're loading the status */
  isLoading: boolean;
  /** Whether the org has encryption keys set up */
  orgHasEncryption: boolean;
  /** Whether the current user has a distributed org key */
  userHasOrgKey: boolean;
  /** The user's encrypted org key (if distributed) */
  encryptedOrgKey: SerializedEncryptedPayload | null;
  /** Error message if fetch failed */
  error: string | null;
  /** Refetch the status */
  refetch: () => Promise<void>;
}

export function useOrgEncryptionStatus(orgId: string | null): OrgEncryptionStatus {
  const { getToken } = useAuth();
  const [status, setStatus] = useState<Omit<OrgEncryptionStatus, 'refetch'>>({
    isLoading: !!orgId, // Start loading if we have an orgId
    orgHasEncryption: false,
    userHasOrgKey: false,
    encryptedOrgKey: null,
    error: null,
  });

  const fetchStatus = useCallback(async () => {
    if (!orgId) {
      setStatus({
        isLoading: false,
        orgHasEncryption: false,
        userHasOrgKey: false,
        encryptedOrgKey: null,
        error: null,
      });
      return;
    }

    setStatus((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Fetch both status and membership in parallel
      const [encryptionRes, membershipRes] = await Promise.all([
        fetch(`${BACKEND_URL}/organizations/${orgId}/encryption-status`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BACKEND_URL}/organizations/${orgId}/membership`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!encryptionRes.ok) {
        throw new Error('Failed to fetch org encryption status');
      }

      // Membership might 404 if user isn't a member yet
      const encryptionData = await encryptionRes.json();

      let membershipData = null;
      if (membershipRes.ok) {
        membershipData = await membershipRes.json();
      }

      setStatus({
        isLoading: false,
        orgHasEncryption: encryptionData.has_encryption_keys ?? encryptionData.has_encryption ?? false,
        userHasOrgKey: membershipData?.has_org_key ?? false,
        encryptedOrgKey: membershipData?.encrypted_org_key ?? null,
        error: null,
      });
    } catch (error) {
      console.error('Failed to fetch org encryption status:', error);
      setStatus((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to fetch org encryption status',
      }));
    }
  }, [orgId, getToken]);

  // Fetch on mount and when orgId changes
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  return {
    ...status,
    refetch: fetchStatus,
  };
}
