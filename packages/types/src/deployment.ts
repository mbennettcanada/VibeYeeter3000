export type DeploymentStatus = "pending" | "running" | "succeeded" | "failed" | "rolled_back";

export interface Deployment {
  id: string;
  appId: string;
  imageTag: string;
  status: DeploymentStatus;
  triggeredBy: string;
  createdAt: string;
  duration: number | null;
}
