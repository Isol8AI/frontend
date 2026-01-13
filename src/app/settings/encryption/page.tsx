/**
 * Encryption settings page.
 *
 * Allows users to:
 * - Set up encryption for the first time
 * - View their encryption status
 * - Change passcode (if already set up)
 */

'use client';

import React from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { SetupEncryptionPrompt } from '@/components/encryption/SetupEncryptionPrompt';
import { UnlockEncryptionPrompt } from '@/components/encryption/UnlockEncryptionPrompt';
import { EncryptionStatusBadge } from '@/components/encryption/EncryptionStatusBadge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Key, Loader2, Shield, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function EncryptionSettingsPage() {
  const encryption = useEncryption();
  const router = useRouter();

  const handleSetupComplete = () => {
    // Optionally redirect to main chat after setup
    router.push('/');
  };

  const handleUnlockComplete = () => {
    // Refresh the page state after unlock
  };

  if (encryption.state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Encryption Settings</h1>
          </div>
          <div className="ml-auto">
            <EncryptionStatusBadge />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-8">
        {!encryption.state.isSetup ? (
          // Show setup prompt for new users
          <SetupEncryptionPrompt onComplete={handleSetupComplete} />
        ) : !encryption.state.isUnlocked ? (
          // Show unlock prompt for returning users
          <div className="space-y-6">
            <UnlockEncryptionPrompt onUnlocked={handleUnlockComplete} />

            <div className="text-center text-sm text-muted-foreground">
              <p>
                You can also set up new keys if you&apos;ve lost access to your
                recovery code. This will delete all previously encrypted
                messages.
              </p>
            </div>
          </div>
        ) : (
          // Show encryption status for unlocked users
          <div className="space-y-6">
            <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
                <div>
                  <h2 className="text-lg font-semibold text-green-800 dark:text-green-200">
                    Encryption Active
                  </h2>
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Your messages are end-to-end encrypted
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Key className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Your Public Key</span>
              </div>
              <code className="text-xs font-mono bg-background p-2 rounded block break-all">
                {encryption.state.publicKey}
              </code>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => encryption.lockKeys()}
              >
                Lock Keys
              </Button>
              <Link href="/" className="flex-1">
                <Button className="w-full">Back to Chat</Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
