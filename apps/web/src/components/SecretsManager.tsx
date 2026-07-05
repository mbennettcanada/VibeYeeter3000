"use client";

import { useState } from "react";
import type { Secret } from "@vibeyeeter/types";
import { Button } from "@/components/Button";
import { timeAgo } from "@/lib/format";

type FormMode = { mode: "add" } | { mode: "rotate"; key: string } | null;

export function SecretsManager({ initialSecrets }: { initialSecrets: Secret[] }) {
  const [secrets, setSecrets] = useState(initialSecrets);
  const [form, setForm] = useState<FormMode>(null);
  const [keyInput, setKeyInput] = useState("");
  const [valueInput, setValueInput] = useState("");

  function openAdd() {
    setKeyInput("");
    setValueInput("");
    setForm({ mode: "add" });
  }

  function openRotate(key: string) {
    setKeyInput(key);
    setValueInput("");
    setForm({ mode: "rotate", key });
  }

  function closeForm() {
    setForm(null);
    setKeyInput("");
    setValueInput("");
  }

  function handleSave() {
    if (!keyInput.trim()) {
      return;
    }
    const now = new Date().toISOString();
    setSecrets((prev) => {
      const existing = prev.find((s) => s.key === keyInput);
      if (existing) {
        return prev.map((s) => (s.key === keyInput ? { ...s, updatedAt: now } : s));
      }
      return [...prev, { key: keyInput, createdAt: now, updatedAt: now }];
    });
    closeForm();
  }

  function handleDelete(key: string) {
    setSecrets((prev) => prev.filter((s) => s.key !== key));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <svg
          viewBox="0 0 20 20"
          fill="currentColor"
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.169 2.63-1.516 2.63H3.72c-1.347 0-2.189-1.463-1.515-2.63L8.485 2.495ZM10 5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 10 5Zm0 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
            clipRule="evenodd"
          />
        </svg>
        <p className="text-sm text-amber-800">
          Secrets are injected at deploy time. Add a secret then redeploy for changes to take
          effect.
        </p>
      </div>

      <div className="flex justify-end">
        <Button variant="primary" onClick={openAdd}>
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Add secret
        </Button>
      </div>

      {form && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
          <h3 className="text-sm font-semibold text-slate-900">
            {form.mode === "add" ? "Add secret" : `Rotate ${form.key}`}
          </h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Key</label>
              <input
                type="text"
                value={keyInput}
                disabled={form.mode === "rotate"}
                onChange={(e) => setKeyInput(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                placeholder="STRIPE_SECRET_KEY"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Value</label>
              <input
                type="password"
                value={valueInput}
                onChange={(e) => setValueInput(e.target.value)}
                placeholder="••••••••••••"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!keyInput.trim() || !valueInput.trim()}>
              Save
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Key
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Value
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Last updated
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {secrets.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">
                  No secrets configured yet.
                </td>
              </tr>
            )}
            {secrets.map((secret) => (
              <tr key={secret.key} className="hover:bg-slate-50/75">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-800">
                  {secret.key}
                </td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-sm tracking-widest text-slate-400">
                  ••••••••
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-500">
                  {timeAgo(secret.updatedAt)}
                </td>
                <td className="whitespace-nowrap px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="secondary"
                      className="px-2.5 py-1 text-xs"
                      onClick={() => openRotate(secret.key)}
                    >
                      Rotate
                    </Button>
                    <button
                      type="button"
                      onClick={() => handleDelete(secret.key)}
                      aria-label={`Delete ${secret.key}`}
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
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
