import { expect, test } from "@playwright/test";
import { readWorkflowResponse, workflowErrorMessage } from "../src/lib/workflow-response";

test("handles empty JSON-labelled workflow errors without throwing a parser exception", async () => {
  const response = new Response("", { status: 403, headers: { "content-type": "application/json" } });
  const payload = await readWorkflowResponse(response);
  expect(payload).toEqual({});
  expect(workflowErrorMessage(payload, response.status, "PMO publication workflow")).toContain("pilot password was rejected");
});

test("preserves structured workflow validation errors", async () => {
  const response = new Response(JSON.stringify({ ok: false, error: "Revision conflict." }), { status: 409, headers: { "content-type": "application/json" } });
  const payload = await readWorkflowResponse(response);
  expect(workflowErrorMessage(payload, response.status, "PMO publication workflow")).toBe("Revision conflict.");
});
