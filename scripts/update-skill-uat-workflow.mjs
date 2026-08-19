import { readFile, writeFile } from "node:fs/promises";

const workflowPath = new URL("../docs/n8n-skill-designer-v3.workflow.json", import.meta.url);
const workflow = JSON.parse(await readFile(workflowPath, "utf8"));
const node = workflow.nodes.find((item) => item.name === "Governance Gate and v3 Store");
if (!node?.parameters?.jsCode) throw new Error("Governance Gate and v3 Store was not found.");

const startMarker = "if($json.mode==='skill.ingest_job'){";
const endMarker = "if($json.mode==='skill.clarify_job'){";
const start = node.parameters.jsCode.indexOf(startMarker);
const end = node.parameters.jsCode.indexOf(endMarker);
if (start < 0 || end <= start) throw new Error("The governed job-ingest block was not found.");

const replacement = `if($json.mode==='skill.ingest_job'){
  const input=result.job_description||{};
  const extractedSource=(body.extracted||[]).map(item=>item.content).join('\\n\\n');
  const rawSource=String(extractedSource||input.sourceText||'').slice(0,240000);
  const sourceName=String((body.extracted||[])[0]?.name||'governed-source');
  const clean=value=>String(value||'').replace(/^[•○▪◦\\-–—\\s]+/,'').replace(/\\s+/g,' ').trim();
  const unique=values=>[...new Set(values.map(clean).filter(Boolean))];
  const parseCsvLine=line=>{const cells=[];let value='';let quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'){if(quoted&&line[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(char===','&&!quoted){cells.push(clean(value));value='';}else value+=char;}cells.push(clean(value));return cells;};
  const sheets=[];let currentSheet=null;for(const [index,line] of rawSource.split(/\\r?\\n/).entries()){const marker=line.match(/^## Sheet:\\s*(.+)$/i);if(marker){currentSheet={name:clean(marker[1]),rows:[]};sheets.push(currentSheet);continue;}if(currentSheet&&line.trim())currentSheet.rows.push({row:index+1,cells:parseCsvLine(line)});}
  const oldJob=sheets.find(sheet=>/old jd|job description|role/i.test(sheet.name));
  const toolSheet=sheets.find(sheet=>/tool/i.test(sheet.name));
  const notesSheet=sheets.find(sheet=>/manager notes|notes|ambigu/i.test(sheet.name));
  const taskRows=(oldJob?.rows||[]).filter(item=>/^\\d+$/.test(item.cells[0]||'')&&item.cells[1]);
  const traitOnly=/(agile|communicative|resilient|hands-on|team player|personality)/i;
  const taskEvidence=taskRows.filter(item=>!traitOnly.test(item.cells[1]));
  const verbs=/^(manage|coordinate|maintain|plan|support|monitor|participate|control|ensure|collect|explain|prioriti[sz]e|run|provide|follow|resolve|order|track|escalate|review|build|create|configure|handle|advise|record|identify|moderate|prepare|perform|apply|assess|diagnose|govern|engineer|develop|operate|implement|optimi[sz]e|facilitate|enable|interpret|align|patch|write|train|automate)\\b/i;
  const candidates=rawSource.split(/\\n+|[•○▪◦]+/).map(clean).filter(value=>value.length>=12&&value.length<=320&&!/^##?\\s*(slide|sheet)\\b/i.test(value)&&!value.includes(','));
  input.responsibilities=unique([...(Array.isArray(input.responsibilities)?input.responsibilities:[]),...(taskEvidence.length?taskEvidence.map(item=>item.cells[1]):candidates.filter(value=>verbs.test(value)))]).slice(0,14);
  input.activities=unique([...(Array.isArray(input.activities)?input.activities:[]),...input.responsibilities.map(value=>value.replace(/[.;:]$/,''))]).slice(0,14);
  const noteRows=(notesSheet?.rows||[]).filter(item=>/^N-\\d+/i.test(item.cells[0]||''));
  const outcomeRows=noteRows.filter(item=>/outcome|performance|quality|availability|reliability/i.test(item.cells[1]||''));
  input.outcomes=unique([...(Array.isArray(input.outcomes)?input.outcomes:[]),...(sheets.length?outcomeRows.map(item=>item.cells[2]):[])]).filter(value=>!/known data-quality|trait language dominates|tool list is treated|scope.*contradictory|success measures.*vague/i.test(value)).slice(0,8);
  if(!Array.isArray(input.constraints)||!input.constraints.length)input.constraints=unique(noteRows.map(item=>item.cells[2])).slice(0,12);
  if(!Array.isArray(input.context)||!input.context.length)input.context=unique((oldJob?.rows||[]).filter(item=>/^(Department|Reports to|Location|Grade)$/i.test(item.cells[0]||'')).map(item=>item.cells.slice(0,2).join(': '))).slice(0,8);
  const knownTool=/\\b(SAP|ServiceNow|SQL|Azure(?: Portal| DevOps| Monitor)?|Entra|APIs?|Terraform|Bicep|GitHub(?: Actions)?|Power BI|Power Automate|PowerPoint|PowerShell|Python|Kubernetes|Excel|BPMN|Lean|Six Sigma|Signavio|ITIL)\\b/gi;
  const matrixTools=(toolSheet?.rows||[]).filter(item=>item.cells[0]&&!/^(Item|Current-state|Deliberate test defect)/i.test(item.cells[0])).map(item=>item.cells[0]);
  if(!Array.isArray(input.tools)||!input.tools.length)input.tools=unique([...matrixTools,...[...rawSource.matchAll(knownTool)].map(match=>match[1])]).slice(0,20);
  if(!Array.isArray(input.qualifications))input.qualifications=[];
  if(!String(input.purpose||'').trim()||input.purpose.includes(','))input.purpose=String(body.metadata?.title||'Governed job description')+' — legacy evidence normalized for outcome and skill clarification.';
  const recordByValue=new Map();for(const item of taskEvidence)recordByValue.set(clean(item.cells[1]),{section:oldJob?.name||'job description',location:'sheet '+(oldJob?.name||'job description')+' / row '+item.row});for(const item of outcomeRows)recordByValue.set(clean(item.cells[2]),{section:notesSheet?.name||'manager notes',location:'sheet '+(notesSheet?.name||'manager notes')+' / row '+item.row});for(const item of (toolSheet?.rows||[]))recordByValue.set(clean(item.cells[0]),{section:toolSheet?.name||'tool matrix',location:'sheet '+(toolSheet?.name||'tool matrix')+' / row '+item.row});
  if(!Array.isArray(input.evidenceSegments)||!input.evidenceSegments.length){const typed=[['responsibility',input.responsibilities],['outcome',input.outcomes],['activity',input.activities],['tool',input.tools]];input.evidenceSegments=typed.flatMap(([type,values])=>(values||[]).map((value,index)=>{const ref=recordByValue.get(clean(value));return{id:\`SEG-\${String(input.id||body.metadata?.title||Date.now()).replace(/[^A-Za-z0-9-]/g,'-')}-\${type.toUpperCase()}-\${index+1}\`,sourceId:\`SRC-\${String(input.id||body.metadata?.title||Date.now()).replace(/[^A-Za-z0-9-]/g,'-')}\`,sourceName,section:ref?.section||type,location:ref?.location||\`derived \${type} \${index+1}\`,quotation:String(value),normalizedType:type,normalizedValue:String(value),confidence:type==='tool'?75:82};}));}
  const findings=Array.isArray(input.intakeFindings)?input.intakeFindings:[];
  if($json.agentRun?.error?.code==='INVALID_AGENT_JSON')findings.push({code:'AGENT_PARSE_FALLBACK',severity:'warning',message:'The agent response was malformed; deterministic source normalization was applied and all results remain draft-only.',sourceName});
  if(!input.responsibilities.length||!input.evidenceSegments.length)findings.push({code:'LOW_QUALITY',severity:'error',message:'Normalized job evidence lacks responsibilities or traceable evidence; mapping is blocked until clarification.',sourceName});
  if(!input.outcomes.length)findings.push({code:'OUTCOME_AMBIGUITY',severity:'warning',message:'The legacy source contains no measurable outcome statement; clarify outcomes before approving a role profile.',sourceName});
  input.intakeFindings=findings;
  const id=String(input.id||\`JD-\${now}\`);const sourceText=String(input.sourceText||(body.extracted||[]).map(item=>item.content).join('\\n\\n')).slice(0,240000);const sourceFiles=(body.extracted||[]).map(item=>({name:String(item.name||'source'),mediaType:String(item.mediaType||'application/octet-stream'),size:Number(item.size||String(item.content||'').length),contentHash:item.contentHash}));const duplicate=workspace.jobDescriptions.find(job=>(job.sourceFiles||[]).some(existing=>existing.contentHash&&sourceFiles.some(file=>file.contentHash===existing.contentHash)));if(duplicate)return[{json:{ok:false,statusCode:409,error:\`Duplicate governed source already belongs to \${duplicate.id}.\`,workspace}}];const job={id,title:String(input.title||body.metadata?.title||'Untitled job'),jobFamily:String(input.jobFamily||body.metadata?.jobFamily||'Unclassified'),country:String(input.country||body.metadata?.country||'Global'),language:String(input.language||body.metadata?.language||'English'),purpose:String(input.purpose||''),sourceText,responsibilities:Array.isArray(input.responsibilities)?input.responsibilities:[],outcomes:Array.isArray(input.outcomes)?input.outcomes:[],activities:Array.isArray(input.activities)?input.activities:[],tools:Array.isArray(input.tools)?input.tools:[],qualifications:Array.isArray(input.qualifications)?input.qualifications:[],context:Array.isArray(input.context)?input.context:[],constraints:Array.isArray(input.constraints)?input.constraints:[],evidenceSegments:Array.isArray(input.evidenceSegments)?input.evidenceSegments:[],sourceFiles,intakeFindings:input.intakeFindings,intakeIdempotencyKey:idempotencyKey,status:'analysed',version:1,updatedAt:new Date().toISOString()};workspace.jobDescriptions=[job,...workspace.jobDescriptions.filter(item=>item.id!==id)];}
`;

node.parameters.jsCode = node.parameters.jsCode.slice(0, start) + replacement + node.parameters.jsCode.slice(end);
node.parameters.jsCode = node.parameters.jsCode.replace(
  "if($json.policyDenied){workspace.agentRuns=",
  "if($json.policyDenied&&!($json.mode==='skill.ingest_job'&&$json.agentRun?.error?.code==='INVALID_AGENT_JSON')){workspace.agentRuns=",
);

const governor = workflow.nodes.find((item) => item.name === "Request Governor v3");
if (!governor?.parameters?.jsCode) throw new Error("Request Governor v3 was not found.");
governor.parameters.jsCode = governor.parameters.jsCode.replace(
  "useAgent:['skill.ingest','skill.ingest_job','skill.interview','skill.clarify_job','skill.map_job','skill.elicitation'].includes(mode)",
  "useAgent:['skill.ingest','skill.ingest_job','skill.interview','skill.clarify_job','skill.map_job','skill.elicitation'].includes(mode)&&!(mode==='skill.ingest_job'&&body.extracted?.some(item=>item.type==='xlsx'))",
);
await writeFile(workflowPath, `${JSON.stringify(workflow, null, 2)}\n`, "utf8");
console.log("Updated governed XLSX normalization block.");
