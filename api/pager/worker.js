import crypto from "node:crypto";
import { db } from "@biteshark/runtime-adapter";
import { applyPrivateNoStoreHeaders } from "../../lib/authz.js";
import {
  DEFAULT_WORKER_CONCURRENCY,
  DEFAULT_PROVIDER_TIMEOUT_MS,
  DEFAULT_WORKER_EXECUTION_BUDGET_MS,
  WORKER_LEASE_SECONDS,
  runNotificationWorkerBatch
} from "../../lib/pager-notifications.js";
import { readEnvCompat, EnvAliasConflictError } from "../../lib/env-compat.js";
import { cleanupExpiredAuthRecords } from "../../lib/standalone-auth.js";
import {
  cleanupExpiredDiagnostics,
  recordDiagnosticEvent,
  recordWorkerHeartbeat
} from "../../lib/diagnostics.js";
import { reconcilePhotoStorage } from "../../lib/customer-exploration.js";
import { cleanupExpiredGovernanceRecords } from "../../lib/admin-governance.js";

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

export default async function (req, res) {
  applyPrivateNoStoreHeaders(res);

  let expectedSecret = "";
  try {
    expectedSecret = readEnvCompat("NOTIFICATION_WORKER_SECRET", { securityCritical: true });
  } catch (err) {
    if (err instanceof EnvAliasConflictError) {
      return res.status(503).json({
        error: "Notification worker secret configuration is conflicted.",
        code: "WORKER_NOT_CONFIGURED"
      });
    }
    throw err;
  }
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
  const concurrency = Math.max(
    1,
    Math.min(5, Number(b.concurrency) || DEFAULT_WORKER_CONCURRENCY)
  );
  const executionBudgetMs = Math.max(
    500,
    Math.min(25000, Number(b.execution_budget_ms) || DEFAULT_WORKER_EXECUTION_BUDGET_MS)
  );
  const runCleanup = b.cleanup !== false;
  const now = req._testNow instanceof Date ? req._testNow : null;
  const clock = typeof req._testClock === "function" ? req._testClock : null;
  const hooks = req._testHooks && typeof req._testHooks === "object" ? req._testHooks : null;
  const leaseSeconds =
    typeof req._testLeaseSeconds === "number" ? req._testLeaseSeconds : WORKER_LEASE_SECONDS;
  const providerTimeoutMs =
    typeof req._testProviderTimeoutMs === "number"
      ? req._testProviderTimeoutMs
      : DEFAULT_PROVIDER_TIMEOUT_MS;
  const workerId =
    typeof req._testWorkerId === "string" && req._testWorkerId.trim()
      ? req._testWorkerId.trim()
      : undefined;

  try {
    const releaseSha = readEnvCompat("RELEASE_SHA") || process.env.GITHUB_SHA || "dev";
    const result = await runNotificationWorkerBatch(db, {
      batchSize,
      concurrency,
      leaseSeconds,
      providerTimeoutMs,
      executionBudgetMs,
      workerId,
      now,
      clock,
      hooks,
      runCleanup
    });
    let authCleanup = null;
    let diagnosticsCleanup = null;
    let photoReconciliation = null;
    let governanceCleanup = null;
    if (runCleanup) {
      authCleanup = await cleanupExpiredAuthRecords(db, { now: now || new Date() }).catch(async err => {
        await recordDiagnosticEvent(db, {
          component: "worker",
          featureKey: "worker_runtime",
          operationName: "worker.cleanup_expired_auth_records",
          routeTemplate: "/api/pager/worker",
          severity: "warning",
          errorCode: "AUTH_CLEANUP_FAILED",
          message: err?.message || "Expired auth cleanup encountered an error.",
          serverReleaseSha: releaseSha,
          retryable: true,
          outcomeState: "degraded"
        });
        return null;
      });
      diagnosticsCleanup = await cleanupExpiredDiagnostics(db).catch(() => null);
      photoReconciliation = await reconcilePhotoStorage(db, { now: now || new Date() }).catch(() => null);
      governanceCleanup = await cleanupExpiredGovernanceRecords(db, { now: now || new Date() }).catch(() => null);
    }

    const failedCount = Number(result.failed_permanent || result.failed || 0);
    if (failedCount > 0) {
      await recordDiagnosticEvent(db, {
        component: "worker",
        featureKey: "push_delivery",
        operationName: "worker.pager_notification_batch",
        routeTemplate: "/api/pager/worker",
        severity: "warning",
        errorCode: "PUSH_DELIVERY_BATCH_FAILURE",
        message: `Pager notification worker marked ${failedCount} delivery item(s) permanently failed during batch.`,
        serverReleaseSha: releaseSha,
        retryable: false,
        outcomeState: "partial_success",
        safeContext: {
          queue_depth: Number(result.claimed || 0),
          attempt: failedCount
        }
      });
    }

    await recordWorkerHeartbeat(db, {
      workerName: "pager_notifications",
      status: failedCount > 0 ? "degraded" : "ok",
      releaseSha,
      correlationId: req?.__bsCorrelationId || null,
      summary: {
        queue_depth: Number(result.claimed || 0)
      }
    });

    const executedIso = (now || new Date()).toISOString();
    return res.json({
      ok: true,
      executed_at: executedIso,
      ...result,
      ...(authCleanup ? { auth_cleanup: authCleanup } : {}),
      ...(diagnosticsCleanup?.ok ? { diagnostics_cleanup: diagnosticsCleanup } : {}),
      ...(photoReconciliation?.ok ? { photo_reconciliation: photoReconciliation } : {}),
      ...(governanceCleanup?.ok ? { governance_cleanup: governanceCleanup } : {})
    });
  } catch (err) {
    await recordWorkerHeartbeat(db, {
      workerName: "pager_notifications",
      status: "error",
      releaseSha: readEnvCompat("RELEASE_SHA") || "dev",
      correlationId: req?.__bsCorrelationId || null
    });
    return res.status(503).json({
      error: "Notification delivery worker encountered a database error.",
      code: "WORKER_DB_UNAVAILABLE"
    });
  }
}
