import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const component = read("src/components/emerging-skill-radar.tsx");
const runtime = read("src/lib/emerging-skill-runtime.ts");
const client = read("src/lib/emerging-skill-client.ts");
const config = JSON.parse(read("data/emerging-skills-agent-config.json"));
const workflow = JSON.parse(read("docs/n8n-zm19-emerging-skills-runtime.workflow.json"));

const requiredComponentTokens = ["Run trend scan", "Re-run latest sources", "Interrupt run", "CandidateLevelGuide", "Knowledge & collaboration", "Problem solving", "Accountability", "Impact"];
for (const token of requiredComponentTokens) if (!component.includes(token) && !runtime.includes(token)) throw new Error(`ZM-19 UI contract is missing: ${token}`);
for (const token of ["skill-designer-trend-radar-async-v1", "skill-designer-trend-radar-control-v1"]) if (!client.includes(token)) throw new Error(`ZM-19 client endpoint is missing: ${token}`);
if (config.runtime?.persistence !== "n8n Data Table" || config.proficiencyModel?.levels?.length !== 4 || config.proficiencyModel?.differentiationLevers?.length !== 4) throw new Error("ZM-19 configuration contract is incomplete.");
for (const name of ["Trend Radar Start API", "Fetch Allowlisted Source", "Governed Trend and Skills Agent", "Persist Terminal Trend Run", "Trend Radar Control API", "Persist Trend Interrupt Request"]) if (!workflow.nodes.some((node) => node.name === name)) throw new Error(`ZM-19 workflow node is missing: ${name}`);
if (!workflow.nodes.some((node) => node.type === "n8n-nodes-base.dataTable") || workflow.active !== false) throw new Error("The generated ZM-19 workflow must use Data Table persistence and remain inactive until live deployment.");
console.log("ZM-19 runtime, UI, proficiency and governance contracts verified.");
