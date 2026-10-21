export interface DAGNode {
  id: string;
  [key: string]: unknown;
}

export interface DAGEdge {
  id?: string;
  source: string;
  target: string;
  [key: string]: unknown;
}

export interface DAGValidationResult {
  isValid: boolean;
  cyclePath: string[] | null;
  topologicalOrder: string[];
  adjacencyMap: Record<string, string[]>;
  baseIndegrees: Record<string, number>;
  error?: string;
}

/**
 * Validates a Directed Acyclic Graph (DAG) using:
 * 1. 3-Color DFS (White=0, Gray=1, Black=2) to identify back-edges and extract the exact cycle path for UI highlighting.
 * 2. Kahn's in-degree BFS algorithm to verify acyclicity, generate topological execution order,
 *    and pre-compile adjacency maps and in-degrees for Redis/PostgreSQL orchestration.
 */
export function validateDAG(
  nodes: DAGNode[] = [],
  edges: DAGEdge[] = []
): DAGValidationResult {
  const adjacencyMap: Record<string, string[]> = {};
  const baseIndegrees: Record<string, number> = {};

  // 1. Register all nodes
  for (const node of nodes) {
    if (node?.id) {
      adjacencyMap[node.id] = [];
      baseIndegrees[node.id] = 0;
    }
  }

  // Also ensure any node referenced in edges exists
  for (const edge of edges) {
    if (edge?.source && !(edge.source in adjacencyMap)) {
      adjacencyMap[edge.source] = [];
      baseIndegrees[edge.source] = 0;
    }
    if (edge?.target && !(edge.target in adjacencyMap)) {
      adjacencyMap[edge.target] = [];
      baseIndegrees[edge.target] = 0;
    }
  }

  // 2. Build adjacency list and compute in-degrees (deduplicate parallel edges)
  const seenEdges = new Set<string>();
  for (const edge of edges) {
    if (!edge?.source || !edge?.target) continue;
    const edgeKey = `${edge.source}->${edge.target}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);

    adjacencyMap[edge.source].push(edge.target);
    baseIndegrees[edge.target] = (baseIndegrees[edge.target] || 0) + 1;
  }

  const allNodeIds = Object.keys(adjacencyMap);

  // 3. 3-Color DFS for cycle path detection
  // 0: WHITE (unvisited), 1: GRAY (visiting / recursion stack), 2: BLACK (visited)
  const colors: Record<string, number> = {};
  for (const id of allNodeIds) {
    colors[id] = 0;
  }

  let cyclePath: string[] | null = null;
  const currentStack: string[] = [];

  function dfs(nodeId: string): boolean {
    colors[nodeId] = 1; // GRAY
    currentStack.push(nodeId);

    const neighbors = adjacencyMap[nodeId] || [];
    for (const neighbor of neighbors) {
      if (colors[neighbor] === 1) {
        // Back-edge found: reconstruct cycle path
        const cycleStartIndex = currentStack.indexOf(neighbor);
        cyclePath = [...currentStack.slice(cycleStartIndex), neighbor];
        return true;
      }
      if (colors[neighbor] === 0) {
        if (dfs(neighbor)) return true;
      }
    }

    currentStack.pop();
    colors[nodeId] = 2; // BLACK
    return false;
  }

  for (const id of allNodeIds) {
    if (colors[id] === 0) {
      if (dfs(id)) break;
    }
  }

  if (cyclePath !== null) {
    const path: string[] = cyclePath;
    return {
      isValid: false,
      cyclePath: path,
      topologicalOrder: [],
      adjacencyMap,
      baseIndegrees,
      error: `Cycle detected: ${path.join(" -> ")}`,
    };
  }

  // 4. Kahn's in-degree algorithm (BFS)
  const inDegreesCopy = { ...baseIndegrees };
  const queue: string[] = [];
  const topologicalOrder: string[] = [];

  for (const id of allNodeIds) {
    if (inDegreesCopy[id] === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    topologicalOrder.push(curr);

    const neighbors = adjacencyMap[curr] || [];
    for (const next of neighbors) {
      inDegreesCopy[next] -= 1;
      if (inDegreesCopy[next] === 0) {
        queue.push(next);
      }
    }
  }

  if (topologicalOrder.length !== allNodeIds.length) {
    return {
      isValid: false,
      cyclePath: null,
      topologicalOrder: [],
      adjacencyMap,
      baseIndegrees,
      error: "Graph contains cycles or unresolved dependencies",
    };
  }

  return {
    isValid: true,
    cyclePath: null,
    topologicalOrder,
    adjacencyMap,
    baseIndegrees,
  };
}
