"use client";

import { useRef } from "react";

export function useScrollToBottom() {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Minimal hook - just provide refs, let native CSS handle scrolling
  return {
    containerRef,
    endRef,
  };
}
