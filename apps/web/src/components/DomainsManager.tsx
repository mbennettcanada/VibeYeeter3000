"use client";

import { useEffect, useState } from "react";
import type { AppDomain, AppDomainWithApp, DnsStatus, CertStatus } from "@vibeyeeter/types";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { createAppDomain, deleteAppDomain, listAllDomains, listAppDomains } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const STATUS_STYLES: Record<DnsStatus | CertStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-slate-100 text-slate-600 ring-slate-500/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
};

function MiniStatus({ status }: { status: DnsStatus | CertStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// appId: when set, shows only that app's domains and an "add domain" form.
// Omitted for the global settings/domains view across all apps.
export function DomainsManager({ appId }: { appId?: string }) {
  const [domains, setDomains] = useState<(AppDomain | AppDomainWithApp)[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hostnameInput, setHostnameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    try {
      const { domains: rows } = appId ? await listAppDomains(appId) : await listAllDomains();
      setDomains(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load domains");
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appId]);

  async function handleAdd() {
    if (!appId || !hostnameInput.trim()) {
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createAppDomain(appId, { hostname: hostnameInput.trim() });
      setHostnameInput("");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "failed to add domain");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!pendingDeleteId) {
      return;
    }
    const domain = domains?.find((d) => d.id === pendingDeleteId);
    if (!domain) {
      return;
    }
    setDeleting(true);
    try {
      await deleteAppDomain(domain.appId, domain.id);
      setPendingDeleteId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete domain");
    } finally {
      setDeleting(false);
    }
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (domains === null) {
    return <p className="text-sm text-slate-400">Loading domains…</p>;
  }

  return (
    <div className="space-y-4">
      {appId && (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Hostname</label>
            <input
              type="text"
              value={hostnameInput}
              onChange={(e) => setHostnameInput(e.target.value)}
              placeholder="myapp.example.com"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <Button variant="primary" onClick={handleAdd} disabled={saving || !hostnameInput.trim()}>
            Add domain
          </Button>
        </div>
      )}
      {formError && <p className="text-sm text-red-600">{formError}</p>}

      {domains.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-6 w-6">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c1.657 0 3-4.03 3-9s-1.343-9-3-9-3 4.03-3 9 1.343 9 3 9Zm-9-9h18"
              />
            </svg>
          }
          title="No domains yet"
          description={
            appId
              ? "Add a hostname above to route traffic to this app."
              : "Domains will appear here once apps are registered with hostnames."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Hostname
                </th>
                {!appId && (
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    App
                  </th>
                )}
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Type
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  DNS
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Certificate
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Created
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {domains.map((domain) => (
                <tr key={domain.id} className="hover:bg-slate-50/75">
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-800">
                    {domain.hostname}
                  </td>
                  {!appId && (
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {"appName" in domain ? domain.appName : "—"}
                    </td>
                  )}
                  <td className="whitespace-nowrap px-4 py-3 text-sm capitalize text-slate-600">
                    {domain.domainType}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <MiniStatus status={domain.dnsStatus} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <MiniStatus status={domain.certStatus} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                    {timeAgo(domain.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(domain.id)}
                      aria-label={`Delete ${domain.hostname}`}
                      className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path
                          fillRule="evenodd"
                          d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete domain"
        description="This removes the DNS record and stops routing traffic to this hostname. This cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
