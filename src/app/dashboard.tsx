"use client";

import { useEffect, useState, useCallback } from "react";
import { AgentPanel } from "./agent-panel";
import type { ReceiptListItem, ReceiptDetail } from "./types";

const currency = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-CA", { style: "currency", currency: "CAD" });

export function Dashboard() {
  const [receipts, setReceipts] = useState<ReceiptListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReceiptDetail | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const loadReceipts = useCallback(async () => {
    setLoadingList(true);
    const res = await fetch("/api/receipts");
    const data = await res.json();
    setReceipts(data.receipts);
    setLoadingList(false);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/receipts/${id}`);
    const data = await res.json();
    setDetail(data.receipt);
  }, []);

  useEffect(() => {
    loadReceipts();
  }, [loadReceipts]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  const handleAgentComplete = useCallback(() => {
    if (selectedId) loadDetail(selectedId);
    loadReceipts();
  }, [selectedId, loadDetail, loadReceipts]);

  return (
    <div className="mx-auto flex h-dvh max-w-6xl flex-col">
      <header className="border-b border-zinc-200 px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">Loopnow CPA Copilot</h1>
        <p className="text-sm text-zinc-500">Canadian GST/HST expense processing</p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-zinc-200 px-3 py-4">
          <h2 className="px-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Receipts</h2>
          {loadingList ? (
            <p className="mt-3 px-2 text-sm text-zinc-400">Loading…</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {receipts.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelectedId(r.id)}
                    className={`w-full rounded-md px-2 py-2 text-left transition ${
                      selectedId === r.id ? "bg-zinc-100" : "hover:bg-zinc-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-800">
                        {r.supplierName ?? "Unknown supplier"}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500">{currency(r.totalAmount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {r.hasExpense ? (
                        r.requiresReview ? (
                          <Badge tone="amber">Needs review</Badge>
                        ) : (
                          <Badge tone="emerald">Processed</Badge>
                        )
                      ) : (
                        <Badge tone="zinc">Not processed</Badge>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          {!detail ? (
            <p className="text-sm text-zinc-400">Select a receipt to see its details.</p>
          ) : (
            <div className="max-w-2xl space-y-5">
              <section className="rounded-lg border border-zinc-200 bg-white p-5">
                <h2 className="text-base font-semibold text-zinc-900">{detail.supplierName ?? "Unknown supplier"}</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  <Field label="Date" value={detail.date ? new Date(detail.date).toLocaleDateString("en-CA") : "—"} />
                  <Field label="Total amount" value={currency(detail.totalAmount)} />
                  <Field label="GST/HST number" value={detail.gstHstNumber ?? "Not on file"} />
                  <Field label="Description" value={detail.itemizedDescription ?? "—"} />
                </dl>
                {detail.rawText && (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-600">
                      Raw extracted text
                    </summary>
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-zinc-50 p-3 text-xs text-zinc-600">
                      {detail.rawText}
                    </pre>
                  </details>
                )}
              </section>

              {detail.expense && (
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h3 className="text-sm font-medium text-zinc-900">Expense</h3>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <Field label="Eligible ITC" value={currency(detail.expense.eligibleItc)} />
                    <Field label="ITC reason" value={detail.expense.itcReasonCode} />
                    <Field label="GIFI code" value={detail.expense.gifiCode ? `${detail.expense.gifiCode.code} — ${detail.expense.gifiCode.label}` : "Not classified"} />
                    <Field
                      label="Status"
                      value={detail.expense.requiresReview ? "Needs human review" : "Finalized"}
                    />
                  </dl>
                  {detail.expense.approvals.filter((a) => a.status === "pending").length > 0 && (
                    <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      {detail.expense.approvals.find((a) => a.status === "pending")?.reason}
                    </div>
                  )}
                </section>
              )}

              <AgentPanel receiptId={detail.id} onComplete={handleAgentComplete} />

              {detail.expense && detail.expense.agentRuns.length > 0 && (
                <section className="rounded-lg border border-zinc-200 bg-white p-5">
                  <h3 className="text-sm font-medium text-zinc-900">Run history</h3>
                  <ul className="mt-3 space-y-2">
                    {detail.expense.agentRuns.map((run) => (
                      <li key={run.id} className="rounded-md bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{run.model}</span>
                          <span>{run.status}</span>
                        </div>
                        <div className="mt-1 flex gap-3 text-zinc-500">
                          <span>TTFT: {run.ttftMs ?? "—"}ms</span>
                          <span>Total: {run.totalDurationMs ?? "—"}ms</span>
                          <span>Tokens: {(run.inputTokens ?? 0) + (run.outputTokens ?? 0)}</span>
                          <span>{run.toolCalls.length} tool calls</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="text-zinc-800">{value}</dd>
    </div>
  );
}

function Badge({ tone, children }: { tone: "amber" | "emerald" | "zinc"; children: React.ReactNode }) {
  const tones = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    zinc: "bg-zinc-100 text-zinc-600",
  };
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}
