import { describe, expect, it, vi } from "vitest";

import type { ServerSupabaseClient } from "@/lib/server/supabaseServer";
import { createFeedbackSubmission } from "@/lib/server/feedbackRepository";

type QueryResult<T> = {
  data: T;
  error: unknown;
};

function createClientMock<T>(result: QueryResult<T>) {
  const query: Record<string, unknown> = {};

  query.insert = vi.fn(() => query);
  query.select = vi.fn(() => query);
  query.single = vi.fn(async () => result);

  const client = {
    from: vi.fn(() => query),
  } as unknown as ServerSupabaseClient;

  return { client, query };
}

describe("createFeedbackSubmission", () => {
  it("inserts feedback and returns the created row", async () => {
    const createdRow = { id: "feedback-1" };
    const { client, query } = createClientMock({
      data: createdRow,
      error: null,
    });

    await expect(
      createFeedbackSubmission(client, {
        reporterUserId: "user-1",
        feedbackType: "idea",
        message: "Add a rivalry quiz.",
        contactEmail: "player@example.com",
        sourcePath: "/categories",
      }),
    ).resolves.toBe(createdRow);

    expect(client.from).toHaveBeenCalledWith("feedback_submissions");
    expect(query.insert).toHaveBeenCalledWith({
      reporter_user_id: "user-1",
      feedback_type: "idea",
      message: "Add a rivalry quiz.",
      contact_email: "player@example.com",
      source_path: "/categories",
    });
    expect(query.select).toHaveBeenCalledWith("id");
    expect(query.single).toHaveBeenCalledOnce();
  });

  it("throws the Supabase error", async () => {
    const error = { code: "42501", message: "insert denied" };
    const { client } = createClientMock({ data: null, error });

    await expect(
      createFeedbackSubmission(client, {
        reporterUserId: null,
        feedbackType: "bug",
        message: "The answer button is stuck.",
        contactEmail: null,
        sourcePath: null,
      }),
    ).rejects.toBe(error);
  });
});
