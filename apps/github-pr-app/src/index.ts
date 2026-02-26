import { createServer } from "node:http";
import { Webhooks } from "@octokit/webhooks";
import { readEnv } from "./lib/env";
import { logger } from "./lib/logger";
import { handlePullRequestEvent } from "./lib/pull-request-handler";
import type { PullRequestEventPayload } from "./types/github";

const env = readEnv();

const webhooks = new Webhooks({
  secret: env.webhookSecret,
});

webhooks.on("pull_request", async ({ payload }) => {
  await handlePullRequestEvent(payload as PullRequestEventPayload, env, logger);
});

webhooks.onError((error) => {
  logger.error("Webhook processing failed", {
    id: error.event.id,
    name: error.event.name,
    message: error.message,
  });
});

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.method !== "POST" || req.url !== "/webhooks/github") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
    return;
  }

  const chunks: Buffer[] = [];
  req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));

  req.on("end", async () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const id = req.headers["x-github-delivery"];
    const name = req.headers["x-github-event"];
    const signature = req.headers["x-hub-signature-256"];

    if (typeof id !== "string" || typeof name !== "string" || typeof signature !== "string") {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing GitHub webhook headers" }));
      return;
    }

    try {
      await webhooks.verifyAndReceive({
        id,
        name,
        payload: body,
        signature,
      });

      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ accepted: true }));
    } catch (error) {
      logger.error("Webhook verification failed", {
        id,
        name,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid webhook signature" }));
    }
  });
});

server.listen(env.port, () => {
  logger.info("GitHub PR app server started", {
    port: env.port,
    webhookPath: "/webhooks/github",
    healthPath: "/health",
    logLevel: env.logLevel,
  });
});
