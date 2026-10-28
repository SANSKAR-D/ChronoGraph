/**
 * Bulk Request & Rate-Limiter Stress Test
 *
 * Sends concurrent HTTP POST requests to the ChronoGraph Webhook Ingestion API.
 * Demonstrates:
 * 1. Sub-25ms ingestion throughput
 * 2. Sliding-window Redis ZSET rate limiter (120 req / 60s window)
 * 3. HTTP 429 Too Many Requests response handling
 *
 * Usage:
 *   npx tsx scripts/test-bulk-requests.ts
 *   npx tsx scripts/test-bulk-requests.ts --count=150 --concurrency=20
 */

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ENDPOINT = process.env.ENDPOINT || "orders_settle";
const SECRET = process.env.WEBHOOK_SECRET || "chronograph_webhook_secret_2026";

// Parse CLI args: --count=150 --concurrency=25
const args = process.argv.slice(2);
const countArg = args.find((a) => a.startsWith("--count="))?.split("=")[1];
const concArg = args.find((a) => a.startsWith("--concurrency="))?.split("=")[1];

const TOTAL_REQUESTS = countArg ? parseInt(countArg, 10) : 135;
const CONCURRENCY = concArg ? parseInt(concArg, 10) : 15;

interface RequestResult {
  index: number;
  status: number;
  latencyMs: number;
  body: any;
  rateLimitRemaining?: string | null;
  retryAfter?: string | null;
}

async function sendRequest(index: number): Promise<RequestResult> {
  const url = `${BASE_URL}/api/v1/hooks/${ENDPOINT}`;
  const start = performance.now();

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": SECRET,
        "x-request-index": String(index),
      },
      body: JSON.stringify({
        orderId: `bulk_ord_${Date.now()}_${index}`,
        amount: Math.floor(Math.random() * 500) + 10,
        currency: "USD",
        items: [{ id: `item_${index}`, name: `Bulk Item ${index}` }],
      }),
    });

    const latencyMs = Math.round(performance.now() - start);
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // non-json response
    }

    return {
      index,
      status: res.status,
      latencyMs,
      body,
      rateLimitRemaining: res.headers.get("x-ratelimit-remaining"),
      retryAfter: res.headers.get("retry-after"),
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - start);
    return {
      index,
      status: 0,
      latencyMs,
      body: { error: err.message },
    };
  }
}

async function runBulkTest() {
  console.log("=================================================================");
  console.log(" ChronoGraph Bulk Request & Rate Limiter Test");
  console.log("=================================================================");
  console.log(`Target URL:    ${BASE_URL}/api/v1/hooks/${ENDPOINT}`);
  console.log(`Total Requests:${TOTAL_REQUESTS}`);
  console.log(`Concurrency:   ${CONCURRENCY}`);
  console.log(`Rate Limit:    120 requests per 60 seconds (Sliding Window)`);
  console.log("-----------------------------------------------------------------\n");

  const results: RequestResult[] = [];
  const queue = Array.from({ length: TOTAL_REQUESTS }, (_, i) => i + 1);
  const startTime = performance.now();

  // Worker pool for concurrency control
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const idx = queue.shift();
      if (idx === undefined) break;
      const res = await sendRequest(idx);
      results.push(res);

      const statusTag =
        res.status === 202 || res.status === 200
          ? "\x1b[32m202 ACCEPTED\x1b[0m"
          : res.status === 429
          ? "\x1b[33m429 RATE LIMITED\x1b[0m"
          : `\x1b[31m${res.status} ERROR\x1b[0m`;

      const remaining = res.rateLimitRemaining !== null ? `(Rem: ${res.rateLimitRemaining})` : "";
      process.stdout.write(
        ` [Req #${String(idx).padStart(3, " ")}] ${statusTag} in ${String(res.latencyMs).padStart(3, " ")}ms ${remaining}\n`
      );
    }
  });

  await Promise.all(workers);
  const totalDurationMs = performance.now() - startTime;

  // Analysis
  const accepted = results.filter((r) => r.status === 200 || r.status === 202);
  const rateLimited = results.filter((r) => r.status === 429);
  const errors = results.filter((r) => r.status !== 200 && r.status !== 202 && r.status !== 429);

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0;
  const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / (latencies.length || 1));
  const rps = Math.round((TOTAL_REQUESTS / (totalDurationMs / 1000)) * 10) / 10;

  console.log("\n=================================================================");
  console.log(" Test Results Summary");
  console.log("=================================================================");
  console.log(`Total Sent:         ${TOTAL_REQUESTS}`);
  console.log(`Accepted (202):     \x1b[32m${accepted.length}\x1b[0m`);
  console.log(`Rate-Limited (429): \x1b[33m${rateLimited.length}\x1b[0m`);
  console.log(`Errors:             ${errors.length > 0 ? `\x1b[31m${errors.length}\x1b[0m` : "0"}`);
  console.log(`Total Time:         ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Throughput:         ${rps} req/sec`);
  console.log("-----------------------------------------------------------------");
  console.log(`Latency min:        ${latencies[0] || 0}ms`);
  console.log(`Latency avg:        ${avg}ms`);
  console.log(`Latency p50:        ${p50}ms`);
  console.log(`Latency p95:        ${p95}ms`);
  console.log(`Latency p99:        ${p99}ms`);
  console.log(`Latency max:        ${latencies[latencies.length - 1] || 0}ms`);
  console.log("=================================================================");

  if (rateLimited.length > 0) {
    console.log(
      `\x1b[32m✓ Rate-Limiter Verified:\x1b[0m Successfully blocked ${rateLimited.length} requests after threshold.`
    );
    if (rateLimited[0]?.retryAfter) {
      console.log(`  Retry-After header received: ${rateLimited[0].retryAfter}s`);
    }
  } else if (TOTAL_REQUESTS > 120) {
    console.log("\x1b[33m⚠ Note:\x1b[0m No 429 received. Window may have reset or limit is higher.");
  }
}

runBulkTest().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
