"use client";

import { useEffect, useState } from "react";
import type { ApiToken, ApiTokenStatus } from "@vibeyeeter/types";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import { createApiToken, listApiTokens, revokeApiToken } from "@/lib/api";
import { timeAgo } from "@/lib/format";

const STATUS_STYLES: Record<ApiTokenStatus, string> = {
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  expired: "bg-slate-100 text-slate-600 ring-slate-500/20",
  revoked: "bg-red-50 text-red-700 ring-red-600/20",
};

function TokenStatusBadge({ status }: { status: ApiTokenStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {status[0]?.toUpperCase()}
      {status.slice(1)}
    </span>
  );
}

export function TokensManager() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [expiresInput, setExpiresInput] = useState("");
  const [creating, setCreating] = useState(false);

  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  async function refresh() {
    try {
      const { tokens: rows } = await listApiTokens();
      setTokens(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load tokens");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openNewModal() {
    setNameInput("");
    setExpiresInput("");
    setShowNewModal(true);
  }

  async function handleCreate() {
    if (!nameInput.trim()) {
      return;
    }
    setCreating(true);
    try {
      const { token } = await createApiToken({
        name: nameInput.trim(),
        ...(expiresInput ? { expiresAt: new Date(expiresInput).toISOString() } : {}),
      });
      setShowNewModal(false);
      setRevealedToken(token.token);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!revealedToken) {
      return;
    }
    await navigator.clipboard.writeText(revealedToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke() {
    if (!pendingRevokeId) {
      return;
    }
    setRevoking(true);
    try {
      await revokeApiToken(pendingRevokeId);
      setPendingRevokeId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to revoke token");
    } finally {
      setRevoking(false);
    }
  }

  if (tokens === null) {
    return <p className="text-sm text-slate-500">Loading tokens…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="primary" onClick={openNewModal}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          New Token
        </Button>
      </div>

      {tokens.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
              <path
                fillRule="evenodd"
                d="M15.75 1a4.5 4.5 0 0 0-4.5 4.5c0 .463.084.906.238 1.316L2.245 15.06a1.5 1.5 0 0 0-.44 1.061v1.379a1.5 1.5 0 0 0 1.5 1.5h1.379a1.5 1.5 0 0 0 1.06-.44l.354-.354a.75.75 0 0 0 .22-.53v-.75h.75a.75.75 0 0 0 .75-.75v-.75h.75a.75.75 0 0 0 .53-.22l.628-.628a4.5 4.5 0 1 0 6.024-6.024l-.001-.001A4.5 4.5 0 0 0 15.75 1Zm-1.5 5a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z"
                clipRule="evenodd"
              />
            </svg>
          }
          title="No API tokens yet"
          description="Generate a token to authenticate CI pipelines and other machine callers against the platform API."
          action={
            <Button variant="primary" onClick={openNewModal}>
              New Token
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Name
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Prefix
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Created
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Last used
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Expires
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Status
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tokens.map((token) => (
                <tr key={token.id} className="hover:bg-slate-50/75">
                  <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-800">
                    {token.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-500">
                    {token.tokenPrefix}…
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                    {timeAgo(token.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                    {token.lastUsedAt ? timeAgo(token.lastUsedAt) : "Never"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                    {token.expiresAt ? timeAgo(token.expiresAt) : "Never"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <TokenStatusBadge status={token.status} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        className="px-2.5 py-1 text-xs"
                        disabled={token.status === "revoked"}
                        onClick={() => setPendingRevokeId(token.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">New API Token</h3>
            <div className="mt-3 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="CI deploy pipeline"
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Expires (optional)
                </label>
                <input
                  type="date"
                  value={expiresInput}
                  onChange={(e) => setExpiresInput(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowNewModal(false)} disabled={creating}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate} disabled={creating || !nameInput.trim()}>
                {creating ? "Generating…" : "Generate"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {revealedToken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-sm font-semibold text-slate-900">Token created</h3>
            <p className="mt-1 text-sm text-slate-500">
              Copy this token now — it won&apos;t be shown again.
            </p>
            <div className="mt-3 flex items-center gap-2 rounded-md border border-slate-300 bg-slate-50 px-3 py-2">
              <code className="flex-1 truncate font-mono text-sm text-slate-800">
                {revealedToken}
              </code>
              <button
                type="button"
                onClick={handleCopy}
                className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <Button variant="primary" onClick={() => setRevealedToken(null)}>
                Done
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={pendingRevokeId !== null}
        title="Revoke token"
        description="This token will stop working immediately. This cannot be undone."
        confirmLabel="Revoke"
        danger
        loading={revoking}
        onConfirm={handleRevoke}
        onCancel={() => setPendingRevokeId(null)}
      />
    </div>
  );
}
