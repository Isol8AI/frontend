"use client";

import { createContext, ReactNode, useContext, useEffect, useRef } from "react";
import { useAuth, useOrganization } from "@clerk/nextjs";

import { BACKEND_URL } from "@/lib/api";

interface OrgContextValue {
  orgId: string | null;
  orgName: string | null;
  orgSlug: string | null;
  isOrgContext: boolean;
  isPersonalContext: boolean;
}

const DEFAULT_ORG_CONTEXT: OrgContextValue = {
  orgId: null,
  orgName: null,
  orgSlug: null,
  isOrgContext: false,
  isPersonalContext: true,
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
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const { getToken, isSignedIn } = useAuth();
  const prevOrgIdRef = useRef<string | null | undefined>(undefined);

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
  };

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
