/**
 * Organization encryption setup prompt for admins.
 *
 * Shown when:
 * - User is in org context
 * - User is an org admin
 * - Organization doesn't have encryption keys set up yet
 *
 * The admin re-enters their personal passcode to create org keys.
 */

'use client';

import React, { useState } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Loader2, Shield, Building2 } from 'lucide-react';

interface Props {
  orgId: string;
  onSuccess?: () => void;
}

export function OrgEncryptionSetupPrompt({ orgId, onSuccess }: Props) {
  const encryption = useEncryption();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(value);
    setError(null);
  };

  const handleSetupOrgEncryption = async () => {
    if (passcode.length < 6) {
      setError('Passcode must be 6 digits');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      await encryption.setupOrgEncryption(orgId, passcode);
      onSuccess?.();
    } catch (err) {
      console.error('Failed to setup org encryption:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to setup organization encryption'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm"
      data-testid="org-encryption-setup-prompt"
    >
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">Set Up Organization Encryption</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        As an admin, you need to set up encryption for your organization.
        Enter your personal passcode to create the organization&apos;s encryption keys.
      </p>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Your Personal Passcode
          </label>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Enter your 6-digit passcode"
            value={passcode}
            onChange={handlePasscodeChange}
            data-testid="org-passcode-input"
            className="text-center text-lg tracking-[0.5em]"
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            This is the same passcode you use for your personal encryption
          </p>
        </div>

        {error && (
          <div
            className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm"
            data-testid="org-setup-error"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="w-full gap-2"
          disabled={isLoading || passcode.length < 6}
          onClick={handleSetupOrgEncryption}
          data-testid="setup-org-encryption-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating organization keys...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              Create Organization Encryption
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
