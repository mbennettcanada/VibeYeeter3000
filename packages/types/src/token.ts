export type ApiTokenStatus = "active" | "expired" | "revoked";

// Never includes the plaintext token or its hash — see CreateApiTokenResponse
// for the one-time exception at creation time.
export interface ApiToken {
  id: string;
  name: string;
  tokenPrefix: string;
  createdBy: string | null;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  status: ApiTokenStatus;
}
