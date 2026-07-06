import type { MCPModule, MCPResource, MCPTool } from "./types.js";

export function collectTools(modules: MCPModule[]): MCPTool[] {
  return modules.flatMap((module) => module.tools ?? []);
}

export function collectResources(modules: MCPModule[]): MCPResource[] {
  return modules.flatMap((module) => module.resources ?? []);
}

export function indexToolsByName(
  tools: MCPTool[],
): Map<string, MCPTool["handler"]> {
  return new Map(tools.map((tool) => [tool.definition.name, tool.handler]));
}

export function indexResourcesByUri(
  resources: MCPResource[],
): Map<string, MCPResource["handler"]> {
  return new Map(resources.map((resource) => [resource.uri, resource.handler]));
}
