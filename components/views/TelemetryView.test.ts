import { describe, it, expect } from "vitest";
import { formatTelemetryEventName } from "./TelemetryView";

describe("Telemetry SSE Node Display", () => {
  it("displays the actual running node instead of generic NODE_STATE_CHANGE", () => {
    // Both nodeName and nodeId
    const eventWithBoth = {
      event: "NODE_STATE_CHANGE",
      runId: "run-123",
      nodeId: "node_fraud",
      nodeName: "Fraud Risk Scoring",
      status: "RUNNING",
    };
    expect(formatTelemetryEventName(eventWithBoth)).toBe("Fraud Risk Scoring (node_fraud)");

    // Only nodeId provided
    const eventWithIdOnly = {
      event: "NODE_STATE_CHANGE",
      runId: "run-123",
      nodeId: "node_http_1",
      status: "RUNNING",
    };
    expect(formatTelemetryEventName(eventWithIdOnly)).toBe("node_http_1");

    // Identical nodeName and nodeId
    const eventWithIdentical = {
      event: "NODE_STATE_CHANGE",
      runId: "run-123",
      nodeId: "step_1",
      nodeName: "step_1",
      status: "SUCCESS",
    };
    expect(formatTelemetryEventName(eventWithIdentical)).toBe("step_1");
  });

  it("preserves non-node cluster events", () => {
    expect(formatTelemetryEventName({ event: "WORKFLOW_TRIGGERED" })).toBe("WORKFLOW_TRIGGERED");
    expect(formatTelemetryEventName({ event: "WORKFLOW_COMPLETED" })).toBe("WORKFLOW_COMPLETED");
    expect(formatTelemetryEventName({ event: "DLQ_ROUTED" })).toBe("DLQ_ROUTED");
  });
});

