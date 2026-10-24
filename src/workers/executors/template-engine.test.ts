import { describe, it, expect } from "vitest";
import {
  resolveJsonPath,
  resolveContextPath,
  interpolateTemplate,
  interpolateValue,
} from "./template-engine";

describe("T3.2: Template Engine & JSON Path Resolution", () => {
  const context = {
    node_1: {
      data: {
        userId: 9876,
        username: "alice_crypto",
        profile: {
          email: "alice@example.com",
        },
      },
      output: {
        transactionId: "tx_01ABC",
        amount: 149.99,
      },
    },
    node_2: {
      userId: 5555,
      items: [
        { id: 101, title: "Item 1" },
        { id: 102, title: "Item 2" },
      ],
    },
    TRIGGER: {
      payload: {
        orderId: "ord_999",
        region: "us-east-1",
      },
    },
    trigger: {
      clientIp: "127.0.0.1",
    },
    payload: {
      eventId: "evt_123",
    },
  };

  describe("resolveJsonPath", () => {
    it("resolves basic dot notation paths", () => {
      expect(resolveJsonPath(context, "node_1.data.userId")).toBe(9876);
      expect(resolveJsonPath(context, "node_1.data.profile.email")).toBe("alice@example.com");
    });

    it("resolves array brackets and dot indices", () => {
      expect(resolveJsonPath(context, "node_2.items[0].id")).toBe(101);
      expect(resolveJsonPath(context, "node_2.items.1.title")).toBe("Item 2");
    });

    it("returns undefined safely for non-existent paths", () => {
      expect(resolveJsonPath(context, "node_1.data.nonExistent")).toBeUndefined();
      expect(resolveJsonPath(context, "nonExistent.subField")).toBeUndefined();
      expect(resolveJsonPath(null, "foo.bar")).toBeUndefined();
    });
  });

  describe("resolveContextPath (heuristics)", () => {
    it("resolves exact nested node path", () => {
      expect(resolveContextPath(context, "node_1.data.userId")).toBe(9876);
      expect(resolveContextPath(context, "node_1.output.transactionId")).toBe("tx_01ABC");
    });

    it("resolves node output without explicit .data or .output segment", () => {
      expect(resolveContextPath(context, "node_1.transactionId")).toBe("tx_01ABC");
      expect(resolveContextPath(context, "node_2.userId")).toBe(5555);
    });

    it("resolves trigger and payload shortcuts", () => {
      expect(resolveContextPath(context, "TRIGGER.payload.orderId")).toBe("ord_999");
      expect(resolveContextPath(context, "trigger.clientIp")).toBe("127.0.0.1");
      expect(resolveContextPath(context, "payload.eventId")).toBe("evt_123");
      expect(resolveContextPath(context, "trigger.orderId")).toBe("ord_999");
    });
  });

  describe("interpolateTemplate (string interpolation)", () => {
    it("interpolates {{node_1.data.userId}} into URL string", () => {
      const template = "https://api.stripe.com/v1/users/{{node_1.data.userId}}/charge?order={{TRIGGER.payload.orderId}}";
      const result = interpolateTemplate(template, context);
      expect(result).toBe("https://api.stripe.com/v1/users/9876/charge?order=ord_999");
    });

    it("handles whitespace inside mustache tags", () => {
      const template = "Bearer {{  node_1.output.transactionId  }}";
      expect(interpolateTemplate(template, context)).toBe("Bearer tx_01ABC");
    });

    it("replaces missing variables with empty string", () => {
      const template = "User: {{node_1.data.username}} - Token: {{missing.token}}";
      expect(interpolateTemplate(template, context)).toBe("User: alice_crypto - Token: ");
    });
  });

  describe("interpolateValue (typed interpolation)", () => {
    it("preserves primitive types when entire value is a single expression", () => {
      expect(interpolateValue("{{node_1.data.userId}}", context)).toBe(9876);
      expect(interpolateValue("{{node_1.output.amount}}", context)).toBe(149.99);
      expect(interpolateValue("{{node_2.items}}", context)).toEqual([
        { id: 101, title: "Item 1" },
        { id: 102, title: "Item 2" },
      ]);
    });

    it("recursively interpolates nested objects and arrays", () => {
      const inputObj = {
        userId: "{{node_1.data.userId}}",
        description: "Payment for {{TRIGGER.payload.orderId}}",
        metadata: {
          email: "{{node_1.data.profile.email}}",
          tags: ["charge", "{{payload.eventId}}"],
        },
      };

      const result = interpolateValue(inputObj, context) as any;
      expect(result.userId).toBe(9876);
      expect(result.description).toBe("Payment for ord_999");
      expect(result.metadata.email).toBe("alice@example.com");
      expect(result.metadata.tags).toEqual(["charge", "evt_123"]);
    });

    it("safely resolves variables with case-insensitive and snake/camelCase differences", () => {
      expect(interpolateTemplate("{{node_1.data.userid}}", context)).toBe("9876");
      expect(interpolateTemplate("{{node_1.data.user_id}}", context)).toBe("9876");
    });
  });
});

