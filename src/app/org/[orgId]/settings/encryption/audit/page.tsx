/**
 * Organization encryption audit log page.
 *
 * Displays a log of all encryption-related events for the organization:
 * - Key creation events
 * - Key distribution events
 * - Key revocation events
 */

'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useAuth, useOrganization } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Lock,
  Loader2,
  AlertCircle,
  FileText,
  RefreshCw,
  Key,
  UserPlus,
  UserMinus,
  Shield,
} from 'lucide-react';
import Link from 'next/link';

interface Props {
  params: Promise<{ orgId: string }>;
}

interface AuditEntry {
  id: string;
  event_type: string;
  target_user_email?: string;
  performed_by_email: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

export default function OrgEncryptionAuditPage({ params }: Props) {
  // In Next.js 15+, params is a Promise - use React's use() hook
  const resolvedParams = use(params);
  const { getToken } = useAuth();
  const { organization, membership } = useOrganization();

  const [isLoading, setIsLoading] = useState(true);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = membership?.role === 'org:admin';

  // Load audit log
  const loadAuditLog = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(
        `${BACKEND_URL}/organizations/${resolvedParams.orgId}/encryption-audit`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to load audit log');
      }

      const data = await res.json();
      setAuditEntries(data.audit_entries || []);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error loading audit log';
      setError(message);
      console.error('Failed to load audit log:', e);
    } finally {
      setIsLoading(false);
    }
  }, [resolvedParams.orgId, getToken]);

  useEffect(() => {
    if (isAdmin) {
      loadAuditLog();
    } else {
      setIsLoading(false);
    }
  }, [isAdmin, loadAuditLog]);

  // Get icon for event type
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case 'org_keys_created':
        return <Shield className="h-4 w-4 text-green-600" />;
      case 'key_distributed':
        return <UserPlus className="h-4 w-4 text-blue-600" />;
      case 'key_revoked':
        return <UserMinus className="h-4 w-4 text-red-600" />;
      default:
        return <Key className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Format event type for display
  const formatEventType = (eventType: string) => {
    return eventType
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
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
          <Link href={`/org/${resolvedParams.orgId}/settings/encryption`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-semibold">Encryption Audit Log</h1>
        </div>

        <div className="p-6 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <div className="flex items-center gap-3">
            <Lock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            <div>
              <h2 className="font-semibold text-yellow-800 dark:text-yellow-200">
                Admin Access Required
              </h2>
              <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                Only organization administrators can view the encryption audit log.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Link href={`/org/${resolvedParams.orgId}/settings/encryption`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-semibold">Encryption Audit Log</h1>
            <p className="text-sm text-muted-foreground">
              {organization?.name || 'Organization'}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={loadAuditLog} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-5 w-5" />
          {error}
        </div>
      )}

      {/* Audit log table */}
      {auditEntries.length === 0 ? (
        <div className="p-8 bg-muted/30 rounded-lg text-center">
          <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground">No audit entries found.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Encryption-related events will appear here.
          </p>
        </div>
      ) : (
        <div data-testid="audit-log-table" className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium">Event</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Target User</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Performed By</th>
                <th className="px-4 py-3 text-left text-sm font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {auditEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getEventIcon(entry.event_type)}
                      <span className="text-sm font-medium">
                        {entry.event_type}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {entry.target_user_email || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {entry.performed_by_email}
                  </td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
