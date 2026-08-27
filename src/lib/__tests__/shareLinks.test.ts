import { describe, expect, it } from "vitest";

import {
  buildFacebookShareUrl,
  buildNativeShareData,
  buildShareMessage,
  buildShareUrl,
  buildXShareUrl,
} from "@/lib/shareLinks";

const shareText = "YouKnoBall Daily Challenge 2026-05-02\n4/5\n🟩🟩⬜🟩🟩";

describe("share link helpers", () => {
  it("builds the canonical public share URL", () => {
    expect(buildShareUrl("https://youknoball.com/")).toBe(
      "https://youknoball.com/play",
    );
    expect(buildShareUrl("https://youknoball.com", "leaderboard")).toBe(
      "https://youknoball.com/leaderboard",
    );
  });

  it("appends the share URL to copied result text", () => {
    expect(buildShareMessage(shareText, "https://youknoball.com/play")).toBe(
      `${shareText}\n\nhttps://youknoball.com/play`,
    );
  });

  it("builds native share data without duplicating the URL in text", () => {
    expect(buildNativeShareData(shareText, "https://youknoball.com/play")).toEqual({
      title: "YouKnoBall Daily Challenge",
      text: shareText,
      url: "https://youknoball.com/play",
    });
  });

  it("builds an X intent URL with result text and the share URL", () => {
    const url = new URL(buildXShareUrl(shareText, "https://youknoball.com/play"));

    expect(url.origin).toBe("https://twitter.com");
    expect(url.pathname).toBe("/intent/tweet");
    expect(url.searchParams.get("text")).toBe(shareText);
    expect(url.searchParams.get("url")).toBe("https://youknoball.com/play");
  });

  it("builds a Facebook share URL for the public play page", () => {
    const url = new URL(buildFacebookShareUrl("https://youknoball.com/play"));

    expect(url.origin).toBe("https://www.facebook.com");
    expect(url.pathname).toBe("/sharer/sharer.php");
    expect(url.searchParams.get("u")).toBe("https://youknoball.com/play");
  });
});
