import Fastify from "fastify";
import { ensureDataDirs } from "./lib/paths.js";
import { ensureBinaries } from "./services/binaries.js";
import { setupRoutes } from "./routes/setup.js";

ensureDataDirs();

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));
setupRoutes(app);

await app.listen({ port: 3001, host: "127.0.0.1" });

void ensureBinaries();
