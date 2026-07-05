import { config } from "../config.js";

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CfDnsRecordResponse {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: { id: string } | null;
}

function requireCredentials(): { apiToken: string; zoneId: string } {
  const { apiToken, zoneId } = config.cloudflare;
  if (!apiToken || !zoneId) {
    throw new Error("Cloudflare API is not configured (CF_API_TOKEN / CF_ZONE_ID)");
  }
  return { apiToken, zoneId };
}

export async function createDnsRecord(hostname: string, target: string): Promise<{ id: string }> {
  const { apiToken, zoneId } = requireCredentials();

  const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "CNAME",
      name: hostname,
      content: target,
      proxied: true,
    }),
  });

  const body = (await response.json()) as CfDnsRecordResponse;
  if (!response.ok || !body.success || !body.result) {
    const detail = body.errors?.map((e) => e.message).join(", ") || response.statusText;
    throw new Error(`Cloudflare DNS record creation failed: ${detail}`);
  }

  return { id: body.result.id };
}

export async function deleteDnsRecord(recordId: string): Promise<void> {
  const { apiToken, zoneId } = requireCredentials();

  const response = await fetch(`${CF_API_BASE}/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${apiToken}`,
    },
  });

  const body = (await response.json()) as CfDnsRecordResponse;
  if (!response.ok || !body.success) {
    const detail = body.errors?.map((e) => e.message).join(", ") || response.statusText;
    throw new Error(`Cloudflare DNS record deletion failed: ${detail}`);
  }
}
