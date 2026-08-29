/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LoginForm } from "@/components/LoginForm";

const {
  replaceMock,
  resetPasswordForEmailMock,
  signInWithOtpMock,
  signInWithPasswordMock,
  signUpMock,
  supabaseBrowserMock,
} = vi.hoisted(() => ({
  replaceMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  signInWithPasswordMock: vi.fn(),
  signUpMock: vi.fn(),
  supabaseBrowserMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock("@/lib/supabaseBrowser", () => ({
  supabaseBrowser: supabaseBrowserMock,
}));

function renderLoginForm() {
  return render(<LoginForm callbackError={null} redirectPath="/leaderboard" />);
}

function enterEmail(value = " Player@Example.com ") {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value } });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://youknoball.test";
  replaceMock.mockReset();
  resetPasswordForEmailMock.mockReset().mockResolvedValue({ error: null });
  signInWithOtpMock.mockReset().mockResolvedValue({ error: null });
  signInWithPasswordMock.mockReset().mockResolvedValue({ error: null });
  signUpMock.mockReset().mockResolvedValue({ error: null });
  supabaseBrowserMock.mockReset().mockReturnValue({
    auth: {
      resetPasswordForEmail: resetPasswordForEmailMock,
      signInWithOtp: signInWithOtpMock,
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
    },
  });
});

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("LoginForm", () => {
  it("renders two primary modes and nests passwordless access under sign in", () => {
    renderLoginForm();

    const tabs = screen
      .getAllByRole("button")
      .filter((button) => button.hasAttribute("aria-pressed"));

    expect(tabs).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "Magic link" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /magic link/i })).toBeNull();
    expect(screen.getByLabelText("Email")).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Forgot password?" })).toBeTruthy();
    expect(screen.getByText("or")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    ).toBeTruthy();
  });

  it("sends a generic, existing-account-only magic link using the current email", async () => {
    renderLoginForm();
    enterEmail();

    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    await waitFor(() => {
      expect(signInWithOtpMock).toHaveBeenCalledWith({
        email: "Player@Example.com",
        options: {
          emailRedirectTo:
            "https://youknoball.test/auth/callback?next=%2Fleaderboard",
          shouldCreateUser: false,
        },
      });
    });
    expect(signInWithPasswordMock).not.toHaveBeenCalled();
    expect(signUpMock).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "If an account exists for that email, check your inbox for a sign-in link.",
      ),
    ).toBeTruthy();
  });

  it("masks the unknown-account otp_disabled response with the generic success message", async () => {
    const unknownAccountError = Object.assign(
      new Error("Signups not allowed for otp"),
      { code: "otp_disabled" },
    );
    signInWithOtpMock.mockResolvedValue({ error: unknownAccountError });
    renderLoginForm();
    enterEmail("unknown@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(
      await screen.findByText(
        "If an account exists for that email, check your inbox for a sign-in link.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Signups not allowed for otp")).toBeNull();
    expect(screen.queryByText("Unable to send a sign-in link.")).toBeNull();
  });

  it("keeps non-enumeration OTP failures visible", async () => {
    const rateLimitError = Object.assign(
      new Error("Too many sign-in links requested. Please try again later."),
      { code: "over_email_send_rate_limit" },
    );
    signInWithOtpMock.mockResolvedValue({ error: rateLimitError });
    renderLoginForm();
    enterEmail("player@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(
      await screen.findByText(
        "Too many sign-in links requested. Please try again later.",
      ),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "If an account exists for that email, check your inbox for a sign-in link.",
      ),
    ).toBeNull();
  });

  it("shows inline validation and makes no request when magic-link email is missing", async () => {
    renderLoginForm();

    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in link" }));

    expect(await screen.findByText("Please enter an email.")).toBeTruthy();
    expect(supabaseBrowserMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("keeps create-account confirmation and hides sign-in recovery actions", async () => {
    renderLoginForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(screen.getByLabelText("Confirm password")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Forgot password?" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Email me a sign-in link" }),
    ).toBeNull();

    enterEmail("new@example.com");
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "password123" },
    });
    fireEvent.submit(screen.getByLabelText("Confirm password").closest("form")!);

    await waitFor(() => {
      expect(signUpMock).toHaveBeenCalledWith({
        email: "new@example.com",
        password: "password123",
        options: {
          emailRedirectTo:
            "https://youknoball.test/auth/callback?next=%2Fleaderboard",
        },
      });
    });
  });

  it("preserves password sign-in and router replacement", async () => {
    renderLoginForm();
    enterEmail("player@example.com");
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });

    fireEvent.submit(screen.getByLabelText("Password").closest("form")!);

    await waitFor(() => {
      expect(signInWithPasswordMock).toHaveBeenCalledWith({
        email: "player@example.com",
        password: "password123",
      });
    });
    expect(replaceMock).toHaveBeenCalledWith("/leaderboard");
  });

  it("preserves password recovery with the current email", async () => {
    renderLoginForm();
    enterEmail("player@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));

    await waitFor(() => {
      expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
        "player@example.com",
        { redirectTo: "https://youknoball.test/auth/callback" },
      );
    });
  });
});
