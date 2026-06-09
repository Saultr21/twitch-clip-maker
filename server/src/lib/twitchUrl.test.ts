import { describe, expect, it } from "vitest";
import { isTwitchClipUrl } from "./twitchUrl.js";

describe("isTwitchClipUrl", () => {
  it.each([
    "https://clips.twitch.tv/AwkwardHelplessSalamanderSwiftRage",
    "https://www.twitch.tv/ibai/clip/PoisedSquareKleeKreygasm-abc123",
    "https://twitch.tv/rubius/clip/SomeClipSlug",
    "https://m.twitch.tv/auronplay/clip/OtherSlug-x_y",
  ])("acepta %s", (url) => {
    expect(isTwitchClipUrl(url)).toBe(true);
  });

  it.each([
    "https://www.youtube.com/watch?v=abc",
    "https://clips.twitch.tv.evil.com/slug",
    "https://www.twitch.tv/ibai",
    "https://www.twitch.tv/ibai/videos/123",
    "http://clips.twitch.tv/Slug",
    "javascript:alert(1)",
    "no es una url",
    "https://clips.twitch.tv/",
  ])("rechaza %s", (url) => {
    expect(isTwitchClipUrl(url)).toBe(false);
  });
});
