import { type NextRequest, NextResponse } from "next/server";

import { normalizeDisplayName } from "@/lib/profile";
import { upsertPlayerDisplayName } from "@/lib/server/dailyChallengeRepository";
import {
  createSessionSupabaseServerClient,
  getSupabaseSessionFromRequest,
} from "@/lib/server/supabaseServer";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const session = getSupabaseSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ message: "You must be signed in." }, { status: 401 });
    }

    const body = (await request.json()) as {
      displayName?: unknown;
    };

    const { value, error } = normalizeDisplayName(
      typeof body.displayName === "string" ? body.displayName : "",
    );

    if (!value || error) {
      return NextResponse.json({ message: error }, { status: 400 });
    }

    const client = createSessionSupabaseServerClient(session.accessToken);
    const profile = await upsertPlayerDisplayName(client, {
      userId: session.user.id,
      displayName: value,
    });

    return NextResponse.json({
      message: "Display name saved.",
      displayName: profile.display_name,
      leaderboardEligible: Boolean(profile.display_name?.trim()),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save display name.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
