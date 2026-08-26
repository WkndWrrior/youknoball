import { describe, expect, it, vi } from "vitest";

import { createLeaderboardGroupForOwner } from "@/lib/server/leaderboardGroupsRepository";

describe("leaderboard group repository", () => {
  it("creates the group and owner membership through one atomic RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "group-1",
        name: "Saturday Crew",
        invite_code: "A1B2C3D4E5F60718",
        owner_user_id: "owner-1",
        created_at: "2026-08-20T00:00:00.000Z",
      },
      error: null,
    });

    const result = await createLeaderboardGroupForOwner(
      { rpc } as never,
      { ownerUserId: "owner-1", name: "Saturday Crew" },
    );

    expect(rpc).toHaveBeenCalledWith(
      "create_leaderboard_group_for_owner",
      expect.objectContaining({
        p_owner_user_id: "owner-1",
        p_name: "Saturday Crew",
        p_invite_code: expect.stringMatching(/^[A-F0-9]{16}$/),
      }),
    );
    expect(result).toMatchObject({
      id: "group-1",
      inviteCode: "A1B2C3D4E5F60718",
      ownerUserId: "owner-1",
    });
  });

  it("falls back to service-role inserts while the RPC migration is deploying", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "function not found" },
    });
    const groupRow = {
      id: "group-1",
      name: "Saturday Crew",
      invite_code: "A1B2C3D4E5F60718",
      owner_user_id: "owner-1",
      created_at: "2026-08-20T00:00:00.000Z",
    };
    const groupQuery = {
      insert: vi.fn(),
      select: vi.fn(),
      single: vi.fn().mockResolvedValue({ data: groupRow, error: null }),
    };
    groupQuery.insert.mockReturnValue(groupQuery);
    groupQuery.select.mockReturnValue(groupQuery);
    const memberQuery = {
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    const client = {
      rpc,
      from: vi.fn((table: string) =>
        table === "leaderboard_groups" ? groupQuery : memberQuery,
      ),
    };

    const result = await createLeaderboardGroupForOwner(client as never, {
      ownerUserId: "owner-1",
      name: "Saturday Crew",
    });

    expect(client.from).toHaveBeenCalledWith("leaderboard_groups");
    expect(client.from).toHaveBeenCalledWith("leaderboard_group_members");
    expect(result.id).toBe("group-1");
  });
});
