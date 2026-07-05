export type DeploymentStatus = "pending" | "running" | "succeeded" | "failed" | "rolled_back";
export type DeploymentType = "deploy" | "rollback" | "restart";

export interface Deployment {
  id: string;
  appId: string;
  imageTag: string;
  status: DeploymentStatus;
  type: DeploymentType;
  triggeredBy: string;
  createdAt: string;
  duration: number | null;
}
