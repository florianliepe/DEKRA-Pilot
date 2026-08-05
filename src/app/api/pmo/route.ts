import { NextResponse } from "next/server";
import { bootstrapPmoData } from "@/lib/pmo-fixtures";
import { PmoDocumentSchema } from "@/lib/pmo-schema";
import { readPmoDocument, writePmoDocument } from "@/lib/github-store";
import { isAuthorized } from "@/lib/request-auth";

export async function GET() {
  try {
    const result = await readPmoDocument();
    return NextResponse.json({
      ok: true,
      source: result.document ? "github" : "bootstrap",
      storageConfigured: result.configured,
      document: result.document ?? bootstrapPmoData,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to load PMO data.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

export async function PUT(request: Request) {
  if (!isAuthorized(request.headers.get("x-app-secret"))) {
    return NextResponse.json({ ok: false, error: "A valid app secret is required to publish changes." }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const parsed = PmoDocumentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: "The PMO document is invalid.", issues: parsed.error.issues }, { status: 422 });
    }

    const current = await readPmoDocument();
    const nextRevision = Math.max(parsed.data.revision, current.document?.revision ?? 0) + 1;
    const next = {
      ...parsed.data,
      revision: nextRevision,
      project: { ...parsed.data.project, updatedAt: new Date().toISOString() },
    };
    const commit = await writePmoDocument(next, `chore(pmo): update control tower revision ${nextRevision}`);
    return NextResponse.json({ ok: true, document: next, commit });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to publish PMO data.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
