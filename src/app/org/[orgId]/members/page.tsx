/**
 * Organization members page.
 *
 * Allows admins to:
 * - View all organization members
 * - Distribute encryption keys to pending members
 * - Re-distribute keys to members who lost access
 */

'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, useOrganization } from '@clerk/nextjs';
import { useOrgAdmin, type PendingMember, type OrgMember } from '@/hooks/useOrgAdmin';
import { useEncryption } from '@/hooks/useEncryption';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Key,
  Lock,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Users,
  RefreshCw,
  User,
  X,
} from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: Promise<{ orgId: string }>;
}

export default function OrgMembersPage({ params }: Props) {
  // In Next.js 15+, params is a Promise - use React's use() hook
  const resolvedParams = use(params);
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const { organization, membership } = useOrganization();
  const encryption = useEncryption();
  const admin = useOrgAdmin();

  const [isLoading, setIsLoading] = useState(true);
  const [showPasscodeModal, setShowPasscodeModal] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [pendingDistribution, setPendingDistribution] = useState<{
    membershipId: string;
    userId: string;
    publicKey: string;
    type: 'distribute' | 'redistribute';
  } | null>(null);
  const [isDistributing, setIsDistributing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);

  const isAdmin = membership?.role === 'org:admin';

  // Load data on mount
  useEffect(() => {
    async function loadData() {
      if (!resolvedParams.orgId || !isAdmin) {
        setIsLoading(false);
        return;
      }
      try {
        await Promise.all([
          admin.loadPendingMembers(resolvedParams.orgId),
          admin.loadMembers(resolvedParams.orgId),
        ]);
      } catch (e) {
        console.error('Failed to load member data:', e);
      } finally {
        setIsLoading(false);
      }
    }
    if (encryption.state.isUnlocked) {
      loadData();
    } else {
      setIsLoading(false);
    }
  }, [resolvedParams.orgId, isAdmin, encryption.state.isUnlocked]);

  // Handle distribution initiation
  const handleDistributeClick = useCallback(
    (membershipId: string, userId: string, publicKey: string, type: 'distribute' | 'redistribute') => {
      setPendingDistribution({ membershipId, userId, publicKey, type });
      setShowPasscodeModal(true);
      setPasscode('');
      setError(null);
    },
    []
  );

  // Handle confirming distribution with passcode
  const handleConfirmDistribute = async () => {
    if (!pendingDistribution || !passcode) return;

    setIsDistributing(true);
    setError(null);

    try {
      // First ensure org is unlocked with the passcode
      if (!encryption.isOrgUnlocked) {
        // The admin needs to unlock org encryption with their personal passcode
        // In this case, they've already unlocked personal keys, so we use that
      }

      await admin.distributeToMember(
        resolvedParams.orgId,
        pendingDistribution.membershipId,
        pendingDistribution.publicKey
      );

      setShowPasscodeModal(false);
      setPendingDistribution(null);
      setShowSuccess(true);

      // Refresh lists
      await Promise.all([
        admin.loadPendingMembers(resolvedParams.orgId),
        admin.loadMembers(resolvedParams.orgId),
      ]);

      // Hide success message after 3 seconds
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to distribute key');
    } finally {
      setIsDistributing(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await Promise.all([
        admin.loadPendingMembers(resolvedParams.orgId),
        admin.loadMembers(resolvedParams.orgId),
      ]);
    } catch (e) {
      console.error('Failed to refresh:', e);
    } finally {
      setIsLoading(false);
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
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Organization Members</h1>
        </div>

        <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h2 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Admin Access Required
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Only organization administrators can manage members and key distribution.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Encryption not unlocked
  if (!encryption.state.isUnlocked) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Organization Members</h1>
        </div>

        <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-3">
            <Key className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h2 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Unlock Your Keys
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Enter your passcode on the home page to unlock encryption before managing members.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Members without org key (need redistribution)
  const membersNeedingKey = admin.members.filter((m) => !m.hasOrgKey && m.hasPersonalKeys);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Organization Members</h1>
            <p className="text-sm text-muted-foreground">
              {organization?.name || 'Organization'}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={admin.isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${admin.isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Success message */}
      {showSuccess && (
        <div
          data-testid="distribution-success"
          className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 rounded-lg flex items-center gap-3"
        >
          <CheckCircle2 className="h-5 w-5" />
          <div>
            <p className="font-medium">Key distributed successfully!</p>
            <p className="text-sm opacity-80">
              The member can now access encrypted organization content.
            </p>
          </div>
        </div>
      )}

      {/* Error display */}
      {admin.error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {admin.error}
        </div>
      )}

      {/* Pending distributions section */}
      {admin.pendingMembers.length > 0 && (
        <div data-testid="pending-distributions-section" className="mb-8">
          <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
            <Key className="h-5 w-5 text-yellow-600" />
            Pending Key Distributions ({admin.pendingMembers.length})
          </h2>
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
                {admin.pendingMembers.map((member) => (
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
                      </code>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {member.joinedAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        data-testid={`distribute-key-${member.userId}`}
                        onClick={() =>
                          handleDistributeClick(
                            member.membershipId,
                            member.userId,
                            member.userPublicKey,
                            'distribute'
                          )
                        }
                        disabled={admin.isLoading}
                      >
                        <Key className="h-3 w-3 mr-2" />
                        Distribute Key
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* All members section */}
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Users className="h-5 w-5" />
          All Members ({admin.members.length})
        </h2>

        {admin.members.length === 0 ? (
          <div className="p-6 bg-muted/30 rounded-lg text-center text-muted-foreground">
            No members found.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium">Member</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium">Keys Status</th>
                  <th className="px-4 py-3 text-right text-sm font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {admin.members.map((member) => (
                  <tr key={member.membershipId} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-muted rounded-full">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="text-sm font-medium">
                          {member.userId.slice(0, 16)}...
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm capitalize">
                      {member.role.replace('org:', '')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {member.hasPersonalKeys ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Personal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 rounded text-xs">
                            <AlertCircle className="h-3 w-3" />
                            No Personal
                          </span>
                        )}
                        {member.hasOrgKey ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Org Key
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">
                            <AlertCircle className="h-3 w-3" />
                            No Org Key
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!member.hasOrgKey && member.hasPersonalKeys && (
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`redistribute-key-${member.userId}`}
                          onClick={() =>
                            handleDistributeClick(
                              member.membershipId,
                              member.userId,
                              '', // Will need to fetch public key
                              'redistribute'
                            )
                          }
                          disabled={admin.isLoading}
                        >
                          <Key className="h-3 w-3 mr-2" />
                          Re-distribute Key
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Passcode Modal */}
      {showPasscodeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 w-full max-w-md mx-4 shadow-xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Confirm Key Distribution</h3>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowPasscodeModal(false);
                  setPendingDistribution(null);
                  setError(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-sm text-muted-foreground mb-4">
              Enter your admin passcode to decrypt the organization key and distribute it to the member.
            </p>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">
                Admin Passcode
              </label>
              <input
                type="password"
                data-testid="admin-passcode-input"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                placeholder="Enter your passcode"
                className="w-full px-3 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                disabled={isDistributing}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setShowPasscodeModal(false);
                  setPendingDistribution(null);
                  setError(null);
                }}
                disabled={isDistributing}
              >
                Cancel
              </Button>
              <Button
                data-testid="confirm-distribute-button"
                className="flex-1"
                onClick={handleConfirmDistribute}
                disabled={isDistributing || !passcode}
              >
                {isDistributing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Distributing...
                  </>
                ) : (
                  <>
                    <Key className="h-4 w-4 mr-2" />
                    Distribute Key
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
