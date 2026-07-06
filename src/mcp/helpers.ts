import type { ToolHandlerResult } from "./types.js";

export function textResult(text: string): ToolHandlerResult {
  return { content: [{ type: "text", text }] };
}

export function jsonResult(data: unknown): ToolHandlerResult {
  return textResult(JSON.stringify(data, null, 2));
}

export function errorResult(message: string): ToolHandlerResult {
  return textResult(`Error: ${message}`);
}

export function catchError(
  error: unknown,
  prefix = "Error",
): ToolHandlerResult {
  const message = error instanceof Error ? error.message : "Unknown error";
  return textResult(`${prefix}: ${message}`);
}
