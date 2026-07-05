export function parseGithubRepoUrl(repoUrl: string): { owner: string; repo: string } {
  const url = new URL(repoUrl);
  const [owner, repo] = url.pathname.replace(/^\//, "").replace(/\.git$/, "").split("/");
  if (!owner || !repo) {
    throw new Error(`Cannot parse owner/repo from "${repoUrl}"`);
  }
  return { owner, repo };
}
