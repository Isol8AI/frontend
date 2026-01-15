"use client";

import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useAuth, useOrganization, useOrganizationList } from "@clerk/nextjs";

import { BACKEND_URL } from "@/lib/api";

interface OrgContextValue {
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  isOrgContext: boolean;
  isPersonalContext: boolean;
  isOrgAdmin: boolean;
}

const DEFAULT_ORG_CONTEXT: OrgContextValue = {
  orgId: null,
  orgName: null,
  orgSlug: null,
  isOrgContext: false,
  isPersonalContext: true,
  isOrgAdmin: false,
};

const OrgContext = createContext<OrgContextValue>(DEFAULT_ORG_CONTEXT);

export function useOrgContext(): OrgContextValue {
  return useContext(OrgContext);
}

interface OrganizationProviderProps {
  children: ReactNode;
}

function dispatchOrgContextEvent(detail: {
  orgId: string | null;
  orgName?: string;
  isPersonalContext: boolean;
}): void {
  window.dispatchEvent(new CustomEvent("orgContextChanged", { detail }));
}

export function OrganizationProvider({ children }: OrganizationProviderProps): React.ReactElement {
  const { organization, membership, isLoaded: orgLoaded } = useOrganization();
  const { getToken, isSignedIn, isLoaded: authLoaded } = useAuth();
  const { setActive, userMemberships, isLoaded: membershipsLoaded } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const prevOrgIdRef = useRef<string | null | undefined>(undefined);
  const hasAutoActivatedRef = useRef(false);

  // Auto-activate first org when user signs in (if they have memberships)
  // This makes org context the default, with personal mode secondary
  useEffect(() => {
    // Wait for all data to load
    if (!authLoaded || !orgLoaded || !membershipsLoaded) return;
    if (!isSignedIn) return;

    // Only auto-activate once per session
    if (hasAutoActivatedRef.current) return;

    // If no org is active and user has memberships, activate first org
    if (!organization && userMemberships.data && userMemberships.data.length > 0 && setActive) {
      hasAutoActivatedRef.current = true;
      const firstOrg = userMemberships.data[0].organization;
      console.log(`Auto-activating organization: ${firstOrg.name} (${firstOrg.id})`);
      setActive({ organization: firstOrg.id });
    }
  }, [authLoaded, orgLoaded, membershipsLoaded, isSignedIn, organization, userMemberships.data, setActive]);

  // Sync organization with backend when it changes
  useEffect(() => {
    if (!orgLoaded || !isSignedIn) return;

    const currentOrgId = organization?.id ?? null;

    // Skip if org hasn't changed (initial load is undefined -> null/id)
    if (prevOrgIdRef.current === currentOrgId) return;
    prevOrgIdRef.current = currentOrgId;

    async function syncOrganization(): Promise<void> {
      if (!organization) {
        dispatchOrgContextEvent({ orgId: null, isPersonalContext: true });
        return;
      }

      try {
        const token = await getToken();
        if (!token) return;

        // Ensure user exists before org sync (prevents FK violation race condition)
        await fetch(`${BACKEND_URL}/users/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        const response = await fetch(`${BACKEND_URL}/organizations/sync`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            org_id: organization.id,
            name: organization.name,
            slug: organization.slug,
          }),
        });

        if (response.ok) {
          dispatchOrgContextEvent({
            orgId: organization.id,
            orgName: organization.name,
            isPersonalContext: false,
          });
        }
      } catch (err) {
        console.error("Failed to sync organization:", err);
      }
    }

    syncOrganization();
  }, [organization, orgLoaded, isSignedIn, getToken]);

  const value: OrgContextValue = {
    orgId: organization?.id ?? null,
    orgName: organization?.name ?? null,
    orgSlug: organization?.slug ?? null,
    isOrgContext: !!organization,
    isPersonalContext: !organization,
    isOrgAdmin: membership?.role === "org:admin",
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
