/**
 * E2E test: a 2-track project's filter graph actually renders a valid MP4.
 *
 * String-level unit tests can only verify that the filter graph is well-formed;
 * they cannot catch a wrong-but-syntactically-valid graph. This test generates two
 * real input files with ffmpeg lavfi, calls buildFilterGraph, runs the real ffmpeg
 * binary with the produced inputs/filterComplex/videoLabel/audioLabel (replicating
 * the exact arg-building logic from buildFfmpegArgs in presets.ts), and asserts the
 * output is a valid MP4 with 1 video stream and 1 audio stream via ffprobe.
 *
 * How the binary is resolved: identical to the real export pipeline — both ffmpegBin
 * and ffprobeBin are imported from ../binaries.ts, which resolves them via
 * ffmpeg-static and ffprobe-static respectively.
 *
 * How args are built: mirrors buildFfmpegArgs from presets.ts:
 *   - Each input in graph.inputs is mapped to -i <dir/fileName>
 *   - input.loop → -loop 1 (used for image inputs; video inputs have no loop flag)
 *   - -filter_complex, -map videoLabel, -map audioLabel, codecs
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execa } from "execa";
import { createEmptyProject, createVideoClip, type ClipInfo } from "@clipforge/shared";
import { buildFilterGraph } from "./filterGraph.js";
import { ffmpegBin, ffprobeBin } from "../binaries.js";

/** Returns true if the ffmpeg binary can be spawned. */
async function hasFfmpeg(): Promise<boolean> {
  try {
    await execa(ffmpegBin, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

describe("export multipista e2e", () => {
  it(
    "dos pistas → MP4 válido con 1 stream de vídeo y 1 stream de audio",
    async () => {
      const ffmpegAvailable = await hasFfmpeg();
      if (!ffmpegAvailable) {
        console.warn("ffmpeg no disponible — test omitido");
        return;
      }

      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mt-e2e-"));
      const inputA = path.join(dir, "a.mp4");
      const inputB = path.join(dir, "b.mp4");

      // Generate two small test videos with audio using lavfi sources
      const gen = (out: string, dur: number, freq: number) =>
        execa(ffmpegBin, [
          "-y",
          "-f", "lavfi", "-i", `testsrc=size=320x240:rate=30:duration=${dur}`,
          "-f", "lavfi", "-i", `sine=frequency=${freq}:duration=${dur}`,
          "-pix_fmt", "yuv420p",
          "-shortest",
          out,
        ]);

      await gen(inputA, 5, 440);
      await gen(inputB, 3, 880);

      // Build a 2-track project: base clip 5s + upper-track facecam 3s at t=1
      const project = createEmptyProject("e2e");
      project.settings.width = 360;
      project.settings.height = 640;
      project.settings.fps = 30;

      project.tracks.video[0].clips.push({
        ...createVideoClip("ca", 0, 5),
        trimIn: 0,
        trimOut: 5,
      });
      project.tracks.video.push({
        id: "t2",
        name: "facecam",
        clips: [
          {
            ...createVideoClip("cb", 1, 3),
            trimIn: 0,
            trimOut: 3,
            opacity: 0.9,
            zoom: { x: 0.5, y: 0.2, scale: 0.4 },
          },
        ],
      });

      const infos = new Map<string, ClipInfo>([
        [
          "ca",
          {
            id: "ca",
            url: "",
            title: "a",
            fileName: "a.mp4",
            duration: 5,
            width: 320,
            height: 240,
            createdAt: "",
          },
        ],
        [
          "cb",
          {
            id: "cb",
            url: "",
            title: "b",
            fileName: "b.mp4",
            duration: 3,
            width: 320,
            height: 240,
            createdAt: "",
          },
        ],
      ]);

      const graph = buildFilterGraph(project, infos);

      // Build ffmpeg args mirroring buildFfmpegArgs from presets.ts:
      //   - input.loop → -loop 1  (for image inputs decoded in a loop)
      //   - all files resolved from the same temp dir (clips + assets live separately
      //     in production, but in this test both inputs are in the same dir)
      const outPath = path.join(dir, "out.mp4");
      const inputArgs: string[] = [];
      for (const input of graph.inputs) {
        if (input.loop) inputArgs.push("-loop", "1");
        inputArgs.push("-i", path.join(dir, input.fileName).replaceAll("\\", "/"));
      }

      const ffmpegArgs = [
        "-y",
        ...inputArgs,
        "-filter_complex", graph.filterComplex,
        "-map", graph.videoLabel,
        "-map", graph.audioLabel,
        "-r", "30",
        "-c:v", "libx264",
        "-preset", "ultrafast", // fast for tests
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        outPath,
      ];

      const result = await execa(ffmpegBin, ffmpegArgs, { reject: false });
      if (result.exitCode !== 0) {
        // Print ffmpeg stderr to help diagnose failures
        console.error("ffmpeg stderr:", result.stderr);
      }
      expect(result.exitCode).toBe(0);

      expect(fs.existsSync(outPath)).toBe(true);
      expect(fs.statSync(outPath).size).toBeGreaterThan(1000);

      // Verify stream counts with ffprobe
      const probe = await execa(
        ffprobeBin,
        [
          "-v", "quiet",
          "-print_format", "json",
          "-show_streams",
          outPath,
        ],
        { reject: false },
      );

      expect(probe.exitCode).toBe(0);
      const probeData = JSON.parse(probe.stdout) as {
        streams: Array<{ codec_type: string }>;
      };
      const videoStreams = probeData.streams.filter((s) => s.codec_type === "video");
      const audioStreams = probeData.streams.filter((s) => s.codec_type === "audio");

      expect(videoStreams).toHaveLength(1);
      expect(audioStreams).toHaveLength(1);

      // Cleanup
      fs.rmSync(dir, { recursive: true, force: true });
    },
    60_000,
  );
});
