import JSZip from "jszip";

export type ParsedFile = { path: string; content: string };

export async function parseZip(file: File): Promise<ParsedFile[]> {
  if (file.size > 25 * 1024 * 1024) throw new Error("ZIP exceeds 25MB limit.");

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const names = Object.keys(zip.files);

  if (names.length > 2000) throw new Error("ZIP exceeds 2000-file limit.");

  const entries: ParsedFile[] = [];
  for (const path of names) {
    const zf = zip.files[path];
    if (zf.dir) continue;
    if (!path.toLowerCase().endsWith(".md")) continue;

    const content = await zf.async("text");
    entries.push({ path, content });
  }

  return entries;
}
