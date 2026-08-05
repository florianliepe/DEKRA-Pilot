import matter from "gray-matter";
import { z } from "zod";
import { STATUS, RAG, CONFIDENCE, EVIDENCE, FIXED_HEADINGS } from "./okf-types";

const universalSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    title: z.string().min(1),
    status: z.enum(STATUS),
    rag: z.enum(RAG),
    owner_role: z.string().min(1),
    last_updated: z.string().min(1),
    revision: z.number().int().nonnegative(),
    source: z.array(z.string()).min(1),
    confidence: z.enum(CONFIDENCE),
    tags: z.array(z.string()),
  })
  .passthrough();

export type ValidationResult = {
  valid: boolean;
  errors: string[];
  data?: { frontmatter: Record<string, unknown>; content: string };
};

export function validateOkfMarkdown(raw: string): ValidationResult {
  const errors: string[] = [];
  const parsed = matter(raw);

  const fmRes = universalSchema.safeParse(parsed.data);
  if (!fmRes.success) {
    errors.push(...fmRes.error.issues.map((i) => `frontmatter.${i.path.join(".")}: ${i.message}`));
  }

  const hasEvidence = parsed.data.evidence;
  if (hasEvidence && !EVIDENCE.includes(hasEvidence)) {
    errors.push(`frontmatter.evidence: must be one of ${EVIDENCE.join(", ")}`);
  }

  let cursor = -1;
  for (const h of FIXED_HEADINGS) {
    const idx = parsed.content.indexOf(h);
    if (idx === -1) {
      errors.push(`missing heading: ${h}`);
      continue;
    }
    if (idx < cursor) errors.push(`heading order violation near: ${h}`);
    cursor = idx;
  }

  return {
    valid: errors.length === 0,
    errors,
    data: { frontmatter: parsed.data as Record<string, unknown>, content: parsed.content },
  };
}
