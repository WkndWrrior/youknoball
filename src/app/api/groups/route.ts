import { type NextRequest, NextResponse } from "next/server";

import { normalizeLeaderboardGroupName } from "@/lib/leaderboardGroups";
import {
  createLeaderboardGroupForOwner,
  listLeaderboardGroupsForUser,
} from "@/lib/server/leaderboardGroupsRepository";
import { getVerifiedSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await getVerifiedSupabaseSessionFromRequest(request);
    if (!auth) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const groups = await listLeaderboardGroupsForUser(
      supabaseAdmin(),
      auth.user.id,
    );

    return NextResponse.json({ groups });
  } catch {
    return NextResponse.json({ message: "Unable to load groups." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getVerifiedSupabaseSessionFromRequest(request);
    if (!auth) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      name?: unknown;
    };
    const { value, error } = normalizeLeaderboardGroupName(
      typeof body.name === "string" ? body.name : "",
    );

    if (!value || error) {
      return NextResponse.json({ message: error }, { status: 400 });
    }

    const group = await createLeaderboardGroupForOwner(supabaseAdmin(), {
      ownerUserId: auth.user.id,
      name: value,
    });

    return NextResponse.json({ group });
  } catch {
    return NextResponse.json({ message: "Unable to create group." }, { status: 500 });
  }
}
