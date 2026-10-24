/**
 * Safe, robust JSON Path resolution and template variable interpolation engine.
 * Supports syntax like {{node_1.data.userId}}, {{node_1.output.id}}, {{TRIGGER.payload.orderId}},
 * {{trigger.foo}}, {{payload.bar}}, and array indexing {{items[0].id}}.
 */

/**
 * Safely resolves a nested property path from an object without throwing errors.
 * Supports dot notation ('a.b.c') and array indexing ('items[0].id' or 'items.0.id').
 */
export function resolveJsonPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined || !path || typeof path !== "string") {
    return undefined;
  }

  const trimmed = path.trim();
  if (trimmed === "") return obj;

  // Normalize array brackets to dot notation: "items[0].id" -> "items.0.id"
  const normalizedPath = trimmed
    .replace(/\[(\d+)\]/g, ".$1")
    .replace(/^\./, "");

  const segments = normalizedPath.split(".");
  let current: any = obj;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current !== "object") {
      return undefined;
    }

    let next = current[segment];

    // Case-insensitive & snake_case/camelCase tolerant fallback if exact match not found
    if (next === undefined && typeof current === "object" && current !== null && !Array.isArray(current)) {
      const normSegment = segment.toLowerCase().replace(/[-_]/g, "");
      const matchedKey = Object.keys(current).find(
        (k) => k.toLowerCase().replace(/[-_]/g, "") === normSegment
      );
      if (matchedKey) {
        next = current[matchedKey];
      }
    }

    current = next;
  }

  return current;
}

/**
 * Resolves a template path expression from the execution context with heuristic fallbacks.
 * For example: 'node_1.data.userId' checks context.node_1.data.userId, context.node_1.output.userId, context.node_1.userId.
 */
export function resolveContextPath(context: Record<string, unknown>, rawPath: string): unknown {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const path = rawPath.trim();

  // 1. Direct path lookup in context
  const directResult = resolveJsonPath(context, path);
  if (directResult !== undefined) {
    return directResult;
  }

  // 2. Direct key match (e.g., if context has a key named exactly like the path)
  if (path in context && context[path] !== undefined) {
    return context[path];
  }

  // 3. Fallback heuristics for node outputs:
  // e.g., 'node_1.data.userId' when node_1 is stored as { output: { userId: 123 } } or vice versa
  const parts = path.split(".");
  if (parts.length >= 2) {
    const rootKey = parts[0];
    const rootObj = context[rootKey];

    if (rootObj && typeof rootObj === "object") {
      const restPath = parts.slice(1).join(".");

      // Try rootObj.output.restPath
      const fromOutput = resolveJsonPath((rootObj as any).output, restPath);
      if (fromOutput !== undefined) return fromOutput;

      // Try rootObj.data.restPath
      const fromData = resolveJsonPath((rootObj as any).data, restPath);
      if (fromData !== undefined) return fromData;

      // If parts[1] is 'data' or 'output', try without that segment:
      // e.g. path was 'node_1.data.userId', try rootObj.userId
      if (parts[1] === "data" || parts[1] === "output") {
        const collapsedPath = parts.slice(2).join(".");
        if (collapsedPath) {
          const directOnRoot = resolveJsonPath(rootObj, collapsedPath);
          if (directOnRoot !== undefined) return directOnRoot;
        } else {
          return rootObj;
        }
      }
    }
  }

  // 4. Fallback heuristics for trigger / payload:
  // e.g., 'payload.userId' or 'trigger.userId' when context has TRIGGER.payload
  if (path.startsWith("payload.") || path.startsWith("trigger.") || path.startsWith("TRIGGER.")) {
    const triggerData =
      context.TRIGGER || context.trigger || context.triggerPayload || context.payload;

    if (triggerData && typeof triggerData === "object") {
      const fieldPath = path.replace(/^(payload|trigger|TRIGGER)(\.payload)?\./, "");
      const res1 = resolveJsonPath(triggerData, fieldPath);
      if (res1 !== undefined) return res1;

      const res2 = resolveJsonPath((triggerData as any).payload, fieldPath);
      if (res2 !== undefined) return res2;
    }
  }

  return undefined;
}

/**
 * Replaces all {{ variable }} patterns in a template string with resolved context values.
 * If a variable cannot be resolved, it replaces it with an empty string.
 */
export function interpolateTemplate(
  template: string,
  context: Record<string, unknown>
): string {
  if (typeof template !== "string") {
    return String(template ?? "");
  }

  // Matches {{ variable }} or {{   node_1.data.id   }}
  return template.replace(/\{\{\s*([a-zA-Z0-9_$.\[\]]+)\s*\}\}/g, (_, expression) => {
    const resolved = resolveContextPath(context, expression);

    if (resolved === null || resolved === undefined) {
      return "";
    }

    if (typeof resolved === "object") {
      try {
        return JSON.stringify(resolved);
      } catch {
        return String(resolved);
      }
    }

    return String(resolved);
  });
}

/**
 * Recursively interpolates values within strings, objects, and arrays.
 * If a string is EXACTLY a single expression like "{{node_1.data.count}}",
 * the raw typed value (e.g., number, object, array, boolean) is preserved.
 */
export function interpolateValue(
  value: unknown,
  context: Record<string, unknown>
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    const exactMatch = value.match(/^\s*\{\{\s*([a-zA-Z0-9_$.\[\]]+)\s*\}\}\s*$/);
    if (exactMatch) {
      const resolved = resolveContextPath(context, exactMatch[1]);
      if (resolved !== undefined) {
        return resolved;
      }
      return "";
    }
    return interpolateTemplate(value, context);
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolateValue(item, context));
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const interpolatedKey = interpolateTemplate(k, context);
      result[interpolatedKey] = interpolateValue(v, context);
    }
    return result;
  }

  return value;
}
