"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/Button";
import { mockTeams } from "@/lib/mock-data";
import { createApp } from "@/lib/api";
import { slugify } from "@/lib/format";

const GITHUB_ORG = process.env.NEXT_PUBLIC_GITHUB_ORG ?? "your-org";

const PROGRESS_STEPS = [
  { key: "db", label: "Creating DB record" },
  { key: "github", label: "Provisioning GitHub repo" },
  { key: "k8s", label: "Setting up Kubernetes namespace" },
  { key: "done", label: "Done" },
] as const;

type StepKey = (typeof PROGRESS_STEPS)[number]["key"];

export default function NewAppPage() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState(mockTeams[0]?.id ?? "");
  const [subdomain, setSubdomain] = useState("");
  const [subdomainTouched, setSubdomainTouched] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");

  const [completedSteps, setCompletedSteps] = useState<StepKey[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const selectedTeam = mockTeams.find((team) => team.id === teamId);
  const suggestedRepoUrl = `https://github.com/${GITHUB_ORG}/${slugify(name) || "your-app"}`;

  function handleNameChange(value: string) {
    setName(value);
    if (!subdomainTouched) {
      setSubdomain(value.trim() ? `${slugify(value)}.apps.internal.co` : "");
    }
  }

  function canProceedToReview() {
    return name.trim().length > 0 && teamId.length > 0 && subdomain.trim().length > 0;
  }

  async function handleRegister() {
    setStep(3);
    setError(null);
    setCompletedSteps([]);
    setCurrentStepIndex(0);
    setWarnings([]);

    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setCompletedSteps((c) => [...c, "db"]), 400));
    timers.push(setTimeout(() => setCurrentStepIndex(1), 450));
    timers.push(setTimeout(() => setCompletedSteps((c) => [...c, "github"]), 1400));
    timers.push(setTimeout(() => setCurrentStepIndex(2), 1450));
    timers.push(setTimeout(() => setCompletedSteps((c) => [...c, "k8s"]), 2400));

    try {
      const res = await createApp({
        name: name.trim(),
        teamId,
        subdomain: subdomain.trim(),
        repoUrl: repoUrl.trim() || suggestedRepoUrl,
      });

      timers.forEach(clearTimeout);
      setCompletedSteps(["db", "github", "k8s", "done"]);
      setCurrentStepIndex(3);
      setWarnings(res.warnings ?? []);

      setTimeout(
        () => router.push(`/apps/${res.app.id}`),
        res.warnings && res.warnings.length > 0 ? 1800 : 900,
      );
    } catch (err) {
      timers.forEach(clearTimeout);
      setError(err instanceof Error ? err.message : "Failed to register application");
      setStep(2);
    }
  }

  return (
    <>
      <PageHeader
        title="Register application"
        breadcrumb={
          <Link href="/" className="hover:text-slate-700">
            Dashboard
          </Link>
        }
      />

      {step !== 3 && (
        <div className="mb-6 flex items-center gap-2 text-xs font-medium text-slate-500">
          <StepDot active={step === 1} done={step > 1} label="1" />
          <span>App details</span>
          <span className="h-px w-8 bg-slate-200" />
          <StepDot active={step === 2} done={step > 2} label="2" />
          <span>Review</span>
        </div>
      )}

      {step === 1 && (
        <div className="max-w-xl space-y-5 rounded-lg border border-slate-200 bg-white p-6">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">App name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="expense-tracker"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Team</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {mockTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Subdomain</label>
            <input
              type="text"
              value={subdomain}
              onChange={(e) => {
                setSubdomainTouched(true);
                setSubdomain(e.target.value);
              }}
              placeholder="your-app.apps.internal.co"
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-400">Auto-suggested from the app name — feel free to edit it.</p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              GitHub repo URL <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder={suggestedRepoUrl}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-400">
              Leave blank and the platform will create <span className="font-mono">{suggestedRepoUrl}</span> for you.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => setStep(2)} disabled={!canProceedToReview()}>
              Continue to review
            </Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="max-w-xl space-y-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="rounded-lg border border-slate-200 bg-white p-6">
            <h2 className="mb-4 text-sm font-semibold text-slate-900">Review</h2>
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <dt className="text-slate-400">App name</dt>
              <dd className="col-span-2 text-slate-800">{name}</dd>
              <dt className="text-slate-400">Team</dt>
              <dd className="col-span-2 text-slate-800">{selectedTeam?.name}</dd>
              <dt className="text-slate-400">Subdomain</dt>
              <dd className="col-span-2 font-mono text-xs text-slate-800">{subdomain}</dd>
              <dt className="text-slate-400">GitHub repo</dt>
              <dd className="col-span-2 font-mono text-xs text-slate-800">
                {repoUrl.trim() || suggestedRepoUrl}
                {!repoUrl.trim() && <span className="ml-1.5 text-slate-400">(to be created)</span>}
              </dd>
            </dl>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button variant="primary" onClick={handleRegister}>
              Register App
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-xl rounded-lg border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Registering {name}</h2>
          <ul className="space-y-3">
            {PROGRESS_STEPS.map((s, i) => {
              const isDone = completedSteps.includes(s.key);
              const isActive = !isDone && i === currentStepIndex;
              return (
                <li key={s.key} className="flex items-center gap-3 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isDone
                        ? "bg-emerald-500 text-white"
                        : isActive
                          ? "bg-indigo-100 text-indigo-600"
                          : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {isDone ? "✓" : i + 1}
                  </span>
                  <span
                    className={
                      isDone
                        ? "text-slate-700"
                        : isActive
                          ? "font-medium text-slate-900"
                          : "text-slate-400"
                    }
                  >
                    {s.label}
                    {isDone ? " ✓" : isActive ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ul>

          {warnings.length > 0 && (
            <div className="mt-5 space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          )}

          {completedSteps.includes("done") && (
            <p className="mt-5 text-sm text-slate-500">Redirecting to your app…</p>
          )}
        </div>
      )}
    </>
  );
}

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${
        done
          ? "bg-emerald-500 text-white"
          : active
            ? "bg-indigo-600 text-white"
            : "bg-slate-100 text-slate-400"
      }`}
    >
      {done ? "✓" : label}
    </span>
  );
}
