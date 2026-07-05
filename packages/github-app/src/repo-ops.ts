import { readFileSync } from "node:fs";
import nodePath from "node:path";
import { fileURLToPath } from "node:url";
import { getOctokit } from "./client.js";

// infra/app-templates lives at the repo root, three levels up from this
// package's src/ dir (packages/github-app/src -> packages/github-app ->
// packages -> repo root).
const APP_TEMPLATES_DIR = nodePath.resolve(
  nodePath.dirname(fileURLToPath(import.meta.url)),
  "../../../infra/app-templates",
);

// Relative source path (under infra/app-templates) -> destination path in
// the app repo. Currently identical, kept separate in case the two diverge.
const APP_TEMPLATE_FILES = [
  "Dockerfile",
  ".github/workflows/deploy.yml",
  "helm/values.yaml",
] as const;

function renderAppTemplate(
  content: string,
  vars: { appId: string; subdomain: string; org: string },
): string {
  return content
    .replaceAll("{{APP_ID}}", vars.appId)
    .replaceAll("{{SUBDOMAIN}}", vars.subdomain)
    .replaceAll("{{ORG}}", vars.org);
}

export interface CreatedRepo {
  name: string;
  fullName: string;
  htmlUrl: string;
  defaultBranch: string;
}

export interface PullRequestRef {
  number: number;
  htmlUrl: string;
}

export interface DeploymentRef {
  id: number;
}

export type DeploymentState =
  | "error"
  | "failure"
  | "inactive"
  | "in_progress"
  | "queued"
  | "pending"
  | "success";

function parseRepo(repo: string): { owner: string; repo: string } {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo identifier "${repo}" — expected "owner/repo"`);
  }
  return { owner, repo: repoName };
}

export async function createRepo(name: string, org: string): Promise<CreatedRepo> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.createInOrg({
    org,
    name,
    private: true,
    auto_init: true,
    description: `Provisioned by VibeYeeter3000 for ${name}`,
  });

  return {
    name: data.name,
    fullName: data.full_name,
    htmlUrl: data.html_url,
    defaultBranch: data.default_branch ?? "main",
  };
}

export async function pushFile(
  repo: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo: repoName } = parseRepo(repo);

  let existingSha: string | undefined;
  try {
    const existing = await octokit.rest.repos.getContent({ owner, repo: repoName, path });
    if (!Array.isArray(existing.data) && existing.data.type === "file") {
      existingSha = existing.data.sha;
    }
  } catch (error) {
    if (!(error instanceof Object) || (error as { status?: number }).status !== 404) {
      throw error;
    }
  }

  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo: repoName,
    path,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    sha: existingSha,
  });
}

export async function openPR(
  repo: string,
  title: string,
  body: string,
  head: string,
  base: string,
): Promise<PullRequestRef> {
  const octokit = getOctokit();
  const { owner, repo: repoName } = parseRepo(repo);

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo: repoName,
    title,
    body,
    head,
    base,
  });

  return { number: data.number, htmlUrl: data.html_url };
}

export async function createDeployment(
  repo: string,
  ref: string,
  environment: string,
): Promise<DeploymentRef> {
  const octokit = getOctokit();
  const { owner, repo: repoName } = parseRepo(repo);

  const { data } = await octokit.rest.repos.createDeployment({
    owner,
    repo: repoName,
    ref,
    environment,
    auto_merge: false,
    required_contexts: [],
  });

  // The GitHub API can (rarely) return 202 with no body when a deployment is
  // still being created; there's nothing useful to reconcile against in that
  // case, so surface it as an error rather than fabricating an id.
  if (!("id" in data)) {
    throw new Error("GitHub did not return a deployment id");
  }

  return { id: data.id };
}

export async function updateDeploymentStatus(
  repo: string,
  deploymentId: number,
  state: DeploymentState,
  logUrl?: string,
): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo: repoName } = parseRepo(repo);

  await octokit.rest.repos.createDeploymentStatus({
    owner,
    repo: repoName,
    deployment_id: deploymentId,
    state,
    log_url: logUrl,
  });
}

// Pushes the Dockerfile, deploy workflow, and Helm values override from
// infra/app-templates into a newly registered app's repo, with
// {{APP_ID}} / {{SUBDOMAIN}} / {{ORG}} placeholders filled in. Called
// once at app registration time (see POST /apps in apps/api).
export async function pushAppTemplates(
  repo: string,
  org: string,
  appId: string,
  subdomain: string,
): Promise<void> {
  for (const relativePath of APP_TEMPLATE_FILES) {
    const raw = readFileSync(nodePath.join(APP_TEMPLATES_DIR, relativePath), "utf-8");
    const rendered = renderAppTemplate(raw, { appId, subdomain, org });
    await pushFile(repo, relativePath, rendered, `chore: add ${relativePath}`);
  }
}
