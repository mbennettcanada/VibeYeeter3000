import type { TerraformRunType } from "@vibeyeeter/types";

const TF_RUNNER_URL = process.env.TF_RUNNER_URL ?? "http://tf-runner:4000";

export async function triggerTerraformRun(
  _appId: string,
  _type: TerraformRunType,
): Promise<{ id: string }> {
  // TODO: POST to tf-runner /plan, /apply, or /destroy and track the run
  void TF_RUNNER_URL;
  return { id: "" };
}
