import Fastify from "fastify";
import { ensureDataDirs } from "./lib/paths.js";

ensureDataDirs();

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true }));

await app.listen({ port: 3001, host: "127.0.0.1" });
