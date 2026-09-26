/**
 * POST /api/agent — run the agent against one receipt, streamed as
 * Server-Sent Events so the UI can show token-by-token text and live
 * tool-call state ("Reading receipt... ✓ Validating... ✓").
 *
 * Body: { receiptId: string, userMessage: string }
 *
 * Every AgentRun belongs to an Expense (see schema.prisma), but a fresh
 * receipt has no Expense yet — that only gets created when the agent's
 * `propose_expense` tool actually runs, partway through the conversation.
 * So this route ensures a DRAFT Expense exists for the receipt first
 * (requiresReview: true, nothing calculated yet) before starting the run —
 * `propose_expense` then updates that same row in place once it runs, the
 * same upsert-by-receiptId path any other call to it takes.
 */
import { z } from "zod";
import { prisma } from "@/lib/db";
import { runAgent } from "@/lib/agent/loop";
import { getModelClient } from "@/lib/agent/get-model-client";

export const runtime = "nodejs";

const RequestSchema = z.object({
  receiptId: z.string().min(1),
  userMessage: z.string().min(1),
});

function sseLine(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: Request) {
  const rawBody = await request.json().catch(() => null);
  const parsed = RequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }
  const { receiptId, userMessage } = parsed.data;

  const receipt = await prisma.receipt.findUnique({ where: { id: receiptId } });
  if (!receipt) {
    return Response.json({ error: `Receipt '${receiptId}' not found` }, { status: 404 });
  }

  const draftExpense = await prisma.expense.upsert({
    where: { receiptId },
    create: {
      receiptId,
      subtotal: 0,
      taxAmount: 0,
      totalAmount: 0,
      category: "other",
      commercialUsePercentage: 0,
      documentationStatus: "missing",
      documentationTier: 1,
      eligibilityPercentage: 0,
      eligibleItc: 0,
      itcReasonCode: "ITC_NO_TAX_CHARGED",
      itcRuleApplied: "Not yet processed",
      gifiState: "REVIEW_REQUIRED",
      requiresReview: true,
    },
    update: {}, // already exists (reprocessing) — leave it as-is until propose_expense updates it
  });

  const { client: modelClient, isMockMode } = getModelClient({ receiptId });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(sseLine({ type: "mode", isMockMode })));
      try {
        for await (const event of runAgent({ expenseId: draftExpense.id, userMessage, modelClient })) {
          controller.enqueue(encoder.encode(sseLine(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Agent stream failed";
        controller.enqueue(encoder.encode(sseLine({ type: "run_error", message })));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
