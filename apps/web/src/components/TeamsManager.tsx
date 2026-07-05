"use client";

import { Fragment, useEffect, useState } from "react";
import type { TeamWithDetail } from "@vibeyeeter/types";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState } from "@/components/EmptyState";
import {
  addTeamGroup,
  createTeam,
  deleteTeam,
  listTeamsDetail,
  removeTeamGroup,
  renameTeam,
} from "@/lib/api";
import { slugify } from "@/lib/format";

export function TeamsManager() {
  const [teams, setTeams] = useState<TeamWithDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [slugInput, setSlugInput] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [groupInput, setGroupInput] = useState("");

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    try {
      const { teams: rows } = await listTeamsDetail();
      setTeams(rows);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load teams");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function openNewForm() {
    setNameInput("");
    setSlugInput("");
    setSlugTouched(false);
    setShowNewForm(true);
  }

  function closeNewForm() {
    setShowNewForm(false);
  }

  async function handleCreate() {
    if (!nameInput.trim() || !slugInput.trim()) {
      return;
    }
    setSaving(true);
    try {
      await createTeam({ name: nameInput.trim(), slug: slugInput.trim() });
      closeNewForm();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create team");
    } finally {
      setSaving(false);
    }
  }

  function openRename(team: TeamWithDetail) {
    setRenamingId(team.id);
    setRenameInput(team.name);
  }

  async function handleRename(id: string) {
    if (!renameInput.trim()) {
      return;
    }
    setSaving(true);
    try {
      await renameTeam(id, { name: renameInput.trim() });
      setRenamingId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to rename team");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddGroup(id: string) {
    if (!groupInput.trim()) {
      return;
    }
    setSaving(true);
    try {
      await addTeamGroup(id, { groupName: groupInput.trim() });
      setGroupInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to add group mapping");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveGroup(id: string, groupName: string) {
    try {
      await removeTeamGroup(id, groupName);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to remove group mapping");
    }
  }

  async function handleDelete() {
    if (!pendingDeleteId) {
      return;
    }
    setDeleting(true);
    try {
      await deleteTeam(pendingDeleteId);
      setPendingDeleteId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to archive team");
    } finally {
      setDeleting(false);
    }
  }

  if (teams === null) {
    return <p className="text-sm text-slate-500">Loading teams…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        {!showNewForm && (
          <Button variant="primary" onClick={openNewForm}>
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
            </svg>
            New Team
          </Button>
        )}
      </div>

      {showNewForm && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-4">
          <h3 className="text-sm font-semibold text-slate-900">New Team</h3>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <input
                type="text"
                value={nameInput}
                onChange={(e) => {
                  const value = e.target.value;
                  setNameInput(value);
                  if (!slugTouched) {
                    setSlugInput(slugify(value));
                  }
                }}
                placeholder="Data Platform"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Slug</label>
              <input
                type="text"
                value={slugInput}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlugInput(e.target.value);
                }}
                placeholder="data-platform"
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={closeNewForm} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={saving || !nameInput.trim() || !slugInput.trim()}
            >
              {saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState
          icon={
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-6 w-6">
              <path d="M10 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm8 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM2 17.25c0-2.9 3.6-4.25 6-4.25.62 0 1.3.09 1.97.27A5 5 0 0 0 9.5 15.5v1.75a.75.75 0 0 1-.75.75H2.75a.75.75 0 0 1-.75-.75Z" />
            </svg>
          }
          title="No teams yet"
          description="Create a team to start registering apps and mapping SAML groups."
          action={
            <Button variant="primary" onClick={openNewForm}>
              New Team
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
                  Slug
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Members
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  SAML Groups
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {teams.map((team) => (
                <Fragment key={team.id}>
                  <tr className="hover:bg-slate-50/75">
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-800">
                      {renamingId === team.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() => handleRename(team.id)}
                            disabled={saving}
                            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingId(null)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openRename(team)}
                          className="font-medium text-slate-800 hover:text-indigo-600"
                        >
                          {team.name}
                        </button>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-sm text-slate-500">
                      {team.slug}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                      {team.memberCount}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {team.groups.length === 0 && (
                          <span className="text-slate-400">No group mappings</span>
                        )}
                        {team.groups.map((group) => (
                          <span
                            key={group}
                            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
                          >
                            {group}
                            <button
                              type="button"
                              aria-label={`Remove ${group}`}
                              onClick={() => handleRemoveGroup(team.id, group)}
                              className="text-slate-400 hover:text-red-600"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            setExpandedId(expandedId === team.id ? null : team.id);
                            setGroupInput("");
                          }}
                          className="rounded-full px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                        >
                          {expandedId === team.id ? "Close" : "+ Map group"}
                        </button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="secondary"
                          className="px-2.5 py-1 text-xs"
                          onClick={() => setPendingDeleteId(team.id)}
                        >
                          Archive
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {expandedId === team.id && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={groupInput}
                            onChange={(e) => setGroupInput(e.target.value)}
                            placeholder="jumpcloud-group-name"
                            className="w-64 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                          <Button
                            variant="primary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => handleAddGroup(team.id)}
                            disabled={saving || !groupInput.trim()}
                          >
                            Add mapping
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Archive team"
        description="This team will be permanently removed. Teams with active apps cannot be archived."
        confirmLabel="Archive"
        danger
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
