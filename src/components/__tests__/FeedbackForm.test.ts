/** @vitest-environment jsdom */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { createElement } from "react";

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FeedbackForm } from "@/components/FeedbackForm";
import { MAX_FEEDBACK_EMAIL_LENGTH } from "@/lib/feedback";

const DEFAULT_SUCCESS_MESSAGE =
  "Thanks for helping us make YouKnoBall better.";
const GENERIC_ERROR_MESSAGE = "Unable to send feedback.";

type ResponseOptions = {
  ok: boolean;
  payload?: unknown;
  jsonError?: Error;
};

function createResponse({
  ok,
  payload,
  jsonError,
}: ResponseOptions): Response {
  return {
    ok,
    json: vi.fn(async () => {
      if (jsonError) {
        throw jsonError;
      }

      return payload;
    }),
  } as unknown as Response;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function installFetch(response: Response | Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function renderFeedbackForm() {
  return render(createElement(FeedbackForm, { sourcePath: "/play" }));
}

function getMessageField() {
  return screen.getByLabelText("Message") as HTMLTextAreaElement;
}

function getEmailField() {
  return screen.getByLabelText(/Contact email/) as HTMLInputElement;
}

function getHoneypot() {
  const input = document.querySelector(
    '[aria-hidden="true"] input',
  ) as HTMLInputElement | null;

  if (!input) {
    throw new Error("Expected a honeypot input.");
  }

  return input;
}

function getForm() {
  const form = getMessageField().closest("form");
  if (!form) {
    throw new Error("Expected the message field to belong to a form.");
  }

  return form;
}

function getFormControls(form = getForm()) {
  return Array.from(
    form.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
    >("input, textarea, button"),
  );
}

function fillValidFields(email = "player@example.com") {
  fireEvent.change(getMessageField(), {
    target: { value: "The category selector needs clearer focus styles." },
  });
  fireEvent.change(getEmailField(), { target: { value: email } });
}

function expectFieldError(
  field: HTMLInputElement | HTMLTextAreaElement,
  message: string,
) {
  expect(field.getAttribute("aria-invalid")).toBe("true");

  const describedBy = field.getAttribute("aria-describedby")?.split(/\s+/) ?? [];
  const errorElement = describedBy
    .map((id) => document.getElementById(id))
    .find((element) => element?.textContent === message);

  expect(errorElement?.textContent).toBe(message);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FeedbackForm behavior", () => {
  it("sends exactly one request during a delayed duplicate submit", async () => {
    const request = createDeferred<Response>();
    const fetchMock = installFetch(request.promise);
    renderFeedbackForm();
    fillValidFields();

    fireEvent.submit(getForm());
    fireEvent.submit(getForm());

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      request.resolve(createResponse({ ok: true, payload: {} }));
      await request.promise;
    });
    expect((await screen.findByRole("status")).textContent).toBe(
      DEFAULT_SUCCESS_MESSAGE,
    );
  });

  it("marks the form busy and disables every control while pending", async () => {
    const request = createDeferred<Response>();
    installFetch(request.promise);
    renderFeedbackForm();
    fillValidFields();
    const form = getForm();

    fireEvent.submit(form);

    expect(form.getAttribute("aria-busy")).toBe("true");
    const controls = getFormControls(form);
    expect(controls.length).toBeGreaterThan(0);
    expect(controls.every((control) => control.disabled)).toBe(true);

    await act(async () => {
      request.resolve(createResponse({ ok: true, payload: {} }));
      await request.promise;
    });
    expect((await screen.findByRole("status")).textContent).toBe(
      DEFAULT_SUCCESS_MESSAGE,
    );
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(getFormControls(form).every((control) => !control.disabled)).toBe(
      true,
    );
  });

  it("preserves inputs and restores controls after a rejected fetch, then retries", async () => {
    const request = createDeferred<Response>();
    installFetch(request.promise);
    renderFeedbackForm();
    fillValidFields();
    fireEvent.click(screen.getByRole("radio", { name: "Bug" }));
    fireEvent.change(getHoneypot(), { target: { value: "bot value" } });
    const form = getForm();

    fireEvent.submit(form);
    expect(form.getAttribute("aria-busy")).toBe("true");

    await act(async () => {
      request.reject(new TypeError("Network unavailable."));
      try {
        await request.promise;
      } catch {
        // The component handles the same rejection and restores its controls.
      }
    });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Network unavailable.",
    );
    expect(form.getAttribute("aria-busy")).toBe("false");
    expect(getFormControls(form).every((control) => !control.disabled)).toBe(
      true,
    );
    expect(getMessageField().value).toBe(
      "The category selector needs clearer focus styles.",
    );
    expect(getEmailField().value).toBe("player@example.com");
    expect(getHoneypot().value).toBe("bot value");
    expect(
      (screen.getByRole("radio", { name: "Bug" }) as HTMLInputElement).checked,
    ).toBe(true);

    const retryFetch = installFetch(
      createResponse({ ok: true, payload: { message: "Recovered." } }),
    );
    fireEvent.submit(form);

    expect((await screen.findByRole("status")).textContent).toBe("Recovered.");
    expect(retryFetch).toHaveBeenCalledTimes(1);
  });

  it("resets every input and feedback type after success", async () => {
    installFetch(
      createResponse({
        ok: true,
        payload: { message: "Feedback received." },
      }),
    );
    renderFeedbackForm();
    fillValidFields();
    fireEvent.click(screen.getByRole("radio", { name: "Bug" }));
    fireEvent.change(getHoneypot(), { target: { value: "bot value" } });

    fireEvent.submit(getForm());

    expect((await screen.findByRole("status")).textContent).toBe(
      "Feedback received.",
    );
    expect(getMessageField().value).toBe("");
    expect(getEmailField().value).toBe("");
    expect(getHoneypot().value).toBe("");
    expect(
      (screen.getByRole("radio", { name: "General" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("preserves every input after an API failure", async () => {
    installFetch(
      createResponse({
        ok: false,
        payload: { message: "Invalid feedback." },
      }),
    );
    renderFeedbackForm();
    fillValidFields();
    fireEvent.click(screen.getByRole("radio", { name: "Idea" }));
    fireEvent.change(getHoneypot(), { target: { value: "bot value" } });

    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Invalid feedback.",
    );
    expect(getMessageField().value).toBe(
      "The category selector needs clearer focus styles.",
    );
    expect(getEmailField().value).toBe("player@example.com");
    expect(getHoneypot().value).toBe("bot value");
    expect(
      (screen.getByRole("radio", { name: "Idea" }) as HTMLInputElement).checked,
    ).toBe(true);
  });

  it.each([
    ["empty", new SyntaxError("Unexpected end of JSON input")],
    ["malformed", new SyntaxError("Unexpected token '<'")],
  ])("treats an OK %s response as success", async (_description, jsonError) => {
    installFetch(createResponse({ ok: true, jsonError }));
    renderFeedbackForm();
    fillValidFields();

    fireEvent.submit(getForm());

    expect((await screen.findByRole("status")).textContent).toBe(
      DEFAULT_SUCCESS_MESSAGE,
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getMessageField().value).toBe("");
  });

  it("uses a generic error for a malformed non-OK response", async () => {
    installFetch(
      createResponse({
        ok: false,
        jsonError: new SyntaxError("Unexpected end of JSON input"),
      }),
    );
    renderFeedbackForm();
    fillValidFields();

    fireEvent.submit(getForm());

    expect((await screen.findByRole("alert")).textContent).toBe(
      GENERIC_ERROR_MESSAGE,
    );
    expect(screen.queryByText(/Unexpected end of JSON input/)).toBeNull();
  });

  it("rejects a whitespace-only message and clears its field error on edit", () => {
    const fetchMock = installFetch(createResponse({ ok: true, payload: {} }));
    renderFeedbackForm();
    fireEvent.change(getMessageField(), { target: { value: "  \n  " } });

    fireEvent.submit(getForm());

    expect(fetchMock).not.toHaveBeenCalled();
    expectFieldError(getMessageField(), "Enter a message.");

    fireEvent.change(getMessageField(), { target: { value: "A useful note." } });
    expect(screen.queryByText("Enter a message.")).toBeNull();
    expect(getMessageField().getAttribute("aria-invalid")).toBeNull();
  });

  it("rejects an email without a dotted domain and clears its error on edit", () => {
    const fetchMock = installFetch(createResponse({ ok: true, payload: {} }));
    renderFeedbackForm();
    fillValidFields("player@example");

    fireEvent.submit(getForm());

    expect(getForm().noValidate).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expectFieldError(getEmailField(), "Enter a valid email address.");

    fireEvent.change(getEmailField(), {
      target: { value: "player@example.com" },
    });
    expect(screen.queryByText("Enter a valid email address.")).toBeNull();
    expect(getEmailField().getAttribute("aria-invalid")).toBeNull();
  });

  it("allows a blank optional email", async () => {
    const fetchMock = installFetch(
      createResponse({ ok: true, payload: { message: "Received." } }),
    );
    renderFeedbackForm();
    fillValidFields("");

    fireEvent.submit(getForm());

    expect((await screen.findByRole("status")).textContent).toBe("Received.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caps email input at 320 Unicode code points without maxLength", () => {
    renderFeedbackForm();
    const email = getEmailField();

    fireEvent.change(email, {
      target: { value: "🏀".repeat(MAX_FEEDBACK_EMAIL_LENGTH + 1) },
    });

    expect(Array.from(email.value)).toHaveLength(MAX_FEEDBACK_EMAIL_LENGTH);
    expect(email.maxLength).toBe(-1);
    expect(email.type).toBe("email");
  });

  it("requires and caps the message at 2,000 Unicode code points", () => {
    renderFeedbackForm();
    const message = getMessageField();

    fireEvent.change(message, { target: { value: "🏀".repeat(2001) } });

    expect(message.required).toBe(true);
    expect(Array.from(message.value)).toHaveLength(2000);
  });

  it("uses a nonsemantic honeypot name but sends the website JSON key", async () => {
    const fetchMock = installFetch(
      createResponse({ ok: true, payload: { message: "Received." } }),
    );
    renderFeedbackForm();
    fillValidFields();
    const honeypot = getHoneypot();
    fireEvent.change(honeypot, { target: { value: "bot value" } });

    expect(honeypot.name).toBeTruthy();
    expect(honeypot.name).not.toMatch(/website|url|email|address/i);
    expect(honeypot.id).not.toMatch(/website|url|email|address/i);
    expect(honeypot.labels?.item(0)?.textContent).toBe("Form check");
    expect(honeypot.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(honeypot.tabIndex).toBe(-1);
    expect(honeypot.autocomplete).toBe("off");
    fireEvent.submit(getForm());
    await screen.findByRole("status");

    const requestUrl = fetchMock.mock.calls[0]?.[0];
    const requestInit = fetchMock.mock.calls[0]?.[1];
    expect(requestUrl).toBe("/api/feedback");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.headers).toMatchObject({
      "content-type": "application/json",
    });
    expect(JSON.parse(String(requestInit?.body))).toMatchObject({
      website: "bot value",
      sourcePath: "/play",
    });
  });
});

describe("FeedbackForm style contract", () => {
  it("keeps the compact panel and legible secondary text", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/FeedbackForm.tsx"),
      "utf8",
    );

    expect(source).toContain("rounded-lg");
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("placeholder:text-white/50");
    expect(source).toContain("text-white/70");
    expect(source).toContain("text-white/60");
    expect(source).not.toContain("placeholder:text-white/30");
    expect(source).not.toContain("text-white/45");
  });
});
