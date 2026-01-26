/**
 * Setup encryption prompt for first-time users.
 *
 * Guides users through:
 * 1. Creating a 6-digit passcode
 * 2. Confirming the passcode
 * 3. Generating encryption keys
 * 4. Displaying and saving recovery code
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertCircle, Check, Copy, Key, Loader2, Shield } from 'lucide-react';

// Instance counter for debugging
let instanceCounter = 0;

type SetupStep = 'passcode' | 'recovery' | 'complete';

interface Props {
  onComplete?: () => void;
}

export function SetupEncryptionPrompt({ onComplete }: Props) {
  const encryption = useEncryption();
  const [step, setStep] = useState<SetupStep>('passcode');
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [hasSavedRecovery, setHasSavedRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Track mount state to prevent updates on unmounted component
  const isMountedRef = useRef(true);
  const instanceIdRef = useRef(++instanceCounter);

  useEffect(() => {
    const instanceId = instanceIdRef.current;
    console.log(`[SetupEncryptionPrompt #${instanceId}] MOUNTED`);
    isMountedRef.current = true;

    return () => {
      console.log(`[SetupEncryptionPrompt #${instanceId}] UNMOUNTED`);
      isMountedRef.current = false;
    };
  }, []);

  // Log step changes
  useEffect(() => {
    console.log(`[SetupEncryptionPrompt #${instanceIdRef.current}] step changed to: ${step}`);
  }, [step]);

  const handlePasscodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setPasscode(value);
    setError(null);
  };

  const handleConfirmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setConfirmPasscode(value);
    setError(null);
  };

  const handleSetupEncryption = async () => {
    const instanceId = instanceIdRef.current;
    console.log(`[#${instanceId}] === handleSetupEncryption called ===`);
    console.log(`[#${instanceId}] Passcode:`, passcode);
    console.log(`[#${instanceId}] Confirm Passcode:`, confirmPasscode);

    if (passcode.length < 6) {
      console.log(`[#${instanceId}] ERROR: Passcode too short`);
      setError('Passcode must be 6 digits');
      return;
    }

    if (passcode !== confirmPasscode) {
      console.log(`[#${instanceId}] ERROR: Passcodes do not match`);
      setError('Passcodes do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      console.log(`[#${instanceId}] Calling encryption.setupEncryption...`);
      const result = await encryption.setupEncryption(passcode);

      console.log(`[#${instanceId}] === setupEncryption returned ===`);
      console.log(`[#${instanceId}] Recovery Code:`, result.recoveryCode);
      console.log(`[#${instanceId}] isMounted:`, isMountedRef.current);

      if (!isMountedRef.current) {
        console.log(`[#${instanceId}] Component unmounted! Not updating state.`);
        return;
      }

      console.log(`[#${instanceId}] Setting recoveryCode and step to "recovery"...`);
      setRecoveryCode(result.recoveryCode);
      setStep('recovery');
      console.log(`[#${instanceId}] State updates called`);
    } catch (err) {
      console.error(`[#${instanceId}] === setupEncryption FAILED ===`);
      console.error(`[#${instanceId}] Error:`, err);
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : 'Failed to setup encryption');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        console.log(`[#${instanceId}] isLoading set to false`);
      }
    }
  };

  const handleCopyRecovery = async () => {
    try {
      await navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = recoveryCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleContinue = () => {
    // Confirm the setup - this sets isSetup: true in the context
    encryption.confirmSetup();
    setStep('complete');
    onComplete?.();
  };

  if (step === 'recovery') {
    return (
      <div
        className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm"
        data-testid="recovery-code-prompt"
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-6 w-6 text-primary" />
          <h2 className="text-xl font-semibold">Save Your Recovery Code</h2>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          This 20-digit recovery code can restore access to your encryption keys
          if you forget your passcode. Store it somewhere safe - you cannot view
          it again.
        </p>

        <div
          className="p-4 bg-muted rounded-lg mb-4 font-mono text-lg text-center tracking-wider select-all"
          data-testid="recovery-code-display"
        >
          {recoveryCode}
        </div>

        <Button
          variant="outline"
          className="w-full mb-4 gap-2"
          onClick={handleCopyRecovery}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy Recovery Code
            </>
          )}
        </Button>

        <div className="flex items-start gap-2 mb-4">
          <Checkbox
            id="saved-recovery"
            checked={hasSavedRecovery}
            onCheckedChange={(checked) => setHasSavedRecovery(!!checked)}
            data-testid="recovery-code-saved-checkbox"
          />
          <label htmlFor="saved-recovery" className="text-sm cursor-pointer">
            I have saved my recovery code in a secure location
          </label>
        </div>

        <Button
          className="w-full"
          disabled={!hasSavedRecovery}
          onClick={handleContinue}
          data-testid="continue-button"
        >
          Continue
        </Button>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm">
        <div className="flex items-center gap-2 mb-4 text-green-600">
          <Check className="h-6 w-6" />
          <h2 className="text-xl font-semibold">Encryption Ready</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Your encryption keys are set up and ready to use. All your messages
          will be end-to-end encrypted.
        </p>
      </div>
    );
  }

  return (
    <div
      className="w-full max-w-md mx-auto relative group"
      data-testid="setup-encryption-prompt"
    >
      <div className="absolute -inset-1 bg-gradient-to-r from-blue-500/20 to-purple-500/20 rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000" />
      <div className="relative p-8 bg-zinc-900/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl text-white">
        <div className="mb-8 text-center">
             <div className="h-12 w-12 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/10">
                 <Key className="h-6 w-6 text-white" />
             </div>
             <h2 className="text-2xl font-bold text-white tracking-tight">Set Up Encryption</h2>
             <p className="text-sm text-white/40 mt-2">
                Create a passcode to secure your private research enclave.
              </p>
        </div>



      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Create Passcode
          </label>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Enter 6-digit passcode"
            value={passcode}
            onChange={handlePasscodeChange}
            data-testid="passcode-input"
            className="text-center text-lg tracking-[0.5em] bg-black/50 border-white/10 text-white placeholder:text-white/20"
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block">
            Confirm Passcode
          </label>
          <Input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={6}
            placeholder="Confirm passcode"
            value={confirmPasscode}
            onChange={handleConfirmChange}
            data-testid="passcode-confirm-input"
            className="text-center text-lg tracking-[0.5em] bg-black/50 border-white/10 text-white placeholder:text-white/20"
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm"
            data-testid={
              error.includes('match')
                ? 'passcode-mismatch-error'
                : 'passcode-error'
            }
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <Button
          className="w-full gap-2 bg-white text-black hover:bg-white/90 font-medium"
          disabled={isLoading || passcode.length < 6 || confirmPasscode.length < 6}
          onClick={handleSetupEncryption}
          data-testid="setup-encryption-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Setting up encryption...
            </>
          ) : (
            <>
              <Shield className="h-4 w-4" />
              Create Encryption Keys
            </>
          )}
        </Button>
      </div>
    </div>
    </div>
  );
}
