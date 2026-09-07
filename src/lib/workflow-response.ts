export async function readWorkflowResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try { return JSON.parse(text); }
  catch { return text; }
}

export function workflowErrorMessage(payload: unknown, status: number, workflowLabel: string) {
  if (status === 401 || status === 403) {
    return `The pilot password was rejected by the ${workflowLabel}. Reopen the workspace with the current shared password. If the password was rotated, synchronize the shared n8n Header Auth credential across all protected workflows.`;
  }
  if (payload && typeof payload === "object") {
    const candidate = payload as { error?: unknown; message?: unknown };
    if (typeof candidate.error === "string" && candidate.error.trim()) return candidate.error;
    if (typeof candidate.message === "string" && candidate.message.trim()) return candidate.message;
  }
  if (typeof payload === "string" && payload.trim() && !/<html/i.test(payload)) return payload.trim();
  return `${workflowLabel} returned HTTP ${status} without a valid JSON error response.`;
}
