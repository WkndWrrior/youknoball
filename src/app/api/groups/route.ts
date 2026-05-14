import { type NextRequest, NextResponse } from "next/server";

import { normalizeLeaderboardGroupName } from "@/lib/leaderboardGroups";
import {
  createLeaderboardGroupForOwner,
  listLeaderboardGroupsForUser,
} from "@/lib/server/leaderboardGroupsRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = getSupabaseSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const groups = await listLeaderboardGroupsForUser(
      supabaseAdmin(),
      session.user.id,
    );

    return NextResponse.json({ groups });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load groups.";
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSupabaseSessionFromRequest(request);
    if (!session) {
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
      ownerUserId: session.user.id,
      name: value,
    });

    return NextResponse.json({ group });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create group.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
