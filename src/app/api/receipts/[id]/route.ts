/** GET /api/receipts/:id — one receipt's full detail plus its expense (if any) and audit trail. */
import { prisma } from "@/lib/db";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const receipt = await prisma.receipt.findUnique({
    where: { id },
    include: {
      expense: {
        include: {
          gifiCode: true,
          approvals: { orderBy: { createdAt: "desc" } },
          agentRuns: {
            orderBy: { startedAt: "desc" },
            include: { toolCalls: { orderBy: { startedAt: "asc" } } },
          },
        },
      },
    },
  });

  if (!receipt) {
    return Response.json({ error: `Receipt '${id}' not found` }, { status: 404 });
  }

  return Response.json({ receipt: serializeReceipt(receipt) });
}

// Prisma's Decimal fields aren't JSON-serializable as-is — converted here,
// once, rather than at every call site that reads this response.
function serializeReceipt(receipt: unknown) {
  return JSON.parse(
    JSON.stringify(receipt, (_key, value) =>
      value && typeof value === "object" && "toFixed" in value ? Number(value) : value,
    ),
  );
}
