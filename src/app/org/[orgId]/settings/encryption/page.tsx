/**
 * Organization encryption settings page.
 *
 * Allows admins to:
 * - Set up organization encryption keys
 * - View encryption status
 * - Manage encryption settings
 */

'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useOrganization } from '@clerk/nextjs';
import { useOrgSession } from '@/hooks/useOrgSession';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Key, Lock, Shield, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: Promise<{ orgId: string }>;
}

export default function OrgEncryptionSettingsPage({ params }: Props) {
  // In Next.js 15+, params is a Promise - use React's use() hook
  const resolvedParams = use(params);
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { organization, membership } = useOrganization();
  const { state: orgState, getOrgEncryptionStatus } = useOrgSession();
  const encryption = useEncryption();

  const [isLoading, setIsLoading] = useState(true);
  const [orgHasEncryption, setOrgHasEncryption] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isAdmin = membership?.role === 'org:admin';

  // Check org encryption status on load
  useEffect(() => {
    async function checkStatus() {
      if (!resolvedParams.orgId) return;
      try {
        const status = await getOrgEncryptionStatus(resolvedParams.orgId);
        setOrgHasEncryption(status.has_encryption_keys);
      } catch (e) {
        console.error('Failed to check org encryption status:', e);
      } finally {
        setIsLoading(false);
      }
    }
    checkStatus();
  }, [resolvedParams.orgId, getOrgEncryptionStatus]);

  // Handle creating org encryption keys
  const handleCreateOrgKeys = async () => {
    if (passcode.length < 6) {
      setError('Passcode must be at least 6 characters');
      return;
    }
    if (passcode !== confirmPasscode) {
      setError('Passcodes do not match');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Use encryption context to create org keys
      await encryption.setupOrgEncryption(resolvedParams.orgId, passcode);
      setSuccess(true);
      setOrgHasEncryption(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create encryption keys');
    } finally {
      setIsCreating(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Non-admin access denied
  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Encryption Settings</h1>
        </div>

        <div
          data-testid="admin-required-message"
          className="p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800"
        >
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h2 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Admin Access Required
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Only organization administrators can manage encryption settings.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Link href="/">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Encryption Settings</h1>
          <p className="text-sm text-muted-foreground">
            {organization?.name || 'Organization'}
          </p>
        </div>
      </div>

      {/* Status badge */}
      <div className="mb-6">
        {orgHasEncryption ? (
          <div
            data-testid="org-encryption-enabled-badge"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-sm font-medium"
          >
            <Shield className="h-4 w-4" />
            Encryption Enabled
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded-full text-sm font-medium">
            <AlertCircle className="h-4 w-4" />
            Encryption Not Set Up
          </div>
        )}
      </div>

      {/* Setup form or status */}
      {!orgHasEncryption ? (
        <div
          data-testid="setup-org-encryption-prompt"
          className="p-6 bg-card border rounded-lg space-y-6"
        >
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key className="h-5 w-5" />
              Set Up Organization Encryption
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Create a passcode to protect your organization&apos;s encryption keys.
              This passcode will be needed to unlock encryption features.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {success ? (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5" />
              <div>
                <p className="font-medium">Encryption keys created successfully!</p>
                <p className="text-sm mt-1">
                  Your organization is now set up for end-to-end encryption.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Organization Passcode
                  </label>
                  <input
                    type="password"
                    data-testid="org-passcode-input"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    placeholder="Enter 6+ character passcode"
                    className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isCreating}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Confirm Passcode
                  </label>
                  <input
                    type="password"
                    data-testid="org-passcode-confirm-input"
                    value={confirmPasscode}
                    onChange={(e) => setConfirmPasscode(e.target.value)}
                    placeholder="Confirm your passcode"
                    className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    disabled={isCreating}
                  />
                </div>
              </div>

              <Button
                data-testid="create-org-keys-button"
                onClick={handleCreateOrgKeys}
                disabled={isCreating || passcode.length < 6}
                className="w-full"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Keys...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Create Encryption Keys
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-6 bg-card border rounded-lg">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <Shield className="h-5 w-5 text-green-600" />
              Encryption Active
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              Your organization has end-to-end encryption enabled. All messages
              in organization chats are encrypted.
            </p>
            <div className="flex gap-3">
              <Link href={`/org/${resolvedParams.orgId}/members`}>
                <Button variant="outline">
                  <Key className="h-4 w-4 mr-2" />
                  Manage Key Distribution
                </Button>
              </Link>
              <Link href={`/org/${resolvedParams.orgId}/settings/encryption/audit`}>
                <Button variant="outline">
                  View Audit Log
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
