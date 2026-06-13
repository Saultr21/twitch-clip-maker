import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import fastifyMultipart from "@fastify/multipart";
import { ASSETS_DIR, CLIPS_DIR, ensureDataDirs } from "./lib/paths.js";
import { ensureBinaries } from "./services/binaries.js";
import { clipRoutes } from "./routes/clips.js";
import { projectRoutes } from "./routes/projects.js";
import { setupRoutes } from "./routes/setup.js";
import { assetRoutes } from "./routes/assets.js";
import { exportRoutes } from "./routes/export.js";
import { presetRoutes } from "./routes/presets.js";
import { watermarkRoutes } from "./routes/watermarks.js";

ensureDataDirs();

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: CLIPS_DIR,
  prefix: "/files/",
  acceptRanges: true,
});

await app.register(fastifyStatic, {
  root: ASSETS_DIR,
  prefix: "/assets/",
  decorateReply: false,
});

await app.register(fastifyMultipart, {
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});

app.get("/api/health", async () => ({ ok: true }));
setupRoutes(app);
clipRoutes(app);
projectRoutes(app);
assetRoutes(app);
exportRoutes(app);
presetRoutes(app);
watermarkRoutes(app);

await app.listen({ port: 3001, host: "127.0.0.1" });

void ensureBinaries();
