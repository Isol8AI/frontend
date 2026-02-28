// @vitest-environment jsdom

/**
 * Unit tests for AgentSettingsModal component.
 *
 * Focuses on:
 *  - Loading / error states
 *  - SOUL.md editor rendering
 *  - Close confirmation when dirty
 *  - Save button enabled/disabled state
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
  soulContent: "",
  originalSoulContent: "",
  loading: false,
  saving: false,
  error: null as string | null,
  isDirty: false,
  setSoulContent: vi.fn(),
  loadAgent: vi.fn(),
  save: vi.fn(),
  reset: vi.fn(),
};

vi.mock("@/hooks/useAgentSettings", () => ({
  useAgentSettings: () => mockSettings,
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
    mockSettings.soulContent = "";
    mockSettings.originalSoulContent = "";
    mockSettings.loading = false;
    mockSettings.saving = false;
    mockSettings.error = null;
    mockSettings.isDirty = false;
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

    expect(screen.getByText("Loading agent settings...")).toBeDefined();
    expect(screen.getByTestId("icon-loader")).toBeDefined();
  });

  // =========================================================================
  // Error state
  // =========================================================================

  it("should show error message when error is set", () => {
    mockSettings.error = "Failed to load agent";

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("Failed to load agent")).toBeDefined();
  });

  it("should show Try again button on error", () => {
    mockSettings.error = "Failed to load agent";

    render(<AgentSettingsModal {...defaultProps} />);

    const tryAgain = screen.getByText("Try again");
    expect(tryAgain).toBeDefined();

    fireEvent.click(tryAgain);
    expect(mockSettings.loadAgent).toHaveBeenCalledWith("test-agent");
  });

  // =========================================================================
  // SOUL.md editor
  // =========================================================================

  it("should render textarea editor when loaded", () => {
    mockSettings.soulContent = "You are helpful";

    render(<AgentSettingsModal {...defaultProps} />);

    const textarea = document.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe("You are helpful");
  });

  it("should show SOUL.md label", () => {
    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("SOUL.md")).toBeDefined();
  });

  it("should show (modified) indicator when dirty", () => {
    mockSettings.isDirty = true;

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.getByText("(modified)")).toBeDefined();
  });

  it("should NOT show (modified) indicator when clean", () => {
    mockSettings.isDirty = false;

    render(<AgentSettingsModal {...defaultProps} />);

    expect(screen.queryByText("(modified)")).toBeNull();
  });

  it("should call setSoulContent when textarea value changes", () => {
    mockSettings.soulContent = "You are helpful";

    render(<AgentSettingsModal {...defaultProps} />);

    const textarea = document.querySelector("textarea");
    expect(textarea).not.toBeNull();

    fireEvent.change(textarea!, { target: { value: "You are very helpful" } });

    expect(mockSettings.setSoulContent).toHaveBeenCalledWith(
      "You are very helpful",
    );
  });

  // =========================================================================
  // Save button state
  // =========================================================================

  it("should disable Save button when not dirty", () => {
    mockSettings.isDirty = false;

    render(<AgentSettingsModal {...defaultProps} />);

    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton?.disabled).toBe(true);
  });

  it("should enable Save button when dirty", () => {
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
  // loadAgent called on open
  // =========================================================================

  it("should call loadAgent when opened with an agent name", () => {
    render(<AgentSettingsModal {...defaultProps} />);

    expect(mockSettings.loadAgent).toHaveBeenCalledWith("test-agent");
  });

  it("should call reset when dialog closes", () => {
    const { rerender } = render(<AgentSettingsModal {...defaultProps} />);

    rerender(<AgentSettingsModal {...defaultProps} open={false} />);

    expect(mockSettings.reset).toHaveBeenCalled();
  });

  it("should not call loadAgent when agentName is null", () => {
    render(
      <AgentSettingsModal
        agentName={null}
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(mockSettings.loadAgent).not.toHaveBeenCalled();
  });

  // =========================================================================
  // Saving spinner in button
  // =========================================================================

  it("should show loader icon in Save button while saving", () => {
    mockSettings.isDirty = true;
    mockSettings.saving = true;

    render(<AgentSettingsModal {...defaultProps} />);

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
