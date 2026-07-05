export type TerraformRunType = "plan" | "apply" | "destroy";
export type TerraformRunStatus = "pending" | "running" | "succeeded" | "failed";

export interface TerraformRun {
  id: string;
  appId: string;
  type: TerraformRunType;
  status: TerraformRunStatus;
  planDiff: string | null;
  createdAt: string;
}
