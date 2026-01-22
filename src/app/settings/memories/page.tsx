/**
 * Memories settings page.
 *
 * Allows users to:
 * - View all their memories (facts the AI remembers)
 * - View client-side temporal facts
 * - Filter between personal and organization memories
 * - Delete individual memories
 * - Delete all memories
 *
 * Requires encryption to be set up and unlocked to view memory contents.
 */

'use client';

import React, { useEffect, useState } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { useEncryption } from '@/hooks/useEncryption';
import { useOrgEncryptionStatus } from '@/hooks/useOrgEncryptionStatus';
import { SetupEncryptionPrompt } from '@/components/encryption/SetupEncryptionPrompt';
import { UnlockEncryptionPrompt } from '@/components/encryption/UnlockEncryptionPrompt';
import { MemoryList, FactList } from '@/components/memories';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Brain, Loader2, Lock, AlertCircle, Lightbulb } from 'lucide-react';
import Link from 'next/link';

type TabType = 'memories' | 'facts';

export default function MemoriesSettingsPage() {
  const encryption = useEncryption();
  const { organization } = useOrganization();
  const orgId = organization?.id || null;
  const isOrgContext = !!orgId;

  // Tab state - facts are personal only, memories can be org
  const [activeTab, setActiveTab] = useState<TabType>('memories');

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
  if (encryption.state.isLoading || (isOrgContext && orgEncryptionStatus.isLoading)) {
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
        {/* Tab Navigation */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-6">
          <TabButton
            active={activeTab === 'memories'}
            onClick={() => setActiveTab('memories')}
            icon={<Brain className="h-4 w-4" />}
          >
            Memories
          </TabButton>
          <TabButton
            active={activeTab === 'facts'}
            onClick={() => setActiveTab('facts')}
            icon={<Lightbulb className="h-4 w-4" />}
          >
            Facts
          </TabButton>
        </div>

        {/* Info section */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <h2 className="text-sm font-medium mb-1">
            {activeTab === 'memories' ? 'About Memories' : 'About Facts'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {activeTab === 'memories' ? (
              <>
                Memories are facts and preferences the AI learns from your conversations.
                They are stored securely on the server (encrypted) and help provide more
                personalized responses.
                {isOrgContext && (
                  <>
                    {' '}In organization mode, you can see both your personal memories and
                    shared organization memories.
                  </>
                )}
              </>
            ) : (
              <>
                Facts are temporal knowledge extracted from your conversations using AI.
                They are stored <strong>locally in your browser</strong> and never sent to
                the server. Facts can become outdated and are automatically invalidated
                when new information is learned.
              </>
            )}
          </p>
        </div>

        {/* Show blocking content or content based on tab */}
        {activeTab === 'memories' && (
          blockingContent || (canShowMemories && <MemoryList orgId={orgId} />)
        )}

        {activeTab === 'facts' && (
          // Facts only require personal encryption (stored locally)
          !encryption.state.isSetup ? (
            <div className="max-w-md mx-auto">
              <SetupEncryptionPrompt onComplete={() => {}} />
            </div>
          ) : !encryption.state.isUnlocked ? (
            <div className="max-w-md mx-auto">
              <UnlockEncryptionPrompt onUnlocked={() => {}} />
            </div>
          ) : (
            <FactList />
          )
        )}
      </div>
    </div>
  );
}

/**
 * Tab button component.
 */
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm rounded transition-colors flex-1 justify-center ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      data-testid={`tab-${children?.toString().toLowerCase()}`}
    >
      {icon}
      {children}
    </button>
  );
}
