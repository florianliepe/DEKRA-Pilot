import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import Tesseract from "tesseract.js";

const MAX_BATCH_BYTES = 29 * 1024 * 1024;
const ALLOWED_EXT = [".md", ".txt", ".csv", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];

function ext(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

async function parseXlsx(file: File) {
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const out: Array<{ sheet: string; csv: string }> = [];
  for (const n of wb.SheetNames) {
    const ws = wb.Sheets[n];
    out.push({ sheet: n, csv: XLSX.utils.sheet_to_csv(ws) });
  }
  return out;
}

async function parseImageOCR(file: File) {
  const ab = await file.arrayBuffer();
  const buf = Buffer.from(ab);
  const res = await Tesseract.recognize(buf, "eng");
  return res.data.text || "";
}

type CanonicalResponse = { wpId?: string; markdown?: string; json?: unknown; needs_review?: unknown[]; [key: string]: unknown };

function unwrapN8nData(raw: unknown): CanonicalResponse {
  // Accept plain object
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as CanonicalResponse;

  // Accept array payloads (common in n8n)
  if (Array.isArray(raw) && raw.length > 0) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) return (first as { json: CanonicalResponse }).json;
    return first && typeof first === "object" ? first as CanonicalResponse : {};
  }

  return {};
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const metaRaw = String(form.get("meta") || "{}");
    const meta = JSON.parse(metaRaw);

    const files = form.getAll("files").filter(Boolean) as File[];
    let totalBytes = 0;
    for (const f of files) totalBytes += f.size;
    if (totalBytes > MAX_BATCH_BYTES) {
      return NextResponse.json({ error: "Batch exceeds 29MB" }, { status: 400 });
    }

    const extracted: Array<{ name: string; type: string; content: string }> = [];

    for (const f of files) {
      const e = ext(f.name);
      if (!ALLOWED_EXT.includes(e)) {
        return NextResponse.json({ error: `Unsupported file type: ${f.name}` }, { status: 400 });
      }

      if (e === ".md" || e === ".txt" || e === ".csv") {
        extracted.push({ name: f.name, type: "text", content: await f.text() });
      } else if (e === ".xls" || e === ".xlsx") {
        const sheets = await parseXlsx(f);
        extracted.push({
          name: f.name,
          type: "xlsx",
          content: sheets.map((s) => `## Sheet: ${s.sheet}\n${s.csv}`).join("\n\n"),
        });
      } else if (e === ".png" || e === ".jpg" || e === ".jpeg") {
        const text = await parseImageOCR(f);
        extracted.push({ name: f.name, type: "image_ocr", content: text });
      }
    }

    const n8nUrl = process.env.N8N_WEBHOOK_URL;
    if (!n8nUrl) return NextResponse.json({ error: "N8N_WEBHOOK_URL missing" }, { status: 500 });

    const upstream = await fetch(n8nUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "ingest", meta, extracted }),
      cache: "no-store",
    });

    const ctype = upstream.headers.get("content-type") || "";
    const raw = ctype.includes("application/json") ? await upstream.json() : await upstream.text();
    const data = unwrapN8nData(raw);

    const wpId = data?.wpId ?? meta?.wpId;
    const markdown = data?.markdown;
    const jsonObj = data?.json;

    // If workflow is async and only acknowledges start, return 202-style info
    if (!markdown || !jsonObj) {
      return NextResponse.json(
        {
          ok: false,
          upstreamStatus: upstream.status,
          info: "n8n accepted request but did not return final payload yet.",
          required: ["wpId", "markdown", "json"],
          received: data,
          hint: "Set n8n Webhook node response mode to return final data from Respond to Webhook node.",
        },
        { status: 200 }
      );
    }

    const mdPath = `knowledge/work-packages/${wpId}.md`;
    const jsonPath = `knowledge/work-packages/${wpId}.json`;

    const appUrl = new URL(req.url).origin;
    const commitRes = await fetch(`${appUrl}/api/github/commit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-secret": process.env.APP_SHARED_SECRET || "",
      },
      body: JSON.stringify({
        message: `chore(pmo): ingest ${wpId}`,
        files: [
          { path: mdPath, content: String(markdown) },
          { path: jsonPath, content: JSON.stringify(jsonObj, null, 2) },
        ],
      }),
      cache: "no-store",
    });

    const commitJson = await commitRes.json();

    return NextResponse.json(
      {
        ok: true,
        upstreamStatus: upstream.status,
        wpId,
        committedFiles: [mdPath, jsonPath],
        needs_review: data?.needs_review || [],
        commitResult: commitJson,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Intake failed." }, { status: 500 });
  }
}
