/**
 * Awaiting organization encryption setup message.
 *
 * Shown when:
 * - User is in org context
 * - User is NOT an admin
 * - Organization doesn't have encryption set up yet
 *
 * The member must wait for an admin to set up org encryption.
 */

'use client';

import React from 'react';
import { Lock, Building2 } from 'lucide-react';

export function AwaitingOrgEncryption() {
  return (
    <div
      className="w-full max-w-md mx-auto p-6 bg-card rounded-lg border shadow-sm"
      data-testid="awaiting-org-encryption"
    >
      <div className="flex items-center gap-2 mb-4">
        <Lock className="h-6 w-6 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Organization Encryption Not Set Up</h2>
      </div>

      <div className="flex items-start gap-3 p-4 bg-muted rounded-lg">
        <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm text-muted-foreground">
            Your organization administrator needs to set up encryption before you can
            use encrypted chat in this organization.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Please contact your organization administrator to enable encryption.
          </p>
        </div>
      </div>
    </div>
  );
}
