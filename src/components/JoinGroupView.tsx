"use client";

import Link from "next/link";
import { useState } from "react";

import { buildGroupPath, type LeaderboardGroupSummary } from "@/lib/leaderboardGroups";

type JoinGroupViewProps = {
  inviteCode: string;
};

export function JoinGroupView({ inviteCode }: JoinGroupViewProps) {
  const [group, setGroup] = useState<LeaderboardGroupSummary | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function joinGroup() {
    setJoining(true);
    setError(null);

    try {
      const response = await fetch("/api/groups/join", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ inviteCode }),
      });
      const payload = (await response.json()) as {
        group?: LeaderboardGroupSummary;
        message?: string;
      };

      if (!response.ok || !payload.group) {
        throw new Error(payload.message ?? "Unable to join group.");
      }

      setGroup(payload.group);
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : "Unable to join group.");
    } finally {
      setJoining(false);
    }
  }

  if (group) {
    return (
      <div className="rounded-[2rem] border border-emerald-500/25 bg-emerald-500/10 p-6">
        <p className="text-sm text-emerald-100">You joined {group.name}.</p>
        <Link
          href={buildGroupPath(group.inviteCode)}
          className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-[#ffede0]"
        >
          Open group
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6">
      <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">Invite</p>
      <h1 className="mt-3 font-display text-5xl leading-none text-white">
        Join leaderboard group
      </h1>
      <p className="mt-4 text-sm leading-6 text-white/65">
        Sign in, join this group, then compare timed daily scores with friends.
      </p>
      <button
        type="button"
        onClick={joinGroup}
        disabled={joining}
        className={`mt-6 rounded-full px-5 py-3 text-sm font-semibold transition ${
          joining
            ? "cursor-not-allowed bg-white/10 text-white/35"
            : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
        }`}
      >
        {joining ? "Joining..." : "Join group"}
      </button>
      {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
    </div>
  );
}
