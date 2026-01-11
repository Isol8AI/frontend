"use client";

import { OrganizationSwitcher as ClerkOrgSwitcher } from "@clerk/nextjs";

const SWITCHER_APPEARANCE = {
  elements: {
    rootBox: "w-full",
    organizationSwitcherTrigger:
      "w-full justify-between px-3 py-2 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground",
  },
} as const;

export function OrganizationSwitcher(): React.ReactElement {
  return (
    <ClerkOrgSwitcher
      hidePersonal={false}
      afterCreateOrganizationUrl="/"
      afterLeaveOrganizationUrl="/"
      afterSelectOrganizationUrl="/"
      afterSelectPersonalUrl="/"
      appearance={SWITCHER_APPEARANCE}
    />
  );
}
