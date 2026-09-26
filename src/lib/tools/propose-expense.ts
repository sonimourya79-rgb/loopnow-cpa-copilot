/**
 * `propose_expense` — the ONLY tool that writes state, and the one this
 * whole system's authorization story hinges on.
 *
 * Deliberate design choice: this tool does NOT accept an already-computed
 * ITC result or GIFI classification from the agent. It takes the RAW inputs
 * (subtotal, tax, category, commercial-use %, documentation status, a
 * proposed GIFI code) and recomputes both itself, server-side, by calling
 * the same pure rule functions `calculate_itc`/`classify_gifi` call. An
 * agent that tried to pass along a fabricated "the ITC is $500" after
 * calling calculate_itc and getting a smaller number has no path to make
 * that number land in the database — this function never reads it.
 *
 * Idempotent per receipt: a receipt has at most one Expense (enforced by the
 * schema's `@unique` on `Expense.receiptId`), and this tool upserts rather
 * than blindly inserting, so calling it twice for the same receipt updates
 * the one row instead of creating a duplicate bookkeeping entry.
 *
 * Every call writes an AuditEvent in the SAME transaction as the Expense
 * write — there is no code path that changes an Expense without leaving a
 * trail, structurally, not by convention.
 */
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  calculateITC,
  ItcCalculationInputSchema,
  verifyProposedGifiCode,
  defaultGifiForCategory,
} from "@/lib/rules";
import type { ToolDefinition } from "./types";

export const ProposeExpenseInputSchema = ItcCalculationInputSchema.extend({
  receiptId: z.string().min(1),
  /** Omit to use the category's default GIFI mapping instead of an agent proposal. */
  proposedGifiCode: z.string().min(1).optional(),
  /** Who/what is making this proposal — "agent" for the AI loop, a user id for a human editing directly. Never blank. */
  actor: z.string().min(1),
});

export interface ProposeExpenseOutput {
  expenseId: string;
  eligibleITC: number;
  itcReasonCode: string;
  gifiCode: string | null;
  gifiState: "CONFIRMED" | "REVIEW_REQUIRED";
  requiresReview: boolean;
  /** Only present when requiresReview is true — the pending Approval's id. */
  approvalId: string | null;
}

export const proposeExpenseTool: ToolDefinition<typeof ProposeExpenseInputSchema, ProposeExpenseOutput> = {
  name: "propose_expense",
  description:
    "Create or update the bookkeeping expense for a receipt. Recomputes the ITC and GIFI " +
    "classification itself from the raw inputs — any ITC/GIFI values you mention elsewhere are " +
    "informational only and have no effect on what actually gets saved. Any outcome needing a human " +
    "decision creates a pending Approval instead of finalizing silently.",
  inputSchema: ProposeExpenseInputSchema,
  async execute(input) {
    const { receiptId, proposedGifiCode, actor, ...itcInput } = input;

    // Recompute from scratch — see file header. Nothing from the agent's own
    // prior tool-call outputs is trusted here.
    const itc = calculateITC(itcInput);
    const gifi = proposedGifiCode
      ? verifyProposedGifiCode(proposedGifiCode, itcInput.category)
      : defaultGifiForCategory(itcInput.category);

    const requiresReview = itc.requiresReview || gifi.state === "REVIEW_REQUIRED";
    const totalAmount = itcInput.subtotal + itcInput.taxAmount;

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const expense = await tx.expense.upsert({
        where: { receiptId },
        create: {
          receiptId,
          subtotal: itcInput.subtotal,
          taxAmount: itcInput.taxAmount,
          totalAmount,
          category: itcInput.category,
          mealsExceptionType: itcInput.mealsExceptionType ?? null,
          commercialUsePercentage: itcInput.commercialUsePercentage,
          documentationStatus: itcInput.documentationStatus,
          documentationTier: itc.documentationTier,
          eligibilityPercentage: itc.eligibilityPercentage,
          eligibleItc: itc.eligibleITC,
          itcReasonCode: itc.reasonCode,
          itcRuleApplied: itc.ruleApplied,
          gifiCodeId: gifi.code,
          gifiState: gifi.state,
          requiresReview,
        },
        update: {
          subtotal: itcInput.subtotal,
          taxAmount: itcInput.taxAmount,
          totalAmount,
          category: itcInput.category,
          mealsExceptionType: itcInput.mealsExceptionType ?? null,
          commercialUsePercentage: itcInput.commercialUsePercentage,
          documentationStatus: itcInput.documentationStatus,
          documentationTier: itc.documentationTier,
          eligibilityPercentage: itc.eligibilityPercentage,
          eligibleItc: itc.eligibleITC,
          itcReasonCode: itc.reasonCode,
          itcRuleApplied: itc.ruleApplied,
          gifiCodeId: gifi.code,
          gifiState: gifi.state,
          requiresReview,
        },
      });

      await tx.auditEvent.create({
        data: {
          entityType: "expense",
          entityId: expense.id,
          action: "itc_calculated",
          actor,
          detail: {
            itcReasonCode: itc.reasonCode,
            eligibleITC: itc.eligibleITC,
            gifiState: gifi.state,
            gifiCode: gifi.code,
          },
        },
      });

      let approvalId: string | null = null;
      if (requiresReview) {
        // Idempotent: don't stack a second pending approval on top of one
        // already open for this expense.
        const existing = await tx.approval.findFirst({
          where: { expenseId: expense.id, status: "pending" },
        });
        if (existing) {
          approvalId = existing.id;
        } else {
          const reason = !gifi.code && itc.requiresReview
            ? `${itc.ruleApplied}; ${gifi.reason}`
            : itc.requiresReview
              ? itc.ruleApplied
              : gifi.reason;
          const approval = await tx.approval.create({
            data: { expenseId: expense.id, reason },
          });
          approvalId = approval.id;

          await tx.auditEvent.create({
            data: {
              entityType: "approval",
              entityId: approval.id,
              action: "created",
              actor,
              detail: { reason },
            },
          });
        }
      }

      return { expense, approvalId };
    });

    return {
      expenseId: result.expense.id,
      eligibleITC: itc.eligibleITC,
      itcReasonCode: itc.reasonCode,
      gifiCode: gifi.code,
      gifiState: gifi.state,
      requiresReview,
      approvalId: result.approvalId,
    };
  },
};
