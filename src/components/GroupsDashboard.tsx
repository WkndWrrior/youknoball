"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { buildGroupPath, type LeaderboardGroupListItem } from "@/lib/leaderboardGroups";

export function GroupsDashboard() {
  const [groups, setGroups] = useState<LeaderboardGroupListItem[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadGroups() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/groups", { cache: "no-store" });
      const payload = (await response.json()) as {
        groups?: LeaderboardGroupListItem[];
        message?: string;
      };

      if (!response.ok) {
        throw new Error(payload.message ?? "Unable to load groups.");
      }

      setGroups(payload.groups ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadGroups();
  }, []);

  async function createGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      const response = await fetch("/api/groups", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as {
        group?: LeaderboardGroupListItem;
        message?: string;
      };

      if (!response.ok || !payload.group) {
        throw new Error(payload.message ?? "Unable to create group.");
      }

      setName("");
      setMessage("Group created.");
      await loadGroups();
    } catch (createError) {
      setError(
        createError instanceof Error ? createError.message : "Unable to create group.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <form
        onSubmit={createGroup}
        className="rounded-[2rem] border border-white/10 bg-black/35 p-6"
      >
        <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">
          Create group
        </p>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Group name"
          className="mt-5 w-full rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#ff7a18]"
        />
        <button
          type="submit"
          disabled={submitting}
          className={`mt-4 rounded-full px-5 py-3 text-sm font-semibold transition ${
            submitting
              ? "cursor-not-allowed bg-white/10 text-white/35"
              : "bg-[#ff7a18] text-black hover:bg-[#ff8c36]"
          }`}
        >
          {submitting ? "Creating..." : "Create group"}
        </button>
        {message ? <p className="mt-4 text-sm text-emerald-200">{message}</p> : null}
        {error ? <p className="mt-4 text-sm text-red-200">{error}</p> : null}
      </form>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6">
        <p className="text-xs uppercase tracking-[0.3em] text-[#ffb067]">
          Your groups
        </p>
        {loading ? (
          <p className="mt-5 text-sm text-white/65">Loading groups...</p>
        ) : null}
        {!loading && groups.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-white/65">
            No groups yet. Create one and share the invite link.
          </p>
        ) : null}
        <div className="mt-5 grid gap-3">
          {groups.map((group) => (
            <Link
              key={group.id}
              href={buildGroupPath(group.inviteCode)}
              className="rounded-[1.5rem] border border-white/10 bg-black/30 p-4 transition hover:border-[#ff7a18]/40 hover:bg-black/45"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-white">{group.name}</p>
                  <p className="mt-1 text-xs uppercase tracking-[0.25em] text-white/45">
                    {group.memberCount} members · {group.role}
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#ffb067]">Open</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
