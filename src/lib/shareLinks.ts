export const defaultSharePath = "/play";
export const shareTitle = "YouKnoBall Daily Challenge";

export function buildShareUrl(siteUrl: string, pathname = defaultSharePath) {
  const trimmedSiteUrl = siteUrl.trim().replace(/\/+$/, "");
  const normalizedPathname = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return `${trimmedSiteUrl}${normalizedPathname}`;
}

export function buildShareMessage(shareText: string, shareUrl: string) {
  return `${shareText.trim()}\n\n${shareUrl}`;
}

export function buildNativeShareData(shareText: string, shareUrl: string): ShareData {
  return {
    title: shareTitle,
    text: shareText.trim(),
    url: shareUrl,
  };
}

export function buildXShareUrl(shareText: string, shareUrl: string) {
  const params = new URLSearchParams({
    text: shareText.trim(),
    url: shareUrl,
  });

  return `https://twitter.com/intent/tweet?${params.toString()}`;
}

export function buildFacebookShareUrl(shareUrl: string) {
  const params = new URLSearchParams({
    u: shareUrl,
  });

  return `https://www.facebook.com/sharer/sharer.php?${params.toString()}`;
}
