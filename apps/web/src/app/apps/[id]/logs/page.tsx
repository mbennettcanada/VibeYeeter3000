"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Pod } from "@vibeyeeter/types";
import { PageHeader } from "@/components/PageHeader";
import { AppNav } from "@/components/AppNav";
import { Button } from "@/components/Button";
import { TerminalOutput } from "@/components/TerminalOutput";
import { getMockApp, getMockPodLogs, getMockPods } from "@/lib/mock-data";
import { getPodLogs, listPods } from "@/lib/api";

export default function LogsPage({ params }: { params: { id: string } }) {
  const app = getMockApp(params.id);
  if (!app) {
    notFound();
  }
  const appId = app.id;

  const [pods, setPods] = useState<Pod[]>([]);
  const [selectedPod, setSelectedPod] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadPods() {
    let list: Pod[] = [];
    try {
      const res = await listPods(appId);
      list = res.pods;
    } catch {
      list = [];
    }
    if (list.length === 0) {
      list = getMockPods(appId);
    }
    setPods(list);
    setSelectedPod((current) => current || list[0]?.name || "");
  }

  async function loadLogs(podName: string) {
    if (!podName) {
      return;
    }
    setLoading(true);
    try {
      const res = await getPodLogs(appId, podName, 100);
      setLogs(res.logs ? res.logs.split("\n") : getMockPodLogs(podName).split("\n"));
    } catch {
      setLogs(getMockPodLogs(podName).split("\n"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPods();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  useEffect(() => {
    if (selectedPod) {
      loadLogs(selectedPod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPod]);

  useEffect(() => {
    if (autoRefresh && selectedPod) {
      intervalRef.current = setInterval(() => loadLogs(selectedPod), 10000);
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedPod]);

  return (
    <>
      <PageHeader
        title="Logs"
        breadcrumb={
          <>
            <Link href="/" className="hover:text-slate-700">
              Dashboard
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <Link href={`/apps/${app.id}`} className="hover:text-slate-700">
              {app.name}
            </Link>
            <span className="mx-1.5 text-slate-300">/</span>
            <span className="text-slate-700">Logs</span>
          </>
        }
      />
      <AppNav appId={app.id} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-slate-600">Pod</label>
          <select
            value={selectedPod}
            onChange={(e) => setSelectedPod(e.target.value)}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {pods.map((pod) => (
              <option key={pod.name} value={pod.name}>
                {pod.name} · {pod.status}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Auto-refresh (10s)
          </label>
          <Button
            variant="secondary"
            onClick={() => loadLogs(selectedPod)}
            disabled={!selectedPod || loading}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <TerminalOutput lines={logs} />
    </>
  );
}
