// @vitest-environment jsdom

/**
 * Unit tests for AgentFileTree component.
 *
 * Tests the buildTree logic, sorting (dirs before files, alphabetical),
 * expand/collapse behavior, selection, and dirty indicator -- all via
 * component rendering (buildTree/sortNodes are not exported).
 *
 * Self-contained: no shared setup.ts required.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgentFileTree } from "@/components/chat/AgentFileTree";
import type { AgentFile } from "@/hooks/useAgentSettings";

// ---------------------------------------------------------------------------
// Mock lucide-react icons so we don't pull in SVG rendering
// ---------------------------------------------------------------------------

vi.mock("lucide-react", () => ({
  ChevronRight: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "chevron-right", ...props }),
  ChevronDown: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "chevron-down", ...props }),
  File: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-file", ...props }),
  Folder: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-folder", ...props }),
}));

// Mock @/lib/utils (cn)
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  content = "content",
  originalContent?: string,
): AgentFile {
  return {
    path,
    content,
    originalContent: originalContent ?? content,
    size: new TextEncoder().encode(content).length,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentFileTree", () => {
  const onSelectFile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Basic rendering
  // =========================================================================

  it("should render file names from flat paths", () => {
    const files = [makeFile("README.md"), makeFile("config.json")];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    expect(screen.getByText("README.md")).toBeDefined();
    expect(screen.getByText("config.json")).toBeDefined();
  });

  it("should render nested directory structure", () => {
    const files = [
      makeFile("agents/bot/SOUL.md"),
      makeFile("agents/bot/memory/facts.json"),
      makeFile("openclaw.json"),
    ];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    expect(screen.getByText("agents")).toBeDefined();
    expect(screen.getByText("bot")).toBeDefined();
    expect(screen.getByText("SOUL.md")).toBeDefined();
    expect(screen.getByText("memory")).toBeDefined();
    expect(screen.getByText("facts.json")).toBeDefined();
    expect(screen.getByText("openclaw.json")).toBeDefined();
  });

  // =========================================================================
  // Sorting: directories before files, alphabetical within type
  // =========================================================================

  it("should render directories before files at same level", () => {
    const files = [
      makeFile("zebra.txt"),
      makeFile("agents/bot/SOUL.md"),
      makeFile("apple.txt"),
    ];

    const { container } = render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Get all top-level button texts
    const buttons = container.querySelectorAll(
      ":scope > div > div > button",
    );
    const topTexts: string[] = [];
    buttons.forEach((btn) => {
      const span = btn.querySelector("span.truncate");
      if (span) topTexts.push(span.textContent!);
    });

    // "agents" directory should come before files
    const agentsIdx = topTexts.indexOf("agents");
    const appleIdx = topTexts.indexOf("apple.txt");
    const zebraIdx = topTexts.indexOf("zebra.txt");

    expect(agentsIdx).toBeLessThan(appleIdx);
    expect(appleIdx).toBeLessThan(zebraIdx);
  });

  // =========================================================================
  // File selection
  // =========================================================================

  it("should call onSelectFile when clicking a file", () => {
    const files = [makeFile("SOUL.md"), makeFile("config.json")];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    fireEvent.click(screen.getByText("SOUL.md"));
    expect(onSelectFile).toHaveBeenCalledWith("SOUL.md");
  });

  it("should not call onSelectFile when clicking a directory", () => {
    const files = [makeFile("agents/bot/SOUL.md")];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    fireEvent.click(screen.getByText("agents"));
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Expand / collapse directories
  // =========================================================================

  it("should start with all directories expanded", () => {
    const files = [makeFile("agents/bot/SOUL.md")];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // The leaf file should be visible since parent dirs are expanded
    expect(screen.getByText("SOUL.md")).toBeDefined();
  });

  it("should collapse a directory on click and hide children", () => {
    const files = [
      makeFile("agents/bot/SOUL.md"),
      makeFile("agents/bot/memory/facts.json"),
    ];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Initially SOUL.md should be visible
    expect(screen.getByText("SOUL.md")).toBeDefined();

    // Click "agents" to collapse
    fireEvent.click(screen.getByText("agents"));

    // Children should be hidden
    expect(screen.queryByText("bot")).toBeNull();
    expect(screen.queryByText("SOUL.md")).toBeNull();
  });

  it("should re-expand a collapsed directory on second click", () => {
    const files = [makeFile("agents/bot/SOUL.md")];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Collapse
    fireEvent.click(screen.getByText("agents"));
    expect(screen.queryByText("SOUL.md")).toBeNull();

    // Re-expand
    fireEvent.click(screen.getByText("agents"));
    expect(screen.getByText("SOUL.md")).toBeDefined();
  });

  // =========================================================================
  // Dirty indicator (asterisk)
  // =========================================================================

  it("should show dirty indicator (*) when file content differs from original", () => {
    const files = [
      makeFile("SOUL.md", "modified content", "original content"),
    ];

    const { container } = render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    const asterisk = container.querySelector("span.text-amber-400");
    expect(asterisk).not.toBeNull();
    expect(asterisk!.textContent).toBe("*");
  });

  it("should NOT show dirty indicator when content matches original", () => {
    const files = [makeFile("SOUL.md", "same content", "same content")];

    const { container } = render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    const asterisk = container.querySelector("span.text-amber-400");
    expect(asterisk).toBeNull();
  });

  // =========================================================================
  // Selected path highlighting
  // =========================================================================

  it("should apply selected style to the matching file button", () => {
    const files = [makeFile("SOUL.md"), makeFile("config.json")];

    const { container } = render(
      <AgentFileTree
        files={files}
        selectedPath="SOUL.md"
        onSelectFile={onSelectFile}
      />,
    );

    const buttons = container.querySelectorAll("button");
    const soulButton = Array.from(buttons).find((btn) =>
      btn.textContent?.includes("SOUL.md"),
    );

    expect(soulButton?.className).toContain("bg-accent");
  });

  // =========================================================================
  // Empty files list
  // =========================================================================

  it("should render nothing when files array is empty", () => {
    const { container } = render(
      <AgentFileTree
        files={[]}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(0);
  });

  // =========================================================================
  // Shared directory nodes for files with common path prefixes
  // =========================================================================

  it("should group files under shared directory nodes", () => {
    const files = [
      makeFile("agents/bot/SOUL.md"),
      makeFile("agents/bot/config.yaml"),
      makeFile("agents/other/SOUL.md"),
    ];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // "agents" should appear once (as a directory), not multiple times
    const allTexts = screen.getAllByText("agents");
    expect(allTexts).toHaveLength(1);

    // "bot" and "other" should both be present
    expect(screen.getByText("bot")).toBeDefined();
    expect(screen.getByText("other")).toBeDefined();
  });

  // =========================================================================
  // Nested collapse: collapsing parent hides grandchildren
  // =========================================================================

  it("collapsing a mid-level directory should hide only that subtree", () => {
    const files = [
      makeFile("agents/bot/SOUL.md"),
      makeFile("agents/bot/memory/facts.json"),
      makeFile("openclaw.json"),
    ];

    render(
      <AgentFileTree
        files={files}
        selectedPath={null}
        onSelectFile={onSelectFile}
      />,
    );

    // Collapse "bot" subtree
    fireEvent.click(screen.getByText("bot"));

    // bot's children should be hidden
    expect(screen.queryByText("SOUL.md")).toBeNull();
    expect(screen.queryByText("memory")).toBeNull();
    expect(screen.queryByText("facts.json")).toBeNull();

    // "agents" and "openclaw.json" should still be visible
    expect(screen.getByText("agents")).toBeDefined();
    expect(screen.getByText("openclaw.json")).toBeDefined();
  });
});
