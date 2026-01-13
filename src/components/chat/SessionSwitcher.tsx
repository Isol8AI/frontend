/**
 * Session context switcher for personal/org mode.
 *
 * Allows users to switch between their personal context and
 * organization contexts for encrypted chat sessions.
 *
 * Features:
 * - Shows current context (personal or org name)
 * - Dropdown to switch contexts
 * - Indicates encryption status for orgs
 * - Locks org key when switching away
 */

'use client';

import * as React from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ChevronDown, User, Building2, Lock, LockOpen, AlertCircle } from 'lucide-react';

export interface OrgOption {
  id: string;
  name: string;
  hasOrgKey: boolean;
  isAdmin: boolean;
}

interface SessionSwitcherProps {
  /** Currently selected org ID (null = personal mode) */
  currentOrgId: string | null;
  /** Available organizations */
  organizations: OrgOption[];
  /** Whether org encryption is currently unlocked */
  isOrgEncryptionUnlocked: boolean;
  /** Whether personal encryption is unlocked */
  isPersonalEncryptionUnlocked: boolean;
  /** Callback when user switches to personal mode */
  onSwitchToPersonal: () => void;
  /** Callback when user switches to an org */
  onSwitchToOrg: (orgId: string) => void;
  /** Whether switching is in progress */
  isLoading?: boolean;
  /** Whether the switcher is disabled */
  disabled?: boolean;
}

export function SessionSwitcher({
  currentOrgId,
  organizations,
  isOrgEncryptionUnlocked,
  isPersonalEncryptionUnlocked,
  onSwitchToPersonal,
  onSwitchToOrg,
  isLoading = false,
  disabled = false,
}: SessionSwitcherProps) {
  const currentOrg = currentOrgId
    ? organizations.find((o) => o.id === currentOrgId)
    : null;

  const isPersonalMode = !currentOrgId;
  const displayName = isPersonalMode ? 'Personal' : currentOrg?.name || 'Organization';

  // Determine encryption status icon
  const getEncryptionIcon = () => {
    if (isPersonalMode) {
      return isPersonalEncryptionUnlocked ? (
        <LockOpen className="h-3 w-3 text-green-500" />
      ) : (
        <Lock className="h-3 w-3 text-yellow-500" />
      );
    }
    if (!currentOrg?.hasOrgKey) {
      return <AlertCircle className="h-3 w-3 text-orange-500" />;
    }
    return isOrgEncryptionUnlocked ? (
      <LockOpen className="h-3 w-3 text-green-500" />
    ) : (
      <Lock className="h-3 w-3 text-yellow-500" />
    );
  };

  const getContextIcon = () => {
    return isPersonalMode ? (
      <User className="h-4 w-4" />
    ) : (
      <Building2 className="h-4 w-4" />
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || isLoading}>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 min-w-[140px] justify-between"
        >
          <span className="flex items-center gap-2">
            {getContextIcon()}
            <span className="truncate max-w-[100px]">{displayName}</span>
            {getEncryptionIcon()}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {/* Personal Mode Option */}
        <DropdownMenuItem
          onClick={onSwitchToPersonal}
          className={isPersonalMode ? 'bg-accent' : ''}
        >
          <span className="flex items-center gap-2 w-full">
            <User className="h-4 w-4" />
            <span className="flex-1">Personal</span>
            {isPersonalEncryptionUnlocked ? (
              <LockOpen className="h-3 w-3 text-green-500" />
            ) : (
              <Lock className="h-3 w-3 text-yellow-500" />
            )}
          </span>
        </DropdownMenuItem>

        {organizations.length > 0 && <DropdownMenuSeparator />}

        {/* Organization Options */}
        {organizations.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => onSwitchToOrg(org.id)}
            className={currentOrgId === org.id ? 'bg-accent' : ''}
          >
            <span className="flex items-center gap-2 w-full">
              <Building2 className="h-4 w-4" />
              <span className="flex-1 truncate">{org.name}</span>
              {!org.hasOrgKey ? (
                <AlertCircle className="h-3 w-3 text-orange-500" />
              ) : currentOrgId === org.id && isOrgEncryptionUnlocked ? (
                <LockOpen className="h-3 w-3 text-green-500" />
              ) : (
                <Lock className="h-3 w-3 text-yellow-500" />
              )}
            </span>
          </DropdownMenuItem>
        ))}

        {organizations.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            No organizations
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
