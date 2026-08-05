import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/request-auth";

export async function POST(request: Request) {
  if (!isAuthorized(request.headers.get("x-app-secret"))) {
    return NextResponse.json({ ok: false, error: "A valid app secret is required." }, { status: 401 });
  }
  try {
    if (!request.headers.get("content-type")?.includes("application/json")) {
      return NextResponse.json({ ok: false, error: "Content-Type must be application/json." }, { status: 415 });
    }
    const body: unknown = await request.json();
    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) return NextResponse.json({ ok: false, error: "The workflow endpoint is not configured." }, { status: 503 });
    const n8nSecret = process.env.N8N_WEBHOOK_SECRET;

    const upstream = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(n8nSecret ? { "x-n8n-webhook-secret": n8nSecret } : {}) },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000),
    });
    const raw = await upstream.text();
    let data: unknown = raw;
    try { data = raw ? JSON.parse(raw) as unknown : null; } catch { data = { message: "Workflow returned a non-JSON response." }; }
    return NextResponse.json({ ok: upstream.ok, upstreamStatus: upstream.status, data }, { status: upstream.ok ? 200 : 502 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Workflow request failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
