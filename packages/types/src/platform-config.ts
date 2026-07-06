export type PlatformConfigKey =
  | "CF_ACCESS_TEAM_DOMAIN"
  | "CF_ACCESS_AUD"
  | "CF_API_TOKEN"
  | "CF_ZONE_ID"
  | "PLATFORM_DOMAIN";

// Secret values (isSecret) never carry the plaintext here — value is either
// null (unset) or a "••••••••" placeholder once set.
export interface PlatformConfigItem {
  key: PlatformConfigKey;
  value: string | null;
  isSecret: boolean;
  updatedAt: string | null;
}
