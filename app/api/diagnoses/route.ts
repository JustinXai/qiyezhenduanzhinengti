import { NextResponse, type NextRequest } from "next/server";
import { getRuntime } from "@/src/runtime/create-runtime";
import { handleCreateDiagnosis } from "@/src/runtime/api/diagnoses-handlers";

// better-sqlite3 is native → force the Node.js runtime, never the Edge runtime.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/diagnoses — create a diagnosis from a DiagnosisInput payload.
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null; // invalid/empty JSON → handler returns 400 INVALID_INPUT
  }
  const result = await handleCreateDiagnosis(getRuntime(), body);
  return NextResponse.json(result.body, { status: result.status });
}
