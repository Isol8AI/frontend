/**
 * Organization session hook for managing org context and encryption.
 *
 * This hook provides:
 * - Fetching user's organization memberships
 * - Switching between personal/org context
 * - Unlocking org encryption keys
 * - Tracking org encryption status
 *
 * Flow:
 * 1. Fetch memberships on mount
 * 2. User selects an org (or stays in personal mode)
 * 3. If org has encryption, unlock org key using personal key
 * 4. Chat operations then use org key for encryption
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth, useOrganization, useOrganizationList } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { useEncryption } from './useEncryption';
import type { SerializedEncryptedPayload } from '@/lib/crypto/message-crypto';

// =============================================================================
// Types
// =============================================================================

export interface OrgMembership {
  /** Membership ID */
  id: string;
  /** Organization ID */
  org_id: string;
  /** Organization name */
  org_name: string | null;
  /** User's role in the org */
  role: string;
  /** Whether user has the org encryption key */
  has_org_key: boolean;
  /** When the key was distributed */
  key_distributed_at: string | null;
  /** When user joined the org */
  joined_at: string | null;
  /** Encrypted org key (only included in detailed fetch) */
  encrypted_org_key?: SerializedEncryptedPayload;
}

export interface OrgEncryptionStatus {
  /** Whether org has encryption set up */
  has_encryption_keys: boolean;
  /** Org's public key */
  org_public_key: string | null;
}

export interface OrgSessionState {
  /** Currently selected org ID (null = personal mode) */
  currentOrgId: string | null;
  /** Current org name */
  currentOrgName: string | null;
  /** Whether user is an admin in current org */
  isAdmin: boolean;
  /** Whether in personal (non-org) mode */
  isPersonalMode: boolean;
  /** User's org memberships */
  memberships: OrgMembership[];
  /** Whether memberships are loading */
  isLoading: boolean;
  /** Current error */
  error: string | null;
}

