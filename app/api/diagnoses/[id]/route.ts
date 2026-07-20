import { NextRequest, NextResponse } from "next/server";
import { getRuntime } from "@/src/runtime/create-runtime";
import { handleGetDiagnosis } from "@/src/runtime/api/diagnoses-handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/diagnoses/[id]           → status + canonical report (internal)
// GET /api/diagnoses/[id]?publicToken=… → read-only report by public token
// Also supports: GET /api/diagnoses/tok_xxx → auto-detect public token format
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  // Support both query param and auto-detect tok_ format
  const publicTokenParam = req.nextUrl.searchParams.get("publicToken");
  const publicToken = publicTokenParam ?? (id.startsWith("tok_") ? id : null);
  const result = await handleGetDiagnosis(getRuntime(), { id, publicToken });
  return NextResponse.json(result.body, { status: result.status });
}
