import { describe, expect, it } from "vitest";
import { matchPlatform } from "./supportedUrl.js";

describe("matchPlatform", () => {
  it.each([
    ["https://clips.twitch.tv/AwkwardSlug", "twitch"],
    ["https://www.twitch.tv/ibai/clip/PoisedSquare-abc", "twitch"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc123", "youtube"],
    ["https://www.tiktok.com/@user/video/123", "tiktok"],
    ["https://vm.tiktok.com/ABC123/", "tiktok"],
    ["https://www.instagram.com/reel/Cabc123/", "instagram"],
    ["https://x.com/user/status/123", "x"],
    ["https://twitter.com/user/status/123", "x"],
  ])("acepta %s como %s", (url, id) => {
    expect(matchPlatform(url)?.id).toBe(id);
  });

  it.each([
    "http://www.youtube.com/watch?v=abc",
    "https://vimeo.com/12345",
    "https://clips.twitch.tv.evil.com/x",
    "javascript:alert(1)",
    "no es una url",
  ])("rechaza %s", (url) => {
    expect(matchPlatform(url)).toBeNull();
  });
});
