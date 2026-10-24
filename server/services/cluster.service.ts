import {
  getClusterHealth,
  ClusterHealthDependencies,
  ClusterHealthResult,
} from "@/lib/telemetry/cluster-health";

export const ClusterService = {
  /**
   * Evaluates overall cluster health, active worker count, heartbeat timestamps,
   * and BullMQ / DLQ queue metrics.
   */
  getHealth: (deps?: ClusterHealthDependencies): Promise<ClusterHealthResult> => {
    return getClusterHealth(deps);
  },
};

export default ClusterService;
