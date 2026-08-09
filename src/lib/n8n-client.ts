import type { PmoDocument } from "@/lib/pmo-schema";

const DEFAULT_WEBHOOK_URL =
  "https://eraneos-agentic-platform.azurewebsites.net/webhook/7666d3c6-b63f-4e79-b10a-82a002a9cf47";

const MAX_BATCH_BYTES = 29 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".pdf", ".docx", ".json", ".md", ".txt", ".csv", ".xlsx", ".png", ".jpg", ".jpeg"]);

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
  document?: PmoDocument;
  appliedChanges?: Array<{ entity: string; action: string; id?: string; summary?: string }>;
};

export type ExtractedEvidence = {
  name: string;
  type: "text" | "json" | "docx_text" | "xlsx" | "pdf_text" | "image_ocr" | "text_update";
  content: string;
  mediaType?: string;
  size?: number;
  contentHash?: string;
};

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

export async function extractEvidence(files: File[]): Promise<ExtractedEvidence[]> {
  if (files.length > 20) throw new Error("A maximum of 20 evidence files is allowed.");
  if (files.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
    throw new Error("The evidence batch exceeds 29 MB.");
  }

  const extracted: ExtractedEvidence[] = [];
  for (const file of files) {
    const ext = extension(file.name);
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error(`Unsupported file type: ${file.name}`);

    const bytes = await file.arrayBuffer();
    const contentHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((value) => value.toString(16).padStart(2, "0")).join("");
    const metadata = { mediaType: file.type || "application/octet-stream", size: file.size, contentHash };

    if (ext === ".md" || ext === ".txt" || ext === ".csv") {
      extracted.push({ name: file.name, type: "text", content: new TextDecoder().decode(bytes), ...metadata });
      continue;
    }

    if (ext === ".json") {
      const raw = new TextDecoder().decode(bytes);
      let content = raw;
      try { content = JSON.stringify(JSON.parse(raw), null, 2); }
      catch { throw new Error(`Invalid JSON document: ${file.name}`); }
      extracted.push({ name: file.name, type: "json", content, ...metadata });
      continue;
    }

    if (ext === ".docx") {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(bytes);
      const documentXml = await zip.file("word/document.xml")?.async("string");
      if (!documentXml) throw new Error(`DOCX has no readable document body: ${file.name}`);
      const xml = new DOMParser().parseFromString(documentXml, "application/xml");
      const paragraphs = Array.from(xml.getElementsByTagNameNS("*", "p")).map((paragraph) =>
        Array.from(paragraph.getElementsByTagNameNS("*", "t")).map((node) => node.textContent || "").join(""),
      ).filter(Boolean);
      extracted.push({ name: file.name, type: "docx_text", content: paragraphs.join("\n"), ...metadata });
      continue;
    }

    if (ext === ".xlsx") {
      const { default: readExcelFile } = await import("read-excel-file/browser");
      const sheets = await readExcelFile(file);
      const content = sheets.map(({ sheet, data }) => {
        const csv = data.map((row) => row.map((cell) => {
          const value = cell instanceof Date ? cell.toISOString() : String(cell ?? "");
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        }).join(",")).join("\n");
        return `## Sheet: ${sheet}\n${csv}`;
      }).join("\n\n");
      extracted.push({ name: file.name, type: "xlsx", content, ...metadata });
      continue;
    }

    if (ext === ".pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map((item) => "str" in item ? item.str : "").join(" ");
        pages.push(`## Page ${pageNumber}\n${text}`);
      }
      extracted.push({ name: file.name, type: "pdf_text", content: pages.join("\n\n"), ...metadata });
      continue;
    }

    const Tesseract = await import("tesseract.js");
    const result = await Tesseract.recognize(file, "eng");
    extracted.push({ name: file.name, type: "image_ocr", content: result.data.text || "", ...metadata });
  }
  return extracted;
}

export async function ingestEvidence(
  secret: string,
  meta: Record<string, string>,
  files: File[],
  textUpdate = "",
) {
  const extracted = await extractEvidence(files);
  if (textUpdate.trim()) {
    extracted.unshift({ name: "workbench-update.md", type: "text_update", content: textUpdate.trim() });
  }
  if (extracted.length === 0) throw new Error("Add at least one document or written update.");
  return callWorkflow<WorkflowIntakeResponse>(secret, { mode: "pmo.ingest", meta, extracted });
}
