/** GET /api/receipts — every receipt + its expense status, for the picker UI. */
import { prisma } from "@/lib/db";

export async function GET() {
  const receipts = await prisma.receipt.findMany({
    orderBy: { createdAt: "desc" },
    include: { expense: true },
  });

  return Response.json({
    receipts: receipts.map((r) => ({
      id: r.id,
      supplierName: r.supplierName,
      totalAmount: r.totalAmount ? Number(r.totalAmount) : null,
      date: r.date ? r.date.toISOString() : null,
      hasExpense: !!r.expense,
      requiresReview: r.expense?.requiresReview ?? null,
      eligibleItc: r.expense ? Number(r.expense.eligibleItc) : null,
    })),
  });
}
