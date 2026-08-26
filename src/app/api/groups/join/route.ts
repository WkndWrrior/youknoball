import { type NextRequest, NextResponse } from "next/server";

import { normalizeGroupInviteCode } from "@/lib/leaderboardGroups";
import { joinLeaderboardGroupByInviteCode } from "@/lib/server/leaderboardGroupsRepository";
import { getVerifiedSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await getVerifiedSupabaseSessionFromRequest(request);
    if (!auth) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      inviteCode?: unknown;
    };
    const inviteCode = normalizeGroupInviteCode(
      typeof body.inviteCode === "string" ? body.inviteCode : "",
    );

    if (!inviteCode) {
      return NextResponse.json({ message: "Invalid group invite code." }, { status: 400 });
    }

    const group = await joinLeaderboardGroupByInviteCode(supabaseAdmin(), {
      userId: auth.user.id,
      inviteCode,
    });

    if (!group) {
      return NextResponse.json({ message: "Group not found." }, { status: 404 });
    }

    return NextResponse.json({ group });
  } catch {
    return NextResponse.json({ message: "Unable to join group." }, { status: 500 });
  }
}
