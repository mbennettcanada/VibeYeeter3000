export interface TerraformCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runTerraformCommand(
  _repoUrl: string,
  _workingDir: string,
  _args: string[],
): Promise<TerraformCommandResult> {
  // TODO: clone repo, run `terraform` CLI with args, stream output
  return { exitCode: 0, stdout: "", stderr: "" };
}
