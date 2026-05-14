import { type NextRequest, NextResponse } from "next/server";

import { normalizeGroupInviteCode } from "@/lib/leaderboardGroups";
import { getLeaderboardGroupDetail } from "@/lib/server/leaderboardGroupsRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ code: string }> },
) {
  try {
    const session = getSupabaseSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const params = await context.params;
    const inviteCode = normalizeGroupInviteCode(params.code);
    if (!inviteCode) {
      return NextResponse.json({ message: "Invalid group invite code." }, { status: 400 });
    }

    const detail = await getLeaderboardGroupDetail(supabaseAdmin(), {
      userId: session.user.id,
      inviteCode,
    });

    if (!detail) {
      return NextResponse.json({ message: "Group not found." }, { status: 404 });
    }

    return NextResponse.json(detail);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load group.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
