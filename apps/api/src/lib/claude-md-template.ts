import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/app-template-claude-md.md",
);

const FENCED_BLOCK = /```markdown\n([\s\S]*?)\n```/;

export function renderClaudeMdTemplate(appName: string): string {
  const raw = readFileSync(TEMPLATE_PATH, "utf-8");
  const match = raw.match(FENCED_BLOCK);
  const body = match?.[1] ?? raw;
  return body.replace("[App Name]", appName);
}
