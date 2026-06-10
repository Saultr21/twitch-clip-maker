import type { FastifyInstance } from "fastify";
import { getSetupStatus } from "../services/binaries.js";

export function setupRoutes(app: FastifyInstance): void {
  app.get("/api/setup/status", async () => getSetupStatus());
}
