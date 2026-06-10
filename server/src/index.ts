import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { CLIPS_DIR, ensureDataDirs } from "./lib/paths.js";
import { ensureBinaries } from "./services/binaries.js";
import { clipRoutes } from "./routes/clips.js";
import { setupRoutes } from "./routes/setup.js";

ensureDataDirs();

const app = Fastify({ logger: true });

await app.register(fastifyStatic, {
  root: CLIPS_DIR,
  prefix: "/files/",
  acceptRanges: true,
});

app.get("/api/health", async () => ({ ok: true }));
setupRoutes(app);
clipRoutes(app);

await app.listen({ port: 3001, host: "127.0.0.1" });

void ensureBinaries();
