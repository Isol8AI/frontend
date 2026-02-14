// @vitest-environment jsdom

/**
 * Unit tests for useAgentSettings hook.
 *
 * Self-contained: all external deps are mocked inline (no shared setup.ts).
 * Uses jsdom environment for React hook rendering via @testing-library/react.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks - declared BEFORE imports that use them
// ---------------------------------------------------------------------------

// Mock @clerk/nextjs
const mockGetToken = vi.fn();
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ getToken: mockGetToken }),
}));

// Mock @/hooks/useEncryption
const mockEncryption = {
  state: {
    isUnlocked: true,
    publicKey: "aabbccdd",
    enclavePublicKey: "eeff0011",
  },
  getPrivateKey: vi.fn(() => "deadbeef"),
  generateTransportKeypair: vi.fn(() => ({
    publicKey: "transport-pub-key-hex",
    privateKey: "transport-priv-key-hex",
  })),
  decryptTransportResponse: vi.fn(
    () => '[{"path":"agents/test/SOUL.md","content":"hello world"}]',
  ),
};

vi.mock("@/hooks/useEncryption", () => ({
  useEncryption: () => mockEncryption,
}));

// Mock @/lib/api
vi.mock("@/lib/api", () => ({
  BACKEND_URL: "http://test-api:8000/api/v1",
}));

// Mock @/lib/crypto/primitives
const mockDecryptWithPrivateKey = vi.fn(
  () => new Uint8Array([1, 2, 3]), // fake gzipped bytes
);
const mockEncryptToPublicKey = vi.fn(() => ({
  ephemeralPublicKey: new Uint8Array([10]),
  iv: new Uint8Array([20]),
  ciphertext: new Uint8Array([30]),
  authTag: new Uint8Array([40]),
  hkdfSalt: new Uint8Array([50]),
}));
const mockHexToBytes = vi.fn((hex: string) => new Uint8Array([0]));
const mockBytesToHex = vi.fn(() => "aa");

vi.mock("@/lib/crypto/primitives", () => ({
  decryptWithPrivateKey: mockDecryptWithPrivateKey,
  encryptToPublicKey: mockEncryptToPublicKey,
  hexToBytes: mockHexToBytes,
  bytesToHex: mockBytesToHex,
}));

// Mock pako
vi.mock("pako", () => ({
  inflate: vi.fn(
    () =>
      // Return fake tar bytes (will be passed to extractTar)
      new Uint8Array([0]),
  ),
  deflate: vi.fn(() => new Uint8Array([99])),
}));

// Mock @/lib/tar
vi.mock("@/lib/tar", () => ({
  extractTar: vi.fn(() => [
    {
      path: "agents/myagent/SOUL.md",
      content: new TextEncoder().encode("You are a helpful agent."),
    },
    {
      path: "openclaw.json",
      content: new TextEncoder().encode('{"version":"1.0"}'),
    },
  ]),
  createTar: vi.fn(() => new Uint8Array([88])),
}));

// Global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { useAgentSettings } from "@/hooks/useAgentSettings";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function makeErrorResponse(status: number, detail?: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ detail: detail ?? "error" }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useAgentSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockResolvedValue("test-token");
    mockEncryption.state.isUnlocked = true;
    mockEncryption.state.publicKey = "aabbccdd";
    mockEncryption.state.enclavePublicKey = "eeff0011";
    mockEncryption.getPrivateKey.mockReturnValue("deadbeef");
  });

  // =========================================================================
  // Initial state
  // =========================================================================

  it("should return initial state", () => {
    const { result } = renderHook(() => useAgentSettings());

    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isDirty).toBe(false);
    expect(result.current.selectedPath).toBeNull();
  });

  // =========================================================================
  // selectFile
  // =========================================================================

  it("selectFile should update selectedPath", () => {
    const { result } = renderHook(() => useAgentSettings());

    act(() => {
      result.current.selectFile("agents/test/SOUL.md");
    });

    expect(result.current.selectedPath).toBe("agents/test/SOUL.md");
  });

  // =========================================================================
  // updateFileContent
  // =========================================================================

  it("updateFileContent should update content and mark dirty", async () => {
    // First load files to have something to update
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.files.length).toBeGreaterThan(0);
    expect(result.current.isDirty).toBe(false);

    const firstFile = result.current.files[0];

    act(() => {
      result.current.updateFileContent(firstFile.path, "new content");
    });

    const updatedFile = result.current.files.find(
      (f) => f.path === firstFile.path,
    );
    expect(updatedFile!.content).toBe("new content");
    expect(updatedFile!.originalContent).toBe(firstFile.originalContent);
    expect(result.current.isDirty).toBe(true);
  });

  it("updateFileContent should recalculate byte size", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    const firstFile = result.current.files[0];

    act(() => {
      result.current.updateFileContent(firstFile.path, "abc");
    });

    const updated = result.current.files.find(
      (f) => f.path === firstFile.path,
    );
    expect(updated!.size).toBe(new TextEncoder().encode("abc").length);
  });

  // =========================================================================
  // reset
  // =========================================================================

  it("reset should clear all state", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.files.length).toBeGreaterThan(0);

    act(() => {
      result.current.reset();
    });

    expect(result.current.files).toEqual([]);
    expect(result.current.selectedPath).toBeNull();
    expect(result.current.error).toBeNull();
  });

  // =========================================================================
  // loadFiles - zero_trust mode
  // =========================================================================

  it("loadFiles (zero_trust) should decrypt, inflate, extract, and set files", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aaa",
          iv: "bbb",
          ciphertext: "ccc",
          auth_tag: "ddd",
          hkdf_salt: "eee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.files).toHaveLength(2);
    expect(result.current.files[0].path).toBe("agents/myagent/SOUL.md");
    expect(result.current.files[0].content).toBe(
      "You are a helpful agent.",
    );
    // SOUL.md should be auto-selected
    expect(result.current.selectedPath).toBe("agents/myagent/SOUL.md");
  });

  it("loadFiles (zero_trust) should auto-select first file when no SOUL.md", async () => {
    // Override extractTar to return files without SOUL.md
    const tarModule = await import("@/lib/tar");
    (tarModule.extractTar as Mock).mockReturnValueOnce([
      {
        path: "openclaw.json",
        content: new TextEncoder().encode('{"version":"1.0"}'),
      },
      {
        path: "agents/myagent/config.yaml",
        content: new TextEncoder().encode("model: gpt-4"),
      },
    ]);

    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.selectedPath).toBe("openclaw.json");
  });

  // =========================================================================
  // loadFiles - background mode
  // =========================================================================

  it("loadFiles (background) should call extract endpoint and decrypt transport response", async () => {
    // First call returns background mode with no encrypted_state
    mockFetch
      .mockResolvedValueOnce(
        makeOkResponse({
          encryption_mode: "background",
          encrypted_state: null,
        }),
      )
      // Second call is POST /agents/{name}/files/extract
      .mockResolvedValueOnce(
        makeOkResponse({
          encrypted_files: { some: "encrypted-payload" },
        }),
      );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    // decryptTransportResponse returns one file
    expect(result.current.files).toHaveLength(1);
    expect(result.current.files[0].path).toBe("agents/test/SOUL.md");
    expect(result.current.files[0].content).toBe("hello world");

    // Verify the extract endpoint was called
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const secondCall = mockFetch.mock.calls[1];
    expect(secondCall[0]).toContain("/agents/myagent/files/extract");
    expect(secondCall[1].method).toBe("POST");
  });

  // =========================================================================
  // loadFiles - error handling
  // =========================================================================

  it("loadFiles should set error when encryption is locked", async () => {
    mockEncryption.state.isUnlocked = false;

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.error).toBe("Encryption keys not unlocked");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("loadFiles should set error when not authenticated", async () => {
    mockGetToken.mockResolvedValue(null);

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.error).toBe("Not authenticated");
  });

  it("loadFiles should set error on HTTP failure", async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(404, "Agent not found"),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("nonexistent");
    });

    expect(result.current.error).toBe("Agent not found");
    expect(result.current.loading).toBe(false);
  });

  it("loadFiles should set generic error when json parsing fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("invalid json")),
    } as unknown as Response);

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.error).toBe("Failed to fetch agent state (500)");
  });

  // =========================================================================
  // save - zero_trust mode
  // =========================================================================

  it("save (zero_trust) should pack, compress, encrypt, and PUT state", async () => {
    // Load first to set encryption mode
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    // Modify a file
    act(() => {
      result.current.updateFileContent(
        result.current.files[0].path,
        "updated content",
      );
    });

    expect(result.current.isDirty).toBe(true);

    // Now save
    mockFetch.mockResolvedValueOnce(makeOkResponse({ status: "ok" }));

    await act(async () => {
      await result.current.save("myagent");
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();

    // After save, files should be marked clean
    expect(result.current.isDirty).toBe(false);

    // Verify PUT was called
    const putCall = mockFetch.mock.calls[1];
    expect(putCall[0]).toContain("/agents/myagent/state");
    expect(putCall[1].method).toBe("PUT");

    // Verify body has encrypted_state
    const body = JSON.parse(putCall[1].body);
    expect(body).toHaveProperty("encrypted_state");
  });

  // =========================================================================
  // save - background mode
  // =========================================================================

  it("save (background) should encrypt files and POST to pack endpoint", async () => {
    // Load in background mode
    mockFetch
      .mockResolvedValueOnce(
        makeOkResponse({
          encryption_mode: "background",
          encrypted_state: null,
        }),
      )
      .mockResolvedValueOnce(
        makeOkResponse({
          encrypted_files: { some: "payload" },
        }),
      );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    // Modify
    act(() => {
      result.current.updateFileContent(
        result.current.files[0].path,
        "new bg content",
      );
    });

    // Save
    mockFetch.mockResolvedValueOnce(makeOkResponse({ status: "ok" }));

    await act(async () => {
      await result.current.save("myagent");
    });

    expect(result.current.saving).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isDirty).toBe(false);

    // Verify pack endpoint was called
    const packCall = mockFetch.mock.calls[2];
    expect(packCall[0]).toContain("/agents/myagent/files/pack");
    expect(packCall[1].method).toBe("POST");

    const body = JSON.parse(packCall[1].body);
    expect(body).toHaveProperty("files");
    expect(body.files).toHaveLength(1);
    expect(body.files[0]).toHaveProperty("path");
    expect(body.files[0]).toHaveProperty("encrypted_content");
  });

  // =========================================================================
  // save - error handling
  // =========================================================================

  it("save should set error when encryption is locked", async () => {
    const { result } = renderHook(() => useAgentSettings());

    mockEncryption.state.isUnlocked = false;

    await act(async () => {
      await result.current.save("myagent");
    });

    expect(result.current.error).toBe("Encryption keys not unlocked");
  });

  it("save should set error when not authenticated", async () => {
    // Load files first
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    mockGetToken.mockResolvedValue(null);

    await act(async () => {
      await result.current.save("myagent");
    });

    expect(result.current.error).toBe("Not authenticated");
  });

  it("save should set error on HTTP failure", async () => {
    // Load files first
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    // Save fails
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse(500, "Internal server error"),
    );

    await act(async () => {
      await result.current.save("myagent");
    });

    expect(result.current.error).toBe("Internal server error");
    expect(result.current.saving).toBe(false);
  });

  // =========================================================================
  // isDirty computation
  // =========================================================================

  it("isDirty should be false when content matches original", async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.isDirty).toBe(false);

    // Modify and then revert
    const path = result.current.files[0].path;
    const original = result.current.files[0].originalContent;

    act(() => {
      result.current.updateFileContent(path, "changed");
    });
    expect(result.current.isDirty).toBe(true);

    act(() => {
      result.current.updateFileContent(path, original);
    });
    expect(result.current.isDirty).toBe(false);
  });

  // =========================================================================
  // loadFiles clears previous state
  // =========================================================================

  it("loadFiles should clear previous files and error", async () => {
    // First load succeeds
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "aa",
          iv: "bb",
          ciphertext: "cc",
          auth_tag: "dd",
          hkdf_salt: "ee",
        },
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("agent1");
    });

    expect(result.current.files.length).toBeGreaterThan(0);
    const previousSelectedPath = result.current.selectedPath;

    // Second load - set up new response
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        encryption_mode: "zero_trust",
        encrypted_state: {
          ephemeral_public_key: "ff",
          iv: "gg",
          ciphertext: "hh",
          auth_tag: "ii",
          hkdf_salt: "jj",
        },
      }),
    );

    await act(async () => {
      await result.current.loadFiles("agent2");
    });

    // Should have loaded files for agent2 (same mock returns same data)
    expect(result.current.files.length).toBeGreaterThan(0);
    expect(result.current.error).toBeNull();
  });

  // =========================================================================
  // loadFiles sets loading state
  // =========================================================================

  it("loadFiles should set loading=true during fetch", async () => {
    let resolveResponse: (value: Response) => void;
    mockFetch.mockReturnValueOnce(
      new Promise<Response>((r) => {
        resolveResponse = r;
      }),
    );

    const { result } = renderHook(() => useAgentSettings());

    // Start loading (don't await)
    let loadPromise: Promise<void>;
    act(() => {
      loadPromise = result.current.loadFiles("myagent");
    });

    // loading should be true while promise is pending
    expect(result.current.loading).toBe(true);

    // Resolve and finish
    await act(async () => {
      resolveResponse!(
        makeOkResponse({
          encryption_mode: "zero_trust",
          encrypted_state: {
            ephemeral_public_key: "aa",
            iv: "bb",
            ciphertext: "cc",
            auth_tag: "dd",
            hkdf_salt: "ee",
          },
        }),
      );
      await loadPromise!;
    });

    expect(result.current.loading).toBe(false);
  });

  // =========================================================================
  // Background mode - extract endpoint error
  // =========================================================================

  it("loadFiles (background) should handle extract endpoint error", async () => {
    mockFetch
      .mockResolvedValueOnce(
        makeOkResponse({
          encryption_mode: "background",
          encrypted_state: null,
        }),
      )
      .mockResolvedValueOnce(
        makeErrorResponse(500, "Failed to extract files in enclave"),
      );

    const { result } = renderHook(() => useAgentSettings());

    await act(async () => {
      await result.current.loadFiles("myagent");
    });

    expect(result.current.error).toBe("Failed to extract files in enclave");
    expect(result.current.files).toEqual([]);
  });
});
