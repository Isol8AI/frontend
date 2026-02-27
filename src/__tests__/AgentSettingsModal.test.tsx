// @vitest-environment jsdom

/**
 * Unit tests for AgentSettingsModal component.
 *
 * Focuses on:
 *  - Loading / error / empty states
 *  - Close confirmation when dirty
 *  - Save button enabled/disabled state
 *  - File selection and editor rendering
 *
 * Self-contained: all deps mocked inline.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Track the mock settings state so tests can control it
const mockSettings = {
  files: [] as Array<{
    path: string;
    content: string;
    originalContent: string;
    size: number;
  }>,
  loading: false,
  saving: false,
  error: null as string | null,
  isDirty: false,
  selectedPath: null as string | null,
  selectFile: vi.fn(),
  updateFileContent: vi.fn(),
  loadFiles: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/hooks/useAgentSettings", () => ({
  useAgentSettings: () => mockSettings,
}));

// Mock AgentFileTree to avoid pulling in its own dependencies
vi.mock("@/components/chat/AgentFileTree", () => ({
  AgentFileTree: (props: {
    files: unknown[];
    selectedPath: string | null;
    onSelectFile: (p: string) => void;
  }) =>
    React.createElement("div", { "data-testid": "file-tree" }, "FileTree"),
}));

// Mock lucide-react
vi.mock("lucide-react", () => ({
  X: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-x", ...props }),
  Loader2: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-loader", ...props }),
  Save: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-save", ...props }),
}));

// Mock @radix-ui/react-dialog -- lightweight pass-through wrappers
vi.mock("@radix-ui/react-dialog", () => {
  const Dialog = {
    Root: ({
      children,
      open,
    }: {
      children: React.ReactNode;
      open: boolean;
      onOpenChange: (v: boolean) => void;
    }) => (open ? React.createElement("div", { "data-testid": "dialog-root" }, children) : null),
    Portal: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", { "data-testid": "dialog-portal" }, children),
    Overlay: (props: Record<string, unknown>) =>
      React.createElement("div", { "data-testid": "dialog-overlay", ...props }),
    Content: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    } & Record<string, unknown>) =>
      React.createElement(
        "div",
        { "data-testid": "dialog-content", ...props },
        children,
      ),
    Title: ({
      children,
      ...props
    }: {
      children: React.ReactNode;
    } & Record<string, unknown>) =>
      React.createElement("h2", { "data-testid": "dialog-title", ...props }, children),
  };
  return Dialog;
});

// Mock @/lib/utils
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import { AgentSettingsModal } from "@/components/chat/AgentSettingsModal";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(
  path: string,
  content = "content",
  originalContent?: string,
) {
  return {
    path,
    content,
    originalContent: originalContent ?? content,
    size: content.length,
  };
}

const defaultProps = {
  agentName: "test-agent",
  open: true,
  onOpenChange: vi.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AgentSettingsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock settings to clean state
    mockSettings.files = [];
    mockSettings.loading = false;
    mockSettings.saving = false;
    mockSettings.error = null;
    mockSettings.isDirty = false;
    mockSettings.selectedPath = null;
  });

  // =========================================================================
  // Rendering when open
  // =========================================================================

  it("should not render when open=false", () => {
    const { container } = render(
      <AgentSettingsModal {...defaultProps} open={false} />,
    );

    expect(container.querySelector("[data-testid='dialog-root']")).toBeNull();
  });

  it("should render when open=true", () => {
    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByTestId("dialog-root")).toBeDefined();
  });

  it("should display agent name in title", () => {
    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByTestId("dialog-title").textContent).toContain(
      "test-agent",
    );
  });

  // =========================================================================
  // Loading state
  // =========================================================================

  it("should show loading spinner when loading=true", () => {
    mockSettings.loading = true;

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("Loading agent files...")).toBeDefined();
    expect(screen.getByTestId("icon-loader")).toBeDefined();
  });

  // =========================================================================
  // Error state
  // =========================================================================

  it("should show error message when error is set", () => {
    mockSettings.error = "Failed to load files";

    render(<AgentSettingsModal {...defaultProps} />);

    expect(
      screen.getByText("Failed to load files"),
    ).toBeDefined();
  });

  // =========================================================================
  // Empty state
  // =========================================================================

  it("should show empty message when no files", () => {
    mockSettings.files = [];
    mockSettings.loading = false;
    mockSettings.error = null;

    render(<AgentSettingsModal {...defaultProps} />);

    expect(
      screen.getByText(
        "No files found. Send a message first to initialize the agent.",
      ),
    ).toBeDefined();
  });

  // =========================================================================
  // Files loaded - file tree and editor
  // =========================================================================

  it("should render file tree and editor when files exist", () => {
    mockSettings.files = [
      makeFile("agents/test/SOUL.md", "You are helpful"),
    ];
    mockSettings.selectedPath = "agents/test/SOUL.md";

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByTestId("file-tree")).toBeDefined();
    // Selected file path should appear in editor header
    expect(screen.getByText("agents/test/SOUL.md")).toBeDefined();
  });

  it("should show 'Select a file to view' when no file selected", () => {
    mockSettings.files = [makeFile("agents/test/SOUL.md")];
    mockSettings.selectedPath = null;

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("Select a file to view")).toBeDefined();
  });

  it("should show (modified) indicator for dirty file", () => {
    mockSettings.files = [
      makeFile("agents/test/SOUL.md", "new content", "old content"),
    ];
    mockSettings.selectedPath = "agents/test/SOUL.md";

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("(modified)")).toBeDefined();
  });

  it("should NOT show (modified) indicator for clean file", () => {
    mockSettings.files = [
      makeFile("agents/test/SOUL.md", "same", "same"),
    ];
    mockSettings.selectedPath = "agents/test/SOUL.md";

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.queryByText("(modified)")).toBeNull();
  });

  // =========================================================================
  // Save button state
  // =========================================================================

  it("should disable Save button when not dirty", () => {
    mockSettings.files = [makeFile("SOUL.md")];
    mockSettings.isDirty = false;

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.disabled).toBe(true);
  });

  it("should enable Save button when dirty", () => {
    mockSettings.files = [makeFile("SOUL.md", "changed", "original")];
    mockSettings.isDirty = true;

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.disabled).toBe(false);
  });

  it("should disable Save button while saving", () => {
    mockSettings.isDirty = true;
    mockSettings.saving = true;

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.disabled).toBe(true);
  });

  it("should call settings.save when Save is clicked", () => {
    mockSettings.isDirty = true;
    mockSettings.saving = false;
    mockSettings.save.mockResolvedValue(undefined);

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    fireEvent.click(saveButton!);

    expect(mockSettings.save).toHaveBeenCalledWith("test-agent");
  });

  // =========================================================================
  // Close / cancel with dirty check
  // =========================================================================

  it("should close without confirm when not dirty", () => {
    mockSettings.isDirty = false;
    const onOpenChange = vi.fn();

    render(
      <AgentSettingsModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("should prompt confirm when closing with dirty changes", () => {
    mockSettings.isDirty = true;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const onOpenChange = vi.fn();

    render(
      <AgentSettingsModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(confirmSpy).toHaveBeenCalledWith(
      "You have unsaved changes. Discard them?",
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);

    confirmSpy.mockRestore();
  });

  it("should NOT close when user cancels the confirm dialog", () => {
    mockSettings.isDirty = true;
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onOpenChange = vi.fn();

    render(
      <AgentSettingsModal {...defaultProps} onOpenChange={onOpenChange} />,
    );

    fireEvent.click(screen.getByText("Cancel"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();

    confirmSpy.mockRestore();
  });

  // =========================================================================
  // loadFiles called on open
  // =========================================================================

  it("should call loadFiles when opened with an agent name", () => {
    render(<AgentSettingsModal {...defaultProps} />);

    expect(mockSettings.loadFiles).toHaveBeenCalledWith("test-agent");
  });

  it("should call reset when dialog closes", () => {
    const { rerender } = render(<AgentSettingsModal {...defaultProps} />);

    rerender(<AgentSettingsModal {...defaultProps} open={false} />);

    expect(mockSettings.reset).toHaveBeenCalled();
  });

  it("should not call loadFiles when agentName is null", () => {
    render(
      <AgentSettingsModal
        agentName={null}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(mockSettings.loadFiles).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Textarea editor interaction
  // =========================================================================

  it("should call updateFileContent when textarea value changes", () => {
    mockSettings.files = [
      makeFile("agents/test/SOUL.md", "You are helpful"),
    ];
    mockSettings.selectedPath = "agents/test/SOUL.md";

    render(<AgentSettingsModal {...defaultProps} />);

    const textarea = document.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "You are very helpful" } });

    expect(mockSettings.updateFileContent).toHaveBeenCalledWith(
      "agents/test/SOUL.md",
      "You are very helpful",
    );
  });

  // =========================================================================
  // Saving spinner in button
  // =========================================================================

  it("should show loader icon in Save button while saving", () => {
    mockSettings.isDirty = true;
    mockSettings.saving = true;

    render(<AgentSettingsModal {...defaultProps} />);

    // The Save button should contain the loader icon
    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.querySelector("[data-testid='icon-loader']")).not.toBeNull();
  });

  it("should show save icon in Save button when not saving", () => {
    mockSettings.isDirty = true;
    mockSettings.saving = false;

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.querySelector("[data-testid='icon-save']")).not.toBeNull();
  });
});
