"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useApi } from "@/lib/api";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  const { isSignedIn } = useAuth();
  const api = useApi();

  useEffect(() => {
    if (isSignedIn) {
      api.syncUser()
        .then((data) => console.log("User sync:", data))
        .catch((err) => console.error("User sync failed:", err));
    }
  }, [isSignedIn]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar className="w-64 hidden md:flex border-r" />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header - Simple Mobile Menu Toggler could go here */}
        <header className="h-14 border-b flex items-center justify-end px-4">
             <UserButton />
        </header>
        
        <div className="flex-1 overflow-auto">
            {children}
        </div>
      </main>
    </div>
  );
}
