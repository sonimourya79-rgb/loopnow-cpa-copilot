"use client";

import { useState, useRef, useCallback } from "react";
import type { AgentStreamEvent } from "./types";

const TOOL_LABELS: Record<string, string> = {
  read_receipt: "Reading receipt",
  check_documentation: "Checking CRA documentation tier",
  validate_gst_hst_number: "Validating GST/HST number format",
  calculate_itc: "Calculating Input Tax Credit",
  classify_gifi: "Classifying GIFI code",
  propose_expense: "Saving expense",
};

interface ToolStep {
  toolName: string;
  status: "running" | "done" | "failed";
  output?: unknown;
  errorMessage?: string | null;
}

export function AgentPanel({ receiptId, onComplete }: { receiptId: string; onComplete: () => void }) {
  const [isRunning, setIsRunning] = useState(false);
  const [isMockMode, setIsMockMode] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    setIsRunning(true);
    setText("");
    setSteps([]);
    setError(null);
    setIsMockMode(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptId, userMessage: "Please process this receipt." }),
        signal: controller.signal,
      });

      if (!response.body) throw new Error("No response stream from server");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const event: AgentStreamEvent = JSON.parse(line.slice("data: ".length));
          applyEvent(event);
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") setError(err.message);
    } finally {
      setIsRunning(false);
      onComplete();
    }

    function applyEvent(event: AgentStreamEvent) {
      switch (event.type) {
        case "mode":
          setIsMockMode(event.isMockMode);
          break;
        case "text_delta":
          setText((prev) => prev + event.text);
          break;
        case "tool_call_start":
          setSteps((prev) => [...prev, { toolName: event.toolName, status: "running" }]);
          break;
        case "tool_call_result":
          setSteps((prev) => {
            const next = [...prev];
            const idx = next.findLastIndex((s) => s.toolName === event.toolName && s.status === "running");
            if (idx >= 0) {
              next[idx] = {
                toolName: event.toolName,
                status: event.succeeded ? "done" : "failed",
                output: event.output,
                errorMessage: event.errorMessage,
              };
            }
            return next;
          });
          break;
        case "run_error":
          setError(event.message);
          break;
        default:
          break;
      }
    }
  }, [receiptId, onComplete]);

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium text-zinc-900">Agent</h3>
        <button
          onClick={run}
          disabled={isRunning}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRunning ? "Processing…" : "Process this receipt"}
        </button>
      </div>

      {isMockMode !== null && (
        <div
          className={`mt-3 rounded-md px-3 py-2 text-xs font-medium ${
            isMockMode ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {isMockMode
            ? "TEST MODE — no ANTHROPIC_API_KEY configured. Every tool call and database write below is real; the model's reasoning follows a fixed script instead of live LLM decisions."
            : "Live mode — reasoning is a real Claude model."}
        </div>
      )}

      {steps.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <StepIcon status={step.status} />
              <span className={step.status === "failed" ? "text-red-700" : "text-zinc-700"}>
                {TOOL_LABELS[step.toolName] ?? step.toolName}
              </span>
              {step.status === "failed" && step.errorMessage && (
                <span className="text-xs text-red-600">— {step.errorMessage}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {text && (
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-700">{text}</p>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}

function StepIcon({ status }: { status: ToolStep["status"] }) {
  if (status === "running") {
    return (
      <span className="inline-block size-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600" />
    );
  }
  if (status === "failed") {
    return <span className="text-sm text-red-600">✕</span>;
  }
  return <span className="text-sm text-emerald-600">✓</span>;
}
