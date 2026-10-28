import { initSocketServer } from "../lib/socket/server";
import { io } from "socket.io-client";
import { createRedisConnection } from "../lib/redis/client";

async function runTest() {
  console.log("1. Starting Socket.IO server...");
  const server = initSocketServer();

  console.log("2. Connecting test socket client...");
  const client = io("http://localhost:3001", {
    transports: ["websocket"],
    query: { channel: "cluster", runId: "test-run-123" },
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Connection timeout")), 5000);
    client.on("connect", () => {
      clearTimeout(timer);
      console.log("Client connected! Socket ID:", client.id);
      resolve();
    });
  });

  const redisPub = createRedisConnection();

  console.log("3. Testing cluster event dispatch...");
  const clusterEventPromise = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Cluster event timeout")), 5000);
    client.on("cluster:event", (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  await redisPub.publish(
    "channel:cluster:events",
    JSON.stringify({ event: "TEST_CLUSTER_EVENT", timestamp: new Date().toISOString() })
  );
  const receivedCluster = await clusterEventPromise;
  console.log("✓ Received cluster event:", receivedCluster.event);

  console.log("4. Testing run event dispatch...");
  const runEventPromise = new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Run event timeout")), 5000);
    client.on("run:event", (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });

  await redisPub.publish(
    "channel:run:test-run-123",
    JSON.stringify({ event: "NODE_STATE_CHANGE", nodeId: "node-1", status: "COMPLETED" })
  );
  const receivedRun = await runEventPromise;
  console.log("✓ Received run event:", receivedRun.event, "nodeId:", receivedRun.nodeId);

  client.disconnect();
  await redisPub.quit();
  console.log("✅ WebSocket verification test PASSED completely!");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
