/**
 * List of organization members waiting for key distribution.
 *
 * Displays each pending member with their public key preview
 * and a button to distribute the org key to them.
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Key, Loader2, User } from 'lucide-react';

interface PendingMember {
  membershipId: string;
  userId: string;
  userPublicKey: string;
  role: string;
  joinedAt: Date;
}

interface Props {
  members: PendingMember[];
  onDistribute: (membershipId: string, publicKey: string) => Promise<void>;
  distributingMemberId: string | null;
  isLoading: boolean;
}

export function PendingMembersList({
  members,
  onDistribute,
  distributingMemberId,
  isLoading,
}: Props) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium">Member</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Public Key</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Joined</th>
            <th className="px-4 py-3 text-right text-sm font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {members.map((member) => (
            <tr key={member.membershipId} className="hover:bg-muted/30">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-muted rounded-full">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium">
                      {member.userId.slice(0, 16)}...
                    </div>
                    <div className="text-xs text-muted-foreground capitalize">
                      {member.role.replace('org:', '')}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3">
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {member.userPublicKey.slice(0, 16)}...
                  {member.userPublicKey.slice(-8)}
                </code>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {member.joinedAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <Button
                  size="sm"
                  onClick={() => onDistribute(member.membershipId, member.userPublicKey)}
                  disabled={isLoading || distributingMemberId === member.membershipId}
                  className="gap-2"
                >
                  {distributingMemberId === member.membershipId ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Distributing...
                    </>
                  ) : (
                    <>
                      <Key className="h-3 w-3" />
                      Distribute Key
                    </>
                  )}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
