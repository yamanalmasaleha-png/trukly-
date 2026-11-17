import crypto from "node:crypto";
import { db } from "hatchable";
import { applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import { runNotificationWorkerBatch } from "../../lib/pager-notifications.js";

export const access = "public";
export const methods = ["POST"];

function extractWorkerToken(req) {
  const headers = req?.headers || {};
  const authHeader = String(headers.authorization || headers.Authorization || "").trim();
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  return String(headers["x-worker-secret"] || headers["X-Worker-Secret"] || "").trim();
}

function timingSafeSecretEqual(expected, supplied) {
  if (typeof expected !== "string" || typeof supplied !== "string") return false;
  if (expected.length < 24 || expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(supplied, "utf8"));
}

export default async function(req, res) {
  applyPrivateNoStoreHeaders(res);

  const expectedSecret = String(process.env.TRUCKLY_NOTIFICATION_WORKER_SECRET || "").trim();
  if (expectedSecret.length < 24) {
    return res.status(503).json({
      error: "Notification worker secret is not configured.",
      code: "WORKER_NOT_CONFIGURED"
    });
  }

  const suppliedSecret = extractWorkerToken(req);
  if (!timingSafeSecretEqual(expectedSecret, suppliedSecret)) {
    return res.status(401).json({ error: "Unauthorized worker invocation." });
  }

  const b = req.body && typeof req.body === "object" ? req.body : {};
  const batchSize = Math.max(1, Math.min(25, Number(b.batch_size) || 15));
  const runCleanup = b.cleanup !== false;
  const now = req._testNow instanceof Date ? req._testNow : new Date();

  try {
    const result = await runNotificationWorkerBatch(db, {
      batchSize,
      now,
      runCleanup
    });
    return res.json({
      ok: true,
      executed_at: now.toISOString(),
      ...result
    });
  } catch {
    return res.status(503).json({
      error: "Notification delivery worker encountered a database error.",
      code: "WORKER_DB_UNAVAILABLE"
    });
  }
}
