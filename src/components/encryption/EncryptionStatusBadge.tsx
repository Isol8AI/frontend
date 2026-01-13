/**
 * Badge showing current encryption status.
 */

'use client';

import React from 'react';
import { useEncryption } from '@/hooks/useEncryption';
import { Lock, Unlock, AlertCircle } from 'lucide-react';

interface Props {
  className?: string;
}

export function EncryptionStatusBadge({ className = '' }: Props) {
  const { state } = useEncryption();

  if (state.isLoading) {
    return null;
  }

  if (!state.isSetup) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs font-medium ${className}`}
        data-testid="encryption-not-setup-badge"
      >
        <AlertCircle className="h-3 w-3" />
        <span>Not Set Up</span>
      </div>
    );
  }

  if (!state.isUnlocked) {
    return (
      <div
        className={`flex items-center gap-1.5 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs font-medium ${className}`}
        data-testid="encryption-locked-badge"
      >
        <Lock className="h-3 w-3" />
        <span>Locked</span>
      </div>
    );
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs font-medium ${className}`}
      data-testid="encryption-unlocked-badge"
    >
      <Unlock className="h-3 w-3" />
      <span>Encrypted</span>
    </div>
  );
}
