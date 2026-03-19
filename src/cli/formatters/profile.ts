import type { NLobbyAccountInfo } from "../../types.js";

export function formatProfile(info: NLobbyAccountInfo): string {
  const lines: string[] = [];

  lines.push("── Account Information ──");
  lines.push(`Name:    ${info.name ?? "(unknown)"}`);
  lines.push(`Email:   ${info.email ?? "(unknown)"}`);
  lines.push(`Role:    ${info.role ?? "(unknown)"}`);

  if (info.studentNo) lines.push(`Student No: ${info.studentNo}`);
  if (info.userId) lines.push(`User ID: ${info.userId}`);
  if (info.grade != null) lines.push(`Grade:   ${info.grade}`);
  if (info.term != null) lines.push(`Term:    ${info.term}`);
  if (info.isLobbyAdmin) lines.push("Admin:   Yes");
  if (typeof info.kmsLoginSuccess === "boolean") {
    lines.push(`KMS Login: ${info.kmsLoginSuccess ? "OK" : "Failed"}`);
  }

  if (
    Array.isArray(info.studentOrganizations) &&
    info.studentOrganizations.length > 0
  ) {
    lines.push(`Organizations: ${info.studentOrganizations.length}`);
  }

  if (
    Array.isArray(info.staffDepartments) &&
    info.staffDepartments.length > 0
  ) {
    lines.push(`Departments: ${info.staffDepartments.length}`);
  }

  return lines.join("\n");
}
