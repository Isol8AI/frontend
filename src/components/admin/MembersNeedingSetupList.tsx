/**
 * List of organization members who need to set up personal encryption.
 *
 * These members have joined the organization but haven't configured
 * their personal encryption keys yet. They cannot receive org keys
 * until they complete personal setup.
 */

'use client';

import React from 'react';
import { Clock, User } from 'lucide-react';

interface MemberNeedingSetup {
  membershipId: string;
  userId: string;
  role: string;
  joinedAt: Date;
}

interface Props {
  members: MemberNeedingSetup[];
}

export function MembersNeedingSetupList({ members }: Props) {
  return (
    <div className="border rounded-lg overflow-hidden border-amber-200 dark:border-amber-800">
      <table className="w-full">
        <thead className="bg-amber-50 dark:bg-amber-900/30">
          <tr>
            <th className="px-4 py-3 text-left text-sm font-medium text-amber-800 dark:text-amber-200">
              Member
            </th>
            <th className="px-4 py-3 text-left text-sm font-medium text-amber-800 dark:text-amber-200">
              Joined
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium text-amber-800 dark:text-amber-200">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-100 dark:divide-amber-800">
          {members.map((member) => (
            <tr key={member.membershipId} className="hover:bg-amber-50/50 dark:hover:bg-amber-900/20">
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-amber-100 dark:bg-amber-800 rounded-full">
                    <User className="h-4 w-4 text-amber-600 dark:text-amber-300" />
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
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {member.joinedAt.toLocaleDateString()}
              </td>
              <td className="px-4 py-3 text-right">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-100 dark:bg-amber-800/50 text-amber-700 dark:text-amber-300">
                  <Clock className="h-3 w-3" />
                  Awaiting Setup
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
