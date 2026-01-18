/**
 * Memories settings page.
 *
 * Allows users to:
 * - View all their memories (facts the AI remembers)
 * - Filter between personal and organization memories
 * - Delete individual memories
 * - Delete all memories
 *
 * Requires encryption to be set up and unlocked to view memory contents.
 */

'use client';

import React, { useEffect } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useEncryption } from '@/hooks/useEncryption';
import { useOrgEncryptionStatus } from '@/hooks/useOrgEncryptionStatus';
import { SetupEncryptionPrompt } from '@/components/encryption/SetupEncryptionPrompt';
import { UnlockEncryptionPrompt } from '@/components/encryption/UnlockEncryptionPrompt';
import { MemoryList } from '@/components/memories/MemoryList';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Brain, Loader2, Lock, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default function MemoriesSettingsPage() {
  const encryption = useEncryption();
  const { organization } = useOrganization();
  const orgId = organization?.id || null;
  const isOrgContext = !!orgId;

  // Get org encryption status if in org context
  const orgEncryptionStatus = useOrgEncryptionStatus(orgId);

  // Auto-unlock org key when personal keys are unlocked
  useEffect(() => {
    if (
      encryption.state.isUnlocked &&
      isOrgContext &&
      orgEncryptionStatus.userHasOrgKey &&
      orgEncryptionStatus.encryptedOrgKey &&
      !encryption.isOrgUnlocked
    ) {
      try {
        encryption.unlockOrgKey(orgEncryptionStatus.encryptedOrgKey);
      } catch (err) {
        console.error('Failed to auto-unlock org key:', err);
      }
    }
  }, [
    encryption,
    isOrgContext,
    orgEncryptionStatus.userHasOrgKey,
    orgEncryptionStatus.encryptedOrgKey,
  ]);

  // Loading state
  if (encryption.state.isLoading || (isOrgContext && orgEncryptionStatus.loading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Determine if we can show memories
  const canShowMemories =
    encryption.state.isSetup &&
    encryption.state.isUnlocked &&
    (!isOrgContext || (orgEncryptionStatus.orgHasEncryption && encryption.isOrgUnlocked));

  // Determine what blocking state to show
  let blockingContent: React.ReactNode = null;

  if (!encryption.state.isSetup) {
    blockingContent = (
      <div className="max-w-md mx-auto">
        <SetupEncryptionPrompt onComplete={() => {}} />
      </div>
    );
  } else if (!encryption.state.isUnlocked) {
    blockingContent = (
      <div className="max-w-md mx-auto">
        <UnlockEncryptionPrompt onUnlocked={() => {}} />
      </div>
    );
  } else if (isOrgContext && !orgEncryptionStatus.orgHasEncryption) {
    blockingContent = (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Lock className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Organization Encryption Not Set Up</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          An organization admin needs to set up encryption before you can view
          organization memories. Please contact your admin.
        </p>
      </div>
    );
  } else if (isOrgContext && !orgEncryptionStatus.userHasOrgKey) {
    blockingContent = (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="text-lg font-medium mb-2">Awaiting Key Distribution</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Your organization admin needs to distribute the encryption key to you.
          Once that&apos;s done, you&apos;ll be able to view organization memories.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Memory Settings</h1>
          </div>
          {isOrgContext && (
            <span className="ml-2 px-2 py-0.5 bg-muted text-xs rounded">
              {organization?.name || 'Organization'}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Info section */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <h2 className="text-sm font-medium mb-1">About Memories</h2>
          <p className="text-sm text-muted-foreground">
            Memories are facts and preferences the AI learns from your conversations.
            They help provide more personalized and contextual responses.
            {isOrgContext && (
              <>
                {' '}In organization mode, you can see both your personal memories and
                shared organization memories.
              </>
            )}
          </p>
        </div>

        {/* Show blocking content or memory list */}
        {blockingContent || (
          canShowMemories && <MemoryList orgId={orgId} />
        )}
      </div>
    </div>
  );
}
