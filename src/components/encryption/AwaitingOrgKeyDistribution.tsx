/**
 * Awaiting organization key distribution message.
 *
 * Shown when:
 * - User is in org context
 * - Organization has encryption set up
 * - User does NOT have a distributed org key yet
 *
 * The member must wait for an admin to distribute the key to them.
 */

'use client';

import React from 'react';
import { Clock, KeyRound } from 'lucide-react';

export function AwaitingOrgKeyDistribution() {
  return (
    <div
      className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm"
      data-testid="awaiting-org-key-distribution"
    >
      <div className="flex items-center gap-2 mb-4">
        <Clock className="h-6 w-6 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Awaiting Access</h2>
      </div>

      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
        <KeyRound className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-muted-foreground">
            Your organization uses encrypted chat, but you haven&apos;t been granted
            access yet.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Please contact your organization administrator to receive access to
            encrypted conversations.
          </p>
        </div>
      </div>
    </div>
  );
}
