import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard | Isol8",
  description: "OpenClaw container management dashboard.",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
