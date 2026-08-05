import type { PmoDocument } from "@/lib/pmo-schema";

const DEFAULT_WEBHOOK_URL =
  "https://eraneos-agentic-platform.azurewebsites.net/webhook/7666d3c6-b63f-4e79-b10a-82a002a9cf47";

const MAX_BATCH_BYTES = 29 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".md", ".txt", ".csv", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"]);

export type PmoApiResponse = {
  ok?: boolean;
  source?: "github" | "bootstrap";
  storageConfigured?: boolean;
  document?: PmoDocument;
  error?: string;
  commit?: { sha?: string; url?: string };
};

export type WorkflowIntakeResponse = {
  ok?: boolean;
  error?: string;
  wpId?: string;
  committedFiles?: string[];
  needs_review?: string[];
};

type ExtractedEvidence = { name: string; type: "text" | "xlsx" | "image_ocr"; content: string };

function webhookUrl() {
  return process.env.NEXT_PUBLIC_N8N_PMO_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL;
}

function extension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function unwrap<T>(raw: unknown): T {
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === "object" && "json" in first) {
      return (first as { json: T }).json;
    }
    return first as T;
  }
  return raw as T;
}

async function callWorkflow<T>(secret: string, body: unknown): Promise<T> {
  const normalizedSecret = secret.trim();
  if (!normalizedSecret) throw new Error("Enter the pilot password to continue.");

  const response = await fetch(webhookUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-n8n-webhook-secret": normalizedSecret,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") || "";
  const raw: unknown = contentType.includes("application/json") ? await response.json() : await response.text();
  const payload = unwrap<T & { error?: string }>(raw);
  if (!response.ok) {
    const message = payload && typeof payload === "object" ? payload.error : undefined;
    throw new Error(message || `The PMO workflow returned HTTP ${response.status}.`);
  }
  return payload;
}

export function loadPmoDocument(secret: string) {
  return callWorkflow<PmoApiResponse>(secret, { mode: "pmo.read" });
}

export function savePmoDocument(secret: string, document: PmoDocument) {
  return callWorkflow<PmoApiResponse>(secret, { mode: "pmo.save", document });
}

async function extractEvidence(files: File[]): Promise<ExtractedEvidence[]> {
  if (files.length === 0) throw new Error("Select at least one evidence file.");
  if (files.length > 20) throw new Error("A maximum of 20 evidence files is allowed.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error("The evidence batch exceeds 29 MB.");
  }

  const extracted: ExtractedEvidence[] = [];
  for (const file of files) {
    const ext = extension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`Unsupported file type: ${file.name}`);

    if (ext === ".md" || ext === ".txt" || ext === ".csv") {
      extracted.push({ name: file.name, type: "text", content: await file.text() });
      continue;
    }

    if (ext === ".xls" || ext === ".xlsx") {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const content = workbook.SheetNames.map((sheet) => {
        const worksheet = workbook.Sheets[sheet];
        return `## Sheet: ${sheet}\n${XLSX.utils.sheet_to_csv(worksheet)}`;
      }).join("\n\n");
      extracted.push({ name: file.name, type: "xlsx", content });
      continue;
    }

    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(file, "eng");
    extracted.push({ name: file.name, type: "image_ocr", content: result.data.text || "" });
  }
  return extracted;
}

export async function ingestEvidence(
  secret: string,
  meta: Record<string, string>,
  files: File[],
) {
  const extracted = await extractEvidence(files);
  return callWorkflow<WorkflowIntakeResponse>(secret, { mode: "pmo.ingest", meta, extracted });
}
