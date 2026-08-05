import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/request-auth";

type FileItem = { path: string; content: string };

async function getExistingSha(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string
): Promise<string | undefined> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`SHA lookup failed for ${path}: ${res.status}`);

  const json = await res.json();
  return json.sha as string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));

    const provided = req.headers.get("x-app-secret") || (body?.appSecret as string) || null;
    if (!isAuthorized(provided)) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const token = process.env.PMO_GITHUB_TOKEN || process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";

    if (!token || !owner || !repo) {
      return NextResponse.json({ error: "Missing GitHub env vars" }, { status: 500 });
    }

    const files = (body.files || []) as FileItem[];
    const message = (body.message as string) || "chore(pmo): ingest files";

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "files[] required" }, { status: 400 });
    }

    const validFiles = files.every((file) => typeof file?.path === "string" && typeof file?.content === "string" && file.path.startsWith("knowledge/") && !file.path.includes(".."));
    if (!validFiles) return NextResponse.json({ error: "Only files below knowledge/ may be committed." }, { status: 400 });

    const results: Array<{ path: string; ok: boolean; status: number; response: unknown }> = [];

    for (const f of files) {
      const sha = await getExistingSha(owner, repo, branch, f.path, token);

      const putRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(f.path)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            message,
            content: Buffer.from(f.content, "utf-8").toString("base64"),
            branch,
            sha,
          }),
        }
      );

      let response: unknown;
      const ctype = putRes.headers.get("content-type") || "";
      if (ctype.includes("application/json")) response = await putRes.json();
      else response = await putRes.text();

      results.push({
        path: f.path,
        ok: putRes.ok,
        status: putRes.status,
        response,
      });
    }

    const ok = results.every((result) => result.ok);
    return NextResponse.json({ ok, results }, { status: ok ? 200 : 502 });
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "GitHub commit failed." }, { status: 500 });
  }
}
