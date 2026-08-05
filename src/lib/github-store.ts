import "server-only";

import { PmoDocumentSchema, type PmoDocument } from "./pmo-schema";

const DEFAULT_PATH = "knowledge/pmo/control-tower.json";

type GitHubContent = { content?: string; sha?: string };

function config() {
  const token = process.env.PMO_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || "main";
  const path = process.env.PMO_DATA_PATH || DEFAULT_PATH;
  return { token, owner, repo, branch, path };
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function contentUrl(owner: string, repo: string, path: string, branch?: string) {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const base = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
  return branch ? `${base}?ref=${encodeURIComponent(branch)}` : base;
}

export async function readPmoDocument(): Promise<{ document: PmoDocument | null; configured: boolean }> {
  const { token, owner, repo, branch, path } = config();
  if (!token || !owner || !repo) return { document: null, configured: false };

  const response = await fetch(contentUrl(owner, repo, path, branch), {
    headers: headers(token),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) return { document: null, configured: true };
  if (!response.ok) throw new Error(`GitHub read failed (${response.status}).`);

  const payload = (await response.json()) as GitHubContent;
  if (!payload.content) throw new Error("GitHub returned an empty PMO document.");
  const decoded = Buffer.from(payload.content.replace(/\n/g, ""), "base64").toString("utf8");
  return { document: PmoDocumentSchema.parse(JSON.parse(decoded)), configured: true };
}

export async function writePmoDocument(document: PmoDocument, message: string) {
  const { token, owner, repo, branch, path } = config();
  if (!token || !owner || !repo) throw new Error("GitHub storage is not configured.");

  const getResponse = await fetch(contentUrl(owner, repo, path, branch), {
    headers: headers(token),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!getResponse.ok && getResponse.status !== 404) throw new Error(`GitHub revision lookup failed (${getResponse.status}).`);
  const existing = getResponse.ok ? ((await getResponse.json()) as GitHubContent) : null;

  const response = await fetch(contentUrl(owner, repo, path), {
    method: "PUT",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      branch,
      content: Buffer.from(JSON.stringify(document, null, 2) + "\n", "utf8").toString("base64"),
      ...(existing?.sha ? { sha: existing.sha } : {}),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) throw new Error(`GitHub write failed (${response.status}).`);
  const result = (await response.json()) as { commit?: { sha?: string; html_url?: string } };
  return { sha: result.commit?.sha, url: result.commit?.html_url };
}
