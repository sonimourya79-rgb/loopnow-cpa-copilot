// Shared shapes between the API routes and the client components — kept
// deliberately separate from the Prisma models, since the client only ever
// sees the serialized/JSON-safe projection, never a raw DB row.

export interface ReceiptListItem {
  id: string;
  supplierName: string | null;
  totalAmount: number | null;
  date: string | null;
  hasExpense: boolean;
  requiresReview: boolean | null;
  eligibleItc: number | null;
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  input: unknown;
  output: unknown;
  succeeded: boolean;
  errorMessage: string | null;
  latencyMs: number | null;
  startedAt: string;
}

export interface AgentRunRecord {
  id: string;
  status: string;
  model: string;
  ttftMs: number | null;
  totalDurationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  toolCalls: ToolCallRecord[];
}

export interface ExpenseRecord {
  id: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  category: string;
  commercialUsePercentage: number;
  documentationStatus: string;
  documentationTier: number;
  eligibilityPercentage: number;
  eligibleItc: number;
  itcReasonCode: string;
  itcRuleApplied: string;
  gifiCodeId: string | null;
  gifiState: string;
  requiresReview: boolean;
  gifiCode: { code: string; label: string } | null;
  approvals: { id: string; reason: string; status: string }[];
  agentRuns: AgentRunRecord[];
}

export interface ReceiptDetail {
  id: string;
  supplierName: string | null;
  gstHstNumber: string | null;
  date: string | null;
  totalAmount: number | null;
  itemizedDescription: string | null;
  purchaserName: string | null;
  termsOfPayment: string | null;
  rawText: string | null;
  expense: ExpenseRecord | null;
}

/** The union of every event the /api/agent SSE stream can emit. */
export type AgentStreamEvent =
  | { type: "mode"; isMockMode: boolean }
  | { type: "run_started"; agentRunId: string }
  | { type: "text_delta"; text: string }
  | { type: "tool_call_start"; toolName: string; input: unknown }
  | { type: "tool_call_result"; toolName: string; succeeded: boolean; output: unknown; errorMessage: string | null }
  | { type: "run_completed"; agentRunId: string; stopReason: string }
  | { type: "run_error"; message: string };
