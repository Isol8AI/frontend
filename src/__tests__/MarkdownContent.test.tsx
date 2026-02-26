// @vitest-environment jsdom

/**
 * Unit tests for MessageList component's markdown rendering.
 *
 * Verifies that assistant messages render markdown (bold, code, links, lists),
 * user messages render as plain text, and error messages strip the "Error: " prefix.
 */

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MessageList } from "@/components/chat/MessageList";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useScrollToBottom hook (returns refs used by MessageList)
vi.mock("@/hooks/useScrollToBottom", () => ({
  useScrollToBottom: () => ({
    containerRef: { current: null },
    endRef: { current: null },
  }),
}));

// Mock react-syntax-highlighter to avoid jsdom rendering issues
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({ children }: { children: string }) =>
    React.createElement("code", null, children),
}));
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
}));

// Mock lucide-react icons to avoid SVG rendering in jsdom
vi.mock("lucide-react", () => ({
  Copy: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-copy", ...props }),
  RefreshCw: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-refresh", ...props }),
  Share2: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-share", ...props }),
  Bot: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "icon-bot", ...props }),
  ChevronDown: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "chevron-down", ...props }),
  ChevronRight: (props: Record<string, unknown>) =>
    React.createElement("span", { "data-testid": "chevron-right", ...props }),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MessageList markdown rendering", () => {
  it("renders plain assistant text", () => {
    render(
      <MessageList
        messages={[{ id: "1", role: "assistant", content: "Hello world" }]}
      />,
    );
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("renders bold text in assistant messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "assistant", content: "This is **bold** text" },
        ]}
      />,
    );
    const bold = screen.getByText("bold");
    expect(bold.tagName).toBe("STRONG");
  });

  it("renders inline code in assistant messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "assistant", content: "Use `console.log`" },
        ]}
      />,
    );
    const code = screen.getByText("console.log");
    expect(code.tagName).toBe("CODE");
  });

  it("renders links with target _blank", () => {
    render(
      <MessageList
        messages={[
          {
            id: "1",
            role: "assistant",
            content: "Visit [Google](https://google.com)",
          },
        ]}
      />,
    );
    const link = screen.getByText("Google");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders unordered lists", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "assistant", content: "- item one\n- item two" },
        ]}
      />,
    );
    expect(screen.getByText("item one")).toBeInTheDocument();
    expect(screen.getByText("item two")).toBeInTheDocument();
  });

  it("does NOT render markdown in user messages", () => {
    render(
      <MessageList
        messages={[
          { id: "1", role: "user", content: "This is **not bold**" },
        ]}
      />,
    );
    // User messages render as plain text, so the asterisks should be literal
    expect(screen.getByText("This is **not bold**")).toBeInTheDocument();
  });

  it("renders error messages as plain text with prefix stripped", () => {
    render(
      <MessageList
        messages={[
          {
            id: "1",
            role: "assistant",
            content: "Error: something broke",
          },
        ]}
      />,
    );
    // The component strips "Error: " prefix (msg.content.slice(7))
    expect(screen.getByText("something broke")).toBeInTheDocument();
  });
});
