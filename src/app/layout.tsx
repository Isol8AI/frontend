import type { Metadata } from "next";
import { Geist, Geist_Mono, Host_Grotesk, DM_Sans } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OrganizationProvider } from "@/components/providers/OrganizationProvider";
import { EncryptionProvider } from "@/hooks/useEncryption";
import { SmoothScroll } from "@/components/providers/SmoothScroll";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "isol8 - Secure AI Enclaves",
  description: "End-to-end encrypted AI inference running in secure Nitro Enclaves.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body
          className={`${geistSans.variable} ${geistMono.variable} ${hostGrotesk.variable} ${dmSans.variable} antialiased`}
        >
          <ErrorBoundary>
            <SmoothScroll>
              <OrganizationProvider>
                <EncryptionProvider>{children}</EncryptionProvider>
              </OrganizationProvider>
            </SmoothScroll>
          </ErrorBoundary>
        </body>
      </html>
    </ClerkProvider>
  );
}
