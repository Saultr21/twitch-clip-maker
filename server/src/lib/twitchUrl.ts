const CLIP_HOSTS = new Set(["clips.twitch.tv"]);
const SITE_HOSTS = new Set(["twitch.tv", "www.twitch.tv", "m.twitch.tv"]);

export function isTwitchClipUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (CLIP_HOSTS.has(host)) return url.pathname.length > 1;
  if (SITE_HOSTS.has(host)) return /^\/[^/]+\/clip\/[^/]+/.test(url.pathname);
  return false;
}
