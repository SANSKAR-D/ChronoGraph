import { resolveJsonPath } from "./template-engine";

export interface TransformFilterOptions {
  field?: string;
  operator?: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "in";
  value?: unknown;
}

export interface TransformNodeOptions {
  selector?: string;
  mapping?: Record<string, string>;
  filter?: TransformFilterOptions;
  script?: string;
  payload?: unknown;
  context?: Record<string, unknown>;
}

export interface TransformNodeResult {
  success: boolean;
  data: unknown;
  transformedAt: string;
  appliedTransformations: string[];
}

export class TransformExecutionError extends Error {
  originalError?: unknown;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = "TransformExecutionError";
    this.originalError = originalError;
  }
}

/**
 * Evaluates filter predicates safely against an array of objects/items.
 */
function applyArrayFilter(
  items: unknown[],
  filter: TransformFilterOptions
): unknown[] {
  const { field, operator = "eq", value } = filter;

  return items.filter((item) => {
    if (item === null || item === undefined) return false;

    const itemValue = field ? resolveJsonPath(item, field) : item;

    switch (operator) {
      case "eq":
        return itemValue === value;
      case "neq":
        return itemValue !== value;
      case "gt":
        return typeof itemValue === "number" && typeof value === "number" && itemValue > value;
      case "gte":
        return typeof itemValue === "number" && typeof value === "number" && itemValue >= value;
      case "lt":
        return typeof itemValue === "number" && typeof value === "number" && itemValue < value;
      case "lte":
        return typeof itemValue === "number" && typeof value === "number" && itemValue <= value;
      case "contains":
        if (typeof itemValue === "string" && typeof value === "string") {
          return itemValue.includes(value);
        }
        if (Array.isArray(itemValue)) {
          return itemValue.includes(value);
        }
        return false;
      case "in":
        if (Array.isArray(value)) {
          return value.includes(itemValue);
        }
        return false;
      default:
        return itemValue === value;
    }
  });
}

/**
 * Executes safe JavaScript transformation script in a sandboxed Function scope.
 * Supports expressions like `payload.items.map(i => i.id)` or `data.filter(x => x.active)`.
 */
function executeScriptTransformation(
  script: string,
  payload: unknown,
  context: Record<string, unknown>
): unknown {
  const trimmed = script.trim();
  if (!trimmed) return payload;

  // Guard against obvious prototype pollution / process access
  const forbiddenPatterns = [
    /(?<!\.)\bprocess\b/,
    /\brequire\b/,
    /\bimport\b/,
    /\b__proto__\b/,
    /\bconstructor\b\s*\.\s*\bconstructor\b/,
    /\bglobalThis\b/,
  ];

  for (const pattern of forbiddenPatterns) {
    if (pattern.test(trimmed)) {
      throw new TransformExecutionError(
        `Security restriction: script contains disallowed keyword or pattern: ${pattern}`
      );
    }
  }

  try {
    // If the script doesn't contain explicit 'return' or statements, treat as expression
    const code = trimmed.includes("return ")
      ? trimmed
      : `return (${trimmed});`;

    const sandboxFn = new Function(
      "payload",
      "context",
      "data",
      "inputs",
      "get",
      `"use strict"; ${code}`
    );

    return sandboxFn(payload, context, payload, context, resolveJsonPath);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new TransformExecutionError(
      `Transform script execution failed: ${errorMsg}`,
      err
    );
  }
}

/**
 * Executes a JSON Transform Node with safe path mapping, field filtering, and script evaluation.
 *
 * Supported transformation workflows:
 * 1. Safe JSON path selection (options.selector): e.g. "data.items", "payload.user"
 * 2. Key-value path mapping (options.mapping): e.g. { userId: "user.id", total: "invoice.amount" }
 * 3. Array filtering (options.filter): e.g. { field: "status", operator: "eq", value: "active" }
 * 4. Safe JS expression/script (options.script): e.g. "payload.items.map(i => i.id)"
 */
export async function executeTransformNode(
  options: TransformNodeOptions
): Promise<TransformNodeResult> {
  const appliedTransformations: string[] = [];
  const context = options.context || {};

  // Resolve base payload from options.payload, or from context (trigger/upstream)
  let currentData: unknown =
    options.payload !== undefined
      ? options.payload
      : context.payload ?? context.TRIGGER ?? context;

  // 1. Selector path extraction
  if (options.selector && typeof options.selector === "string" && options.selector.trim()) {
    const selectorPath = options.selector.trim();
    // Try resolving from currentData first, then fallback to context
    let selected = resolveJsonPath(currentData, selectorPath);
    if (selected === undefined && context) {
      selected = resolveJsonPath(context, selectorPath);
    }
    currentData = selected;
    appliedTransformations.push(`selector:${selectorPath}`);
  }

  // 2. Safe JSON path mapping
  if (options.mapping && typeof options.mapping === "object" && Object.keys(options.mapping).length > 0) {
    const mappedResult: Record<string, unknown> = {};

    for (const [targetKey, sourcePath] of Object.entries(options.mapping)) {
      if (typeof sourcePath === "string" && sourcePath.trim()) {
        let val = resolveJsonPath(currentData, sourcePath);
        if (val === undefined && context) {
          val = resolveJsonPath(context, sourcePath);
        }
        mappedResult[targetKey] = val;
      }
    }

    currentData = mappedResult;
    appliedTransformations.push(`mapping:${Object.keys(options.mapping).join(",")}`);
  }

  // 3. Array filtering
  if (options.filter && typeof options.filter === "object") {
    if (Array.isArray(currentData)) {
      currentData = applyArrayFilter(currentData, options.filter);
      appliedTransformations.push(
        `filter:${options.filter.field || "item"} ${options.filter.operator || "eq"} ${options.filter.value}`
      );
    }
  }

  // 4. Safe script execution
  if (options.script && typeof options.script === "string" && options.script.trim()) {
    currentData = executeScriptTransformation(options.script, currentData, context);
    appliedTransformations.push(`script:${options.script.slice(0, 30)}...`);
  }

  return {
    success: true,
    data: currentData,
    transformedAt: new Date().toISOString(),
    appliedTransformations,
  };
}
