/**
 * Admin component for managing organization key distribution.
 *
 * Shows pending members who need key distribution and provides
 * controls for distributing keys individually or in batch.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useOrgAdmin } from '@/hooks/useOrgAdmin';
import { useEncryption } from '@/hooks/useEncryption';
import { PendingMembersList } from './PendingMembersList';
import { MembersNeedingSetupList } from './MembersNeedingSetupList';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, Key, Loader2, RefreshCw } from 'lucide-react';

interface Props {
  orgId: string;
}

export function OrgKeyDistribution({ orgId }: Props) {
  const encryption = useEncryption();
  const admin = useOrgAdmin();
  const [isDistributing, setIsDistributing] = useState<string | null>(null);

  // Load data when keys are unlocked
  useEffect(() => {
    if (encryption.state.isUnlocked && encryption.isOrgUnlocked) {
      admin.loadPendingMembers(orgId);
      admin.loadAdminOrgKey(orgId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- admin functions are stable
  }, [orgId, encryption.state.isUnlocked, encryption.isOrgUnlocked]);

  // Handle distribute to single member
  const handleDistribute = async (membershipId: string, publicKey: string) => {
    setIsDistributing(membershipId);
    try {
      await admin.distributeToMember(orgId, membershipId, publicKey);
    } finally {
      setIsDistributing(null);
    }
  };

  // Handle distribute to all
  const handleDistributeAll = async () => {
    await admin.distributeToAll(orgId);
  };

  // Not unlocked state
  if (!encryption.state.isUnlocked) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
          <Key className="h-5 w-5" />
          <p className="font-medium">Unlock your personal keys</p>
        </div>
        <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
          Enter your passcode to manage key distribution.
        </p>
      </div>
    );
  }

  // Org key not unlocked
  if (!encryption.isOrgUnlocked) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
        <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
          <Key className="h-5 w-5" />
          <p className="font-medium">Unlock organization keys</p>
        </div>
        <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
          Organization encryption must be unlocked to distribute keys.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Key Distribution</h2>
          <p className="text-sm text-muted-foreground">
            Distribute encryption keys to new organization members
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => admin.loadPendingMembers(orgId)}
            disabled={admin.isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${admin.isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {admin.pendingMembers.length > 0 && (
            <Button
              onClick={handleDistributeAll}
              disabled={admin.isLoading}
              className="gap-2"
            >
              {admin.distributionProgress ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Distributing {admin.distributionProgress.current}/
                  {admin.distributionProgress.total}...
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  Distribute to All ({admin.pendingMembers.length})
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Error display */}
      {admin.error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {admin.error}
        </div>
      )}

      {/* Main content */}
      {admin.isLoading && !admin.distributionProgress ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Ready for distribution */}
          {admin.pendingMembers.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-lg font-medium">
                Ready for Distribution ({admin.pendingMembers.length})
              </h3>
              <PendingMembersList
                members={admin.pendingMembers}
                onDistribute={handleDistribute}
                distributingMemberId={isDistributing}
                isLoading={admin.isLoading}
              />
            </div>
          ) : admin.membersNeedingSetup.length === 0 ? (
            <div className="p-6 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6" />
              <div>
                <p className="font-medium">All members have their keys</p>
                <p className="text-sm opacity-80">
                  No pending key distributions at this time.
                </p>
              </div>
            </div>
          ) : null}

          {/* Members needing personal setup */}
          {admin.membersNeedingSetup.length > 0 && (
            <div className="space-y-3 mt-6">
              <div>
                <h3 className="text-lg font-medium text-amber-700 dark:text-amber-300">
                  Awaiting Personal Setup ({admin.membersNeedingSetup.length})
                </h3>
                <p className="text-sm text-muted-foreground">
                  These members need to set up their personal encryption before receiving org keys.
                </p>
              </div>
              <MembersNeedingSetupList members={admin.membersNeedingSetup} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
