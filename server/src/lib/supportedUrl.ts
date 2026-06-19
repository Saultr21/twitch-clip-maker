export interface Platform {
  id: "twitch" | "youtube" | "tiktok" | "instagram" | "x";
  label: string;
  hosts: string[];
}

const PLATFORMS: Platform[] = [
  {
    id: "twitch",
    label: "Twitch",
    hosts: ["twitch.tv", "www.twitch.tv", "m.twitch.tv", "clips.twitch.tv"],
  },
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com", "vm.tiktok.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "www.instagram.com"],
  },
  {
    id: "x",
    label: "X (Twitter)",
    hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"],
  },
];

/** Nombres de plataforma para mensajes de usuario. */
export const SUPPORTED_LABELS = "Twitch, YouTube, TikTok, Instagram, X";

/** Devuelve la plataforma soportada de una URL https, o null si no encaja. */
export function matchPlatform(rawUrl: string): Platform | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase();
  return PLATFORMS.find((p) => p.hosts.includes(host)) ?? null;
}