export interface UseOrgSessionReturn {
  /** Current org session state */
  state: OrgSessionState;
  /** Whether org encryption is unlocked */
  isOrgEncryptionUnlocked: boolean;
  /** Switch to an organization */
  switchToOrg: (orgId: string) => Promise<void>;
  /** Switch to personal mode */
  switchToPersonal: () => void;
  /** Unlock org encryption key */
  unlockOrgEncryption: () => Promise<void>;
  /** Lock org encryption key */
  lockOrgEncryption: () => void;
  /** Refresh memberships from server */
  refreshMemberships: () => Promise<void>;
  /** Get org encryption status */
  getOrgEncryptionStatus: (orgId: string) => Promise<OrgEncryptionStatus>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useOrgSession(): UseOrgSessionReturn {
  const { getToken, userId } = useAuth();
  const { organization: clerkOrg } = useOrganization();
  const { setActive: setActiveOrg, userMemberships } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const encryption = useEncryption();

  const [state, setState] = useState<OrgSessionState>({
    currentOrgId: null,
    currentOrgName: null,
    isAdmin: false,
    isPersonalMode: true,
    memberships: [],
    isLoading: true,
    error: null,
  });

  // Track if org key unlock is in progress
  const unlockInProgressRef = useRef(false);

  // Sync with Clerk's active organization
  useEffect(() => {
    if (clerkOrg) {
      setState((prev) => ({
        ...prev,
        currentOrgId: clerkOrg.id,
        currentOrgName: clerkOrg.name,
        isPersonalMode: false,
      }));
    } else {
      setState((prev) => ({
        ...prev,
        currentOrgId: null,
        currentOrgName: null,
        isPersonalMode: true,
        isAdmin: false,
      }));
      // Lock org encryption when switching to personal
      encryption.lockOrgKey();
    }
  }, [clerkOrg, encryption]);

  // Fetch memberships from backend
  const refreshMemberships = useCallback(async () => {
    if (!userId) {
      setState((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${BACKEND_URL}/users/me/memberships`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        // If endpoint doesn't exist yet, use Clerk data
        if (res.status === 404) {
          const membershipsFromClerk: OrgMembership[] =
            userMemberships.data?.map((m) => ({
              id: m.id,
              org_id: m.organization.id,
              org_name: m.organization.name,
              role: m.role,
              has_org_key: false,
              key_distributed_at: null,
              joined_at: m.createdAt?.toISOString() ?? null,
            })) ?? [];

          setState((prev) => ({
            ...prev,
            memberships: membershipsFromClerk,
            isLoading: false,
          }));
          return;
        }
        throw new Error('Failed to fetch memberships');
      }

      const data = await res.json();
      setState((prev) => ({
        ...prev,
        memberships: data.memberships,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to fetch memberships:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error ? error.message : 'Failed to fetch memberships',
      }));
    }
  }, [userId, getToken, userMemberships.data]);

  // Load memberships on mount
  useEffect(() => {
    refreshMemberships();
  }, [refreshMemberships]);

  // Update admin status when memberships or current org changes
  useEffect(() => {
    if (state.currentOrgId && state.memberships.length > 0) {
      const membership = state.memberships.find(
        (m) => m.org_id === state.currentOrgId
      );
      setState((prev) => ({
        ...prev,
        isAdmin: membership?.role === 'org:admin',
      }));
    }
  }, [state.currentOrgId, state.memberships]);

  // Switch to organization
  const switchToOrg = useCallback(
    async (orgId: string): Promise<void> => {
      if (!setActiveOrg) return;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        // Set active org in Clerk
        await setActiveOrg({ organization: orgId });

        // Lock any existing org key
        encryption.lockOrgKey();

        // Find membership details
        const membership = state.memberships.find((m) => m.org_id === orgId);

        setState((prev) => ({
          ...prev,
          currentOrgId: orgId,
          currentOrgName: membership?.org_name ?? null,
          isPersonalMode: false,
          isAdmin: membership?.role === 'org:admin',
          isLoading: false,
        }));
      } catch (error) {
        console.error('Failed to switch org:', error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : 'Failed to switch organization',
        }));
        throw error;
      }
    },
    [setActiveOrg, encryption, state.memberships]
  );

  // Switch to personal mode
  const switchToPersonal = useCallback(() => {
    if (!setActiveOrg) return;

    // Clear active org in Clerk
    setActiveOrg({ organization: null });

    // Lock org encryption
    encryption.lockOrgKey();

    setState((prev) => ({
      ...prev,
      currentOrgId: null,
      currentOrgName: null,
      isPersonalMode: true,
      isAdmin: false,
    }));
  }, [setActiveOrg, encryption]);

  // Get org encryption status
  const getOrgEncryptionStatus = useCallback(
    async (orgId: string): Promise<OrgEncryptionStatus> => {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(
        `${BACKEND_URL}/organizations/${orgId}/encryption-status`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error('Failed to get org encryption status');
      }

      return res.json();
    },
    [getToken]
  );

  // Unlock org encryption key
  const unlockOrgEncryption = useCallback(async (): Promise<void> => {
    if (!state.currentOrgId) {
      throw new Error('No organization selected');
    }

    if (!encryption.state.isUnlocked) {
      throw new Error('Personal keys must be unlocked first');
    }

    if (unlockInProgressRef.current) {
      return; // Already unlocking
    }

    unlockInProgressRef.current = true;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Fetch membership with encrypted org key
      const res = await fetch(
        `${BACKEND_URL}/organizations/${state.currentOrgId}/membership`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        throw new Error('Failed to fetch membership');
      }

      const membership = await res.json();

      if (!membership.has_org_key || !membership.encrypted_org_key) {
        throw new Error('Organization key not distributed to you yet');
      }

      // Decrypt org key using personal key
      encryption.unlockOrgKey(membership.encrypted_org_key);

      setState((prev) => ({
        ...prev,
        isLoading: false,
      }));
    } catch (error) {
      console.error('Failed to unlock org encryption:', error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to unlock organization encryption',
      }));
      throw error;
    } finally {
      unlockInProgressRef.current = false;
    }
  }, [state.currentOrgId, encryption, getToken]);

  // Lock org encryption key
  const lockOrgEncryption = useCallback(() => {
    encryption.lockOrgKey();
  }, [encryption]);

  return {
    state,
    isOrgEncryptionUnlocked: encryption.isOrgUnlocked,
    switchToOrg,
    switchToPersonal,
    unlockOrgEncryption,
    lockOrgEncryption,
    refreshMemberships,
    getOrgEncryptionStatus,
  };
}
