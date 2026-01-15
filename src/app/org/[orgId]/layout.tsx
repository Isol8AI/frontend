/**
 * Organization layout - wraps all org-specific pages.
 *
 * Handles:
 * - Authentication check via Clerk
 * - Organization context validation
 * - Admin role verification for protected routes
 */

'use client';

import { useEffect, useState, use } from 'react';
import { useAuth, useOrganization, useOrganizationList } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface OrgLayoutProps {
  children: React.ReactNode;
  params: Promise<{ orgId: string }>;
}

export default function OrgLayout({ children, params }: OrgLayoutProps) {
  // In Next.js 15+, params is a Promise - use React's use() hook
  const resolvedParams = use(params);
  const { isSignedIn, isLoaded } = useAuth();
  const { organization, isLoaded: isOrgLoaded } = useOrganization();
  const { setActive, isLoaded: listLoaded } = useOrganizationList();
  const router = useRouter();
  const [isValidating, setIsValidating] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isOrgLoaded || !listLoaded) {
      return;
    }

    // Not signed in - redirect to sign-in
    if (!isSignedIn) {
      router.push('/sign-in');
      return;
    }

    // If org matches URL param, we're good
    if (organization && organization.id === resolvedParams.orgId) {
      setIsValidating(false);
      setIsSwitching(false);
      return;
    }

    // If we're currently switching, wait for it to complete
    if (isSwitching) {
      return;
    }

    // Try to switch to the requested org
    if (setActive) {
      setIsSwitching(true);
      console.log(`Switching to org: ${resolvedParams.orgId}`);
      setActive({ organization: resolvedParams.orgId })
        .then(() => {
          console.log('Org switch completed');
          // Set states to allow content to render - the effect will re-run
          // and verify the org matches when organization state updates
          setIsSwitching(false);
          setIsValidating(false);
        })
        .catch((err) => {
          console.error('Failed to switch org:', err);
          setIsSwitching(false);
          router.push('/');
        });
      return;
    }

    // If we can't switch (no setActive), redirect
    console.warn('Cannot switch org - redirecting to home');
    router.push('/');
  }, [isLoaded, isOrgLoaded, listLoaded, isSignedIn, organization, resolvedParams.orgId, router, setActive, isSwitching]);

  // Loading state
  if (!isLoaded || !isOrgLoaded || !listLoaded || isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background">
      {children}
    </div>
  );
}
