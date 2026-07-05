"use client";

import { useEffect, useState } from "react";

export type ToastMessage = { id: number; type: "error" | "success"; text: string };

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function pushToast(type: ToastMessage["type"], text: string) {
    setToasts((prev) => [...prev, { id: Date.now() + Math.random(), type, text }]);
  }

  function dismissToast(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return { toasts, pushToast, dismissToast };
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => onDismiss(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastMessage; onDismiss: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      className={`flex max-w-sm items-start gap-2 rounded-lg px-4 py-3 text-sm shadow-lg ring-1 ring-inset ${
        toast.type === "error"
          ? "bg-red-600 text-white ring-red-700"
          : "bg-emerald-600 text-white ring-emerald-700"
      }`}
    >
      <span>{toast.text}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-auto text-white/70 hover:text-white"
      >
        ×
      </button>
    </div>
  );
}
