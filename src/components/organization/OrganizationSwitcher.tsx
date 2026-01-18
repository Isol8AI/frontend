"use client";

import { useEffect } from "react";
import { OrganizationSwitcher as ClerkOrgSwitcher, useOrganization } from "@clerk/nextjs";

const SWITCHER_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    organizationSwitcherTrigger:
      "w-full justify-between px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  },
} as const;

export function OrganizationSwitcher(): React.ReactElement {
  const { organization, isLoaded } = useOrganization();

  // DEBUG: Log organization changes from Clerk's perspective
  useEffect(() => {
    console.log("[OrganizationSwitcher] Organization state:", {
      isLoaded,
      organizationId: organization?.id ?? null,
      organizationName: organization?.name ?? null,
    });
  }, [organization, isLoaded]);

  // DEBUG: Log component mount/unmount
  useEffect(() => {
    console.log("[OrganizationSwitcher] MOUNTED");
    return () => {
      console.log("[OrganizationSwitcher] UNMOUNTING");
    };
  }, []);

  return (
    <ClerkOrgSwitcher
      hidePersonal={false}
      afterCreateOrganizationUrl="/"
      afterLeaveOrganizationUrl="/"
      appearance={SWITCHER_APPEARANCE}
    />
  );
}
