export type MigrationStatus = "pending" | "running" | "succeeded" | "failed";

export interface Migration {
  id: string;
  name: string;
  appliedAt: string | null;
  status: MigrationStatus;
}
