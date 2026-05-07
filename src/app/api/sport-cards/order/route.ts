import { type NextRequest, NextResponse } from "next/server";

import {
  rankSportsCategoriesByPerformance,
  sportsCategories,
} from "@/lib/categories";
import { getPlayerSportCategoryPerformance } from "@/lib/server/dailyChallengeRepository";
import { getSupabaseSessionFromRequest } from "@/lib/server/supabaseServer";

export const dynamic = "force-dynamic";

function defaultSlugs() {
  return sportsCategories.map((category) => category.slug);
}

export async function GET(request: NextRequest) {
  const session = getSupabaseSessionFromRequest(request);

  if (!session) {
    return NextResponse.json({ slugs: defaultSlugs() });
  }

  try {
    const performance = await getPlayerSportCategoryPerformance(session.user.id);
    const categories = rankSportsCategoriesByPerformance(sportsCategories, performance);

    return NextResponse.json({
      slugs: categories.map((category) => category.slug),
    });
  } catch {
    return NextResponse.json({ slugs: defaultSlugs() });
  }
}
