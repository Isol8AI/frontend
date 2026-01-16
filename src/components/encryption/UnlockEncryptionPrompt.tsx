/**
 * Unlock encryption prompt for returning users.
 *
 * Allows users to unlock their encryption keys with:
 * - Their 6-digit passcode
 * - Or their 20-digit recovery code
 */

'use client';

import React, { useState } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, Key, Loader2, Lock, Unlock } from 'lucide-react';

type UnlockMode = 'passcode' | 'recovery';

interface Props {
  onUnlocked?: () => void;
  compact?: boolean;
}

export function UnlockEncryptionPrompt({ onUnlocked, compact = false }: Props) {
  const encryption = useEncryption();
  const [mode, setMode] = useState<UnlockMode>('passcode');
  const [passcode, setPasscode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Use context error OR local error (context error persists across remounts)
  const error = encryption.state.error || localError;

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(value);
    setLocalError(null);
  };

  const handleRecoveryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow digits and dashes for recovery code
    const value = e.target.value.replace(/[^\d-]/g, '').slice(0, 24);
    setRecoveryCode(value);
    setLocalError(null);
  };

  const handleUnlock = async () => {
    setIsLoading(true);
    setLocalError(null);

    try {
      if (mode === 'passcode') {
        if (passcode.length < 6) {
          setLocalError('Passcode must be 6 digits');
          setIsLoading(false);
          return;
        }
        await encryption.unlockKeys(passcode);
      } else {
        const cleanCode = recoveryCode.replace(/-/g, '');
        if (cleanCode.length < 20) {
          setLocalError('Recovery code must be 20 digits');
          setIsLoading(false);
          return;
        }
        await encryption.unlockWithRecovery(recoveryCode);
      }
      onUnlocked?.();
    } catch {
      setLocalError(
        mode === 'passcode' ? 'Incorrect passcode' : 'Invalid recovery code'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleUnlock();
    }
  };

  if (compact) {
    return (
      <div
        className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg"
        data-testid="unlock-encryption-prompt"
      >
        <Lock className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        <span className="text-sm text-yellow-700 dark:text-yellow-300">
          Encryption locked
        </span>
        <Input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="Passcode"
          value={passcode}
          onChange={handlePasscodeChange}
          onKeyDown={handleKeyDown}
          data-testid="unlock-passcode-input"
          className="w-28 h-8 text-center"
        />
        <Button
          size="sm"
          disabled={isLoading || passcode.length < 6}
          onClick={handleUnlock}
          data-testid="unlock-button"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unlock className="h-4 w-4" />
          )}
        </Button>
        {error && (
          <span className="text-xs text-red-600" data-testid="passcode-error">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm"
      data-testid="unlock-encryption-prompt"
    >
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-6 w-6 text-primary" />
        <h2 className="text-xl font-semibold">Unlock Encryption</h2>
      </div>

      <p className="text-sm text-muted-foreground mb-6">
        {mode === 'passcode'
          ? 'Enter your 6-digit passcode to unlock your encryption keys.'
          : 'Enter your 20-digit recovery code to regain access.'}
      </p>

      <div className="space-y-4">
        {mode === 'passcode' ? (
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Passcode
            </label>
            <Input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="Enter 6-digit passcode"
              value={passcode}
              onChange={handlePasscodeChange}
              onKeyDown={handleKeyDown}
              data-testid="unlock-passcode-input"
              className="text-center text-lg tracking-[0.5em]"
              autoFocus
            />
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium mb-1.5 block">
              Recovery Code
            </label>
            <Input
              type="text"
              inputMode="numeric"
              maxLength={24}
              placeholder="Enter 20-digit recovery code"
              value={recoveryCode}
              onChange={handleRecoveryChange}
              onKeyDown={handleKeyDown}
              data-testid="recovery-code-input"
              className="text-center text-lg tracking-wider font-mono"
              autoFocus
            />
          </div>
        )}

        {error && (
          <div
            className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm"
            data-testid="passcode-error"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="w-full gap-2"
          disabled={
            isLoading ||
            (mode === 'passcode'
              ? passcode.length < 6
              : recoveryCode.replace(/-/g, '').length < 20)
          }
          onClick={handleUnlock}
          data-testid="unlock-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Unlocking...
            </>
          ) : (
            <>
              <Unlock className="h-4 w-4" />
              Unlock
            </>
          )}
        </Button>

        <div className="text-center">
          {mode === 'passcode' ? (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                setMode('recovery');
                setLocalError(null);
              }}
              data-testid="use-recovery-code-link"
            >
              <Key className="h-3 w-3 inline mr-1" />
              Use recovery code instead
            </button>
          ) : (
            <button
              type="button"
              className="text-sm text-primary hover:underline"
              onClick={() => {
                setMode('passcode');
                setLocalError(null);
              }}
            >
              <Lock className="h-3 w-3 inline mr-1" />
              Use passcode instead
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
