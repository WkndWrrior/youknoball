import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({
    data: { session: { user: { email: "fan@example.com" } } },
  })),
  onAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  signOut: vi.fn(async () => ({ error: null })),
}));

const reactMocks = vi.hoisted(() => ({
  setLoading: vi.fn(),
  setSigningOut: vi.fn(),
  setUser: vi.fn(),
  useEffect: vi.fn((effect: () => void | (() => void)) => {
    effect();
  }),
  useState: vi.fn(),
}));

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");

  return {
    ...actual,
    useEffect: reactMocks.useEffect,
    useState: reactMocks.useState,
  };
});

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: () => ({
    auth: {
      getSession: authMocks.getSession,
      onAuthStateChange: authMocks.onAuthStateChange,
      signOut: authMocks.signOut,
    },
  }),
}));

import { AuthButton } from "@/components/AuthButton";

type ElementLike = {
  props?: {
    children?: unknown;
    onClick?: () => Promise<void>;
  };
  type?: unknown;
};

function isElementLike(value: unknown): value is ElementLike {
  return typeof value === "object" && value !== null && "props" in value;
}

function findButton(element: unknown): ElementLike | null {
  if (!isElementLike(element)) {
    return null;
  }

  if (element.type === "button") {
    return element;
  }

  const children = element.props?.children;
  const childList = Array.isArray(children) ? children : [children];

  for (const child of childList) {
    const match = findButton(child);
    if (match) {
      return match;
    }
  }

  return null;
}

describe("AuthButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactMocks.useState
      .mockReturnValueOnce([{ email: "fan@example.com" }, reactMocks.setUser])
      .mockReturnValueOnce([false, reactMocks.setLoading])
      .mockReturnValueOnce([false, reactMocks.setSigningOut]);
  });

  it("signs out only the current browser session", async () => {
    const button = findButton(AuthButton());

    expect(button?.props?.onClick).toEqual(expect.any(Function));

    await button?.props?.onClick?.();

    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
