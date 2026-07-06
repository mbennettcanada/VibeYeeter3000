"use client";

import { useEffect, useState } from "react";
import type { PlatformConfigItem, PlatformConfigKey } from "@vibeyeeter/types";
import { Button } from "@/components/Button";
import { listPlatformConfig, updatePlatformConfig } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const FIELD_META: Record<PlatformConfigKey, { label: string; description: string }> = {
  CF_ACCESS_TEAM_DOMAIN: {
    label: "Cloudflare Access team domain",
    description: "Your Cloudflare Zero Trust team domain, e.g. yourteam.cloudflareaccess.com",
  },
  CF_ACCESS_AUD: {
    label: "Cloudflare Access AUD tag",
    description: "The Application Audience (AUD) tag for the Access application protecting the platform.",
  },
  CF_API_TOKEN: {
    label: "Cloudflare API token",
    description: "Used to create/delete DNS records for app hostnames. Write-only — never shown once set.",
  },
  CF_ZONE_ID: {
    label: "Cloudflare zone ID",
    description: "The Cloudflare zone that app subdomains are created in.",
  },
  PLATFORM_DOMAIN: {
    label: "Platform domain",
    description: "Base domain for auto-assigned app subdomains, e.g. internal.yourco.com",
  },
};

function ConfigRow({
  item,
  onSaved,
}: {
  item: PlatformConfigItem;
  onSaved: (item: PlatformConfigItem) => void;
}) {
  const meta = FIELD_META[item.key];
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    if (!value.trim()) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { config: updated } = await updatePlatformConfig(item.key, { value: value.trim() });
      onSaved(updated);
      setValue("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-b border-slate-100 px-4 py-4 last:border-b-0">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="md:w-72 md:shrink-0">
          <p className="text-sm font-medium text-slate-800">{meta.label}</p>
          <p className="mt-0.5 font-mono text-xs text-slate-400">{item.key}</p>
          <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <input
              type={item.isSecret ? "password" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={item.value ?? "Not set"}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={handleSave}
              disabled={saving || !value.trim()}
            >
              {saving ? "Saving…" : saved ? "Saved" : "Save"}
            </Button>
          </div>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
          <p className="mt-1 text-xs text-slate-400">
            {item.updatedAt ? `Last updated ${timeAgo(item.updatedAt)}` : "Never updated"}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PlatformConfigManager() {
  const [items, setItems] = useState<PlatformConfigItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const { config: rows } = await listPlatformConfig();
      setItems(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load config");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function handleSaved(updated: PlatformConfigItem) {
    setItems((prev) => prev?.map((item) => (item.key === updated.key ? updated : item)) ?? prev);
  }

  if (items === null) {
    return <p className="text-sm text-slate-500">Loading config…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white">
        {items.map((item) => (
          <ConfigRow key={item.key} item={item} onSaved={handleSaved} />
        ))}
      </div>
    </div>
  );
}
