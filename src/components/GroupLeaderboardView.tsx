"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { LeaderboardTable } from "@/components/LeaderboardTable";
import {
  buildGroupInviteUrl,
  type LeaderboardGroupDetail,
} from "@/lib/leaderboardGroups";

type GroupLeaderboardViewProps = {
  inviteCode: string;
};

export function GroupLeaderboardView({ inviteCode }: GroupLeaderboardViewProps) {
  const [detail, setDetail] = useState<LeaderboardGroupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadGroup() {
      try {
        setLoading(true);
        const response = await fetch(`/api/groups/${inviteCode}`, {
          cache: "no-store",
        });
        const payload = (await response.json()) as LeaderboardGroupDetail & {
          message?: string;
        };

        if (!response.ok) {
          throw new Error(payload.message ?? "Unable to load group.");
        }

        if (mounted) {
          setDetail(payload);
          setError(null);
        }
      } catch (loadError) {
        if (mounted) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load group.");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadGroup();

    return () => {
      mounted = false;
    };
  }, [inviteCode]);

  const inviteUrl = useMemo(() => {
    if (!detail || typeof window === "undefined") {
      return "";
    }

    return buildGroupInviteUrl(window.location.origin, detail.group.inviteCode);
  }, [detail]);

  async function copyInviteLink() {
    if (!inviteUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopyMessage("Invite link copied.");
    } catch {
      setCopyMessage("Copy failed.");
    }
  }

  if (loading) {
    return <p className="text-sm text-white/65">Loading group...</p>;
  }

  if (error || !detail) {
    return (
      <div className="rounded-[2rem] border border-white/10 bg-black/35 p-6">
        <p className="text-sm text-white/70">{error ?? "Group not found."}</p>
        <Link
          href={`/groups/join/${inviteCode}`}
          className="mt-5 inline-flex rounded-full bg-[#ff7a18] px-5 py-3 text-sm font-semibold text-black hover:bg-[#ff8c36]"
        >
          Join group
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-black/35 p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">Group</p>
        <h1 className="mt-3 font-display text-5xl leading-none text-white">
          {detail.group.name}
        </h1>
        <p className="mt-4 text-sm uppercase tracking-[0.25em] text-white/45">
          {detail.memberCount} members · {detail.role}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyInviteLink}
            className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-[#ffede0]"
          >
            Copy invite
          </button>
          <Link
            href="/groups"
            className="rounded-full border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:border-white/30 hover:bg-white/5"
          >
            All groups
          </Link>
        </div>
        {copyMessage ? (
          <p className="mt-4 text-xs uppercase tracking-[0.25em] text-white/55">
            {copyMessage}
          </p>
        ) : null}
      </section>

      <LeaderboardTable entries={detail.entries} />
    </div>
  );
}
