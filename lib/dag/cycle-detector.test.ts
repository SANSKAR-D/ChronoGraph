import { describe, it, expect } from "vitest";
import { validateDAG } from "./cycle-detector";

describe("validateDAG mathematical engine", () => {
  it("validates a simple linear DAG and computes topological order", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(true);
    expect(result.cyclePath).toBeNull();
    expect(result.topologicalOrder).toEqual(["A", "B", "C"]);
    expect(result.baseIndegrees).toEqual({ A: 0, B: 1, C: 1 });
    expect(result.adjacencyMap).toEqual({
      A: ["B"],
      B: ["C"],
      C: [],
    });
  });

  it("handles diamond convergence (fan-out and fan-in)", () => {
    // A -> B, A -> C, B -> D, C -> D
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const edges = [
      { source: "A", target: "B" },
      { source: "A", target: "C" },
      { source: "B", target: "D" },
      { source: "C", target: "D" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(true);
    expect(result.cyclePath).toBeNull();
    expect(result.baseIndegrees).toEqual({ A: 0, B: 1, C: 1, D: 2 });
    expect(result.topologicalOrder[0]).toBe("A");
    expect(result.topologicalOrder[3]).toBe("D");
    expect(result.topologicalOrder.slice(1, 3)).toEqual(
      expect.arrayContaining(["B", "C"])
    );
  });

  it("catches self-loops (A -> A) and returns exact cycle path", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [
      { source: "A", target: "A" },
      { source: "A", target: "B" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(false);
    expect(result.cyclePath).toEqual(["A", "A"]);
    expect(result.topologicalOrder).toEqual([]);
    expect(result.error).toContain("Cycle detected: A -> A");
  });

  it("catches 2-node direct cycle (A -> B -> A)", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "A" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(false);
    expect(result.cyclePath).toBeDefined();
    expect(result.cyclePath).toEqual(
      expect.arrayContaining(["A", "B", "A"])
    );
    expect(result.topologicalOrder).toEqual([]);
    expect(result.error).toMatch(/Cycle detected:/);
  });

  it("catches deep 6-node transitive cycles (A -> B -> C -> D -> E -> F -> B)", () => {
    const nodes = [
      { id: "A" },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "E" },
      { id: "F" },
    ];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
      { source: "D", target: "E" },
      { source: "E", target: "F" },
      { source: "F", target: "B" }, // Transitive back-edge forming 5-node loop inside 6-node graph
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(false);
    expect(result.cyclePath).toEqual(["B", "C", "D", "E", "F", "B"]);
    expect(result.topologicalOrder).toEqual([]);
    expect(result.error).toContain("Cycle detected: B -> C -> D -> E -> F -> B");
  });

  it("catches full 6-node transitive cycle (A -> B -> C -> D -> E -> F -> A)", () => {
    const nodes = [
      { id: "A" },
      { id: "B" },
      { id: "C" },
      { id: "D" },
      { id: "E" },
      { id: "F" },
    ];
    const edges = [
      { source: "A", target: "B" },
      { source: "B", target: "C" },
      { source: "C", target: "D" },
      { source: "D", target: "E" },
      { source: "E", target: "F" },
      { source: "F", target: "A" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(false);
    expect(result.cyclePath).toEqual(["A", "B", "C", "D", "E", "F", "A"]);
    expect(result.topologicalOrder).toEqual([]);
  });

  it("validates disconnected forest (parallel DAG components)", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const edges = [
      { source: "A", target: "B" },
      { source: "C", target: "D" },
    ];

    const result = validateDAG(nodes, edges);

    expect(result.isValid).toBe(true);
    expect(result.cyclePath).toBeNull();
    expect(result.topologicalOrder.length).toBe(4);
    expect(result.baseIndegrees).toEqual({ A: 0, B: 1, C: 0, D: 1 });
  });

  it("handles empty nodes and edges gracefully", () => {
    const result = validateDAG([], []);

    expect(result.isValid).toBe(true);
    expect(result.cyclePath).toBeNull();
    expect(result.topologicalOrder).toEqual([]);
    expect(result.baseIndegrees).toEqual({});
    expect(result.adjacencyMap).toEqual({});
  });
});
