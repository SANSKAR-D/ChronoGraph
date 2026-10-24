import { describe, it, expect } from "vitest";
import {
  executeTransformNode,
  TransformExecutionError,
} from "./transform-executor";

describe("T3.2: executeTransformNode Executor", () => {
  const samplePayload = {
    data: {
      items: [
        { id: 1, title: "Alpha", status: "active", price: 10 },
        { id: 2, title: "Beta", status: "archived", price: 25 },
        { id: 3, title: "Gamma", status: "active", price: 50 },
      ],
      user: {
        id: "usr_99",
        profile: {
          firstName: "Jane",
          lastName: "Doe",
        },
      },
    },
  };

  it("extracts data using safe JSON path selector", async () => {
    const result = await executeTransformNode({
      payload: samplePayload,
      selector: "data.items",
    });

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(3);
    expect((result.data as any)[0].title).toBe("Alpha");
  });

  it("safely remaps JSON fields using mapping dictionary", async () => {
    const result = await executeTransformNode({
      payload: samplePayload,
      mapping: {
        userId: "data.user.id",
        fullName: "data.user.profile.firstName",
        nonExistentField: "data.user.missing",
      },
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      userId: "usr_99",
      fullName: "Jane",
      nonExistentField: undefined,
    });
  });

  it("filters array items based on field predicate", async () => {
    const items = (samplePayload as any).data.items;

    const result = await executeTransformNode({
      payload: items,
      filter: {
        field: "status",
        operator: "eq",
        value: "active",
      },
    });

    expect(result.success).toBe(true);
    const filtered = result.data as any[];
    expect(filtered).toHaveLength(2);
    expect(filtered.map((x) => x.id)).toEqual([1, 3]);
  });

  it("executes safe script expressions e.g. payload.items.map(i => i.id)", async () => {
    const result = await executeTransformNode({
      payload: samplePayload,
      script: "payload.data.items.map(i => i.id)",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it("blocks dangerous scripts containing prohibited keywords", async () => {
    await expect(
      executeTransformNode({
        payload: samplePayload,
        script: "process.exit(1)",
      })
    ).rejects.toThrowError(TransformExecutionError);

    await expect(
      executeTransformNode({
        payload: samplePayload,
        script: "require('fs')",
      })
    ).rejects.toThrowError(/Security restriction/);
  });

  it("permits scripts with property access like item.process and supports get helper", async () => {
    const payloadWithProcess = {
      items: [
        { id: 10, process: "settlement" },
        { id: 20, process: "refund" },
      ],
      user: { profile: { id: "u_1" } },
    };

    const result = await executeTransformNode({
      payload: payloadWithProcess,
      script: "payload.items.map(i => ({ id: i.id, p: i.process, uid: get(payload, 'user.profile.id') }))",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual([
      { id: 10, p: "settlement", uid: "u_1" },
      { id: 20, p: "refund", uid: "u_1" },
    ]);
  });
});

