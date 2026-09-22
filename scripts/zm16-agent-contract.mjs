export const zm16Contract = `
ZM-16 DEKRA JOB-FIRST DESIGN CONTRACT: The supplied job description is immutable evidence. Derive a concise, globally reusable skill profile from observable responsibilities and outcomes; do not rewrite the source or turn tasks, tools, qualifications, traits, drivers or experience into skills. Use approved catalogue skills first. Propose a new skill only for an evidenced capability gap, with Action + Object + Outcome syntax, duplicate analysis, a single L1 domain/L2 group, and an explicit review finding. All outputs remain drafts; never approve or publish.
COMPOSITION: Target approximately five hard/technical/functional skills and five behavioral competencies, with at most five per category and ten total. This is an evidence-based target, not a quota: fewer are correct when the job evidence does not support ten. If the resulting split differs by more than one, explain the evidence-based exception in profile_proposal.compositionExceptionReason; never invent filler. Assign each material responsibility or outcome to exactly one primary proposal, and expose uncovered or conflicting evidence. Allocate 100 weight points only when a nonempty evidence-backed profile can be composed.
CLASSIFICATION: For each new technical-category skill return capabilityType as one of hard, technical, functional, interface. Use hard for transferable technical knowledge or methods; technical for a specialised technical capability; functional for job-function practice; interface for a cross-functional bridge. Never classify a behavioral competency as a technical-category subtype. Match behavioral proposals to the available public KFLA metadata and authorized internal interpretations. Return the KFLA ID plus any directly supported DEKRA Leadership Standard and Core Competency links as reviewable allocations, not as invented licensed definitions. An uncertain link must be flagged for steward review rather than asserted.
KFLA GAP CONTRACT: Every new_skill_proposals item with dimension competency must return primaryKflaCompetencyId matching a supplied public KFLA ID, or null with a blocking validationFinding and explicit reason why the metadata cannot support a link. Never invent a KFLA ID. New technical-category proposals must return primaryKflaCompetencyId null. Preserve this link on the draft skill and in its review payload; it is not an approval. Exact DEKRA Leadership Standard name matches may be shown as crosswalks, while broader Core Competency themes remain reviewable interpretations.
PRINCIPLES: Use the six DEKRA skill-design questions supplied in the workspace as provisional review guidance: strategic relevance, observable outcomes, clear granularity, globally reusable naming, evidence/proficiency, and governed ownership. They do not override the approved taxonomy, evidence, or human approval gate. Licensed definitions are unavailable unless the authorized workspace explicitly supplies them.
TAXONOMY PLACEMENT GAP: If an evidence-backed new skill has no fitting approved L2 group, return taxonomyPlacement.domainId for the fitting approved L1 domain, groupId null, a concrete placement rationale and possible alternatives. Do not force an unrelated group. The runtime will retain the proposal as a blocked draft requiring a taxonomy steward to create or approve an L2 group before skill approval.
`;

export function applyZm16Contract(workflow) {
  const agent = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
  if (!agent?.parameters?.options?.systemMessage) throw new Error("Governed Skill Design Agent is missing.");
  const prompt = agent.parameters.options.systemMessage;
  if (!prompt.includes("ZM-16 DEKRA JOB-FIRST DESIGN CONTRACT")) agent.parameters.options.systemMessage = prompt + zm16Contract;
  else if (!prompt.includes("KFLA GAP CONTRACT")) agent.parameters.options.systemMessage = prompt + "\nKFLA GAP CONTRACT:" + zm16Contract.split("KFLA GAP CONTRACT:")[1].split("\nPRINCIPLES:")[0];
  if (!agent.parameters.options.systemMessage.includes("TAXONOMY PLACEMENT GAP")) agent.parameters.options.systemMessage += "\nTAXONOMY PLACEMENT GAP:" + zm16Contract.split("TAXONOMY PLACEMENT GAP:")[1];

  const gate = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
  if (!gate?.parameters?.jsCode) throw new Error("Governance Gate and v3 Store is missing.");
  const original = "dimension:['technical','competency'].includes(item.dimension)?item.dimension:'technical',aliases:[]";
  const previous = "dimension:['technical','competency'].includes(item.dimension)?item.dimension:'technical',capabilityType:item.dimension==='technical'&&['hard','technical','functional','interface'].includes(item.capabilityType)?item.capabilityType:undefined,aliases:[]";
  const replacement = "dimension:['technical','competency'].includes(item.dimension)?item.dimension:'technical',capabilityType:item.dimension==='technical'&&['hard','technical','functional','interface'].includes(item.capabilityType)?item.capabilityType:undefined,kflaCompetencyId:item.dimension==='competency'&&(workspace.kfla||[]).some(k=>k.id===item.primaryKflaCompetencyId)?item.primaryKflaCompetencyId:undefined,aliases:[]";
  if (gate.parameters.jsCode.includes(original)) gate.parameters.jsCode = gate.parameters.jsCode.replace(original, replacement);
  else if (gate.parameters.jsCode.includes(previous)) gate.parameters.jsCode = gate.parameters.jsCode.replace(previous, replacement);
  else if (!gate.parameters.jsCode.includes(replacement)) throw new Error("New-skill persistence contract changed; refusing an unsafe patch.");
  const payloadOriginal = "classification:item.classification||null}});}}";
  const payloadPrevious = "classification:item.classification||null,capabilityType:item.dimension==='technical'&&['hard','technical','functional','interface'].includes(item.capabilityType)?item.capabilityType:null}});}}";
  const payloadReplacement = "classification:item.classification||null,capabilityType:item.dimension==='technical'&&['hard','technical','functional','interface'].includes(item.capabilityType)?item.capabilityType:null,primaryKflaCompetencyId:item.dimension==='competency'&&(workspace.kfla||[]).some(k=>k.id===item.primaryKflaCompetencyId)?item.primaryKflaCompetencyId:null}});}}";
  if (gate.parameters.jsCode.includes(payloadOriginal)) gate.parameters.jsCode = gate.parameters.jsCode.replace(payloadOriginal, payloadReplacement);
  else if (gate.parameters.jsCode.includes(payloadPrevious)) gate.parameters.jsCode = gate.parameters.jsCode.replace(payloadPrevious, payloadReplacement);
  else if (!gate.parameters.jsCode.includes(payloadReplacement)) throw new Error("Review payload contract changed; refusing an unsafe patch.");
  const findingsOriginal = "validationFindings:item.validationFindings||[],evidenceRefs:item.evidenceRefs||[]";
  const findingsReplacement = "validationFindings:[...(item.validationFindings||[]),...(item.dimension==='competency'&&!(workspace.kfla||[]).some(k=>k.id===item.primaryKflaCompetencyId)?[{ruleId:'ZM16-KFLA-LINK-001',severity:'error',field:'primaryKflaCompetencyId',message:'Behavioral draft lacks a verified KFLA allocation.',correction:'Select a supported public KFLA competency or resolve the taxonomy gap with a steward.',blocking:true}]:[]),...(item.dimension==='technical'&&!['hard','technical','functional','interface'].includes(item.capabilityType)?[{ruleId:'ZM16-TECHNICAL-SUBTYPE-001',severity:'error',field:'capabilityType',message:'Technical draft lacks a valid capability subtype.',correction:'Classify the draft as hard, technical, functional or interface.',blocking:true}]:[])],evidenceRefs:item.evidenceRefs||[]";
  if (gate.parameters.jsCode.includes(findingsOriginal)) gate.parameters.jsCode = gate.parameters.jsCode.replace(findingsOriginal, findingsReplacement);
  else if (!gate.parameters.jsCode.includes(findingsReplacement) && !gate.parameters.jsCode.includes("ZM16-GROUP-PLACEMENT-001")) throw new Error("Draft validation contract changed; refusing an unsafe patch.");
  const placementOriginal = "!placementGroup||!placementDomain||placementGroup.domainId!==placementDomain.id||!String(placement.rationale||'').trim()";
  const placementReplacement = "!placementDomain||(placementGroup&&placementGroup.domainId!==placementDomain.id)||!String(placement.rationale||'').trim()";
  if (gate.parameters.jsCode.includes(placementOriginal)) gate.parameters.jsCode = gate.parameters.jsCode.replace(placementOriginal, placementReplacement);
  else if (!gate.parameters.jsCode.includes(placementReplacement)) throw new Error("Taxonomy-gap validation contract changed; refusing an unsafe patch.");
  const findingMarker = "validationFindings:[...(item.validationFindings||[]),";
  const findingWithGroup = "validationFindings:[...(item.validationFindings||[]),...(!(workspace.groups||[]).some(g=>g.id===item.taxonomyPlacement?.groupId&&g.status==='approved')?[{ruleId:'ZM16-GROUP-PLACEMENT-001',severity:'error',field:'taxonomyPlacement.groupId',message:'No approved L2 group fits this proposed skill.',correction:'A taxonomy steward must approve an appropriate group before this skill can be approved.',blocking:true}]:[]),";
  if (gate.parameters.jsCode.includes(findingMarker)) gate.parameters.jsCode = gate.parameters.jsCode.replace(findingMarker, findingWithGroup);
  else if (!gate.parameters.jsCode.includes(findingWithGroup)) throw new Error("Taxonomy-gap review contract changed; refusing an unsafe patch.");
  const readOriginal = "if($json.mode==='skill.read'){store.workspace=workspace;return[{json:{ok:true,workspace,message:'Skill workspace loaded from the governed v3 orchestrator.'}}];}";
  const readReplacement = "if($json.mode==='skill.read'){const readWorkspace=store.workspace||workspace;return[{json:{ok:true,workspace:readWorkspace,message:'Skill workspace loaded from the governed v3 orchestrator.'}}];}";
  if (gate.parameters.jsCode.includes(readOriginal)) gate.parameters.jsCode = gate.parameters.jsCode.replace(readOriginal, readReplacement);
  else if (!gate.parameters.jsCode.includes(readReplacement)) throw new Error("Read-only workspace contract changed; refusing an unsafe patch.");
  for (const status of [403, 422]) {
    const from = `store.workspace=workspace;return[{json:{ok:false,statusCode:${status}`;
    const to = `if(body.deferPersistence!==true)store.workspace=workspace;return[{json:{ok:false,deferredPersistence:body.deferPersistence===true,statusCode:${status}`;
    if (gate.parameters.jsCode.includes(from)) gate.parameters.jsCode = gate.parameters.jsCode.replace(from, to);
    else if (!gate.parameters.jsCode.includes(to)) throw new Error(`Deferred-persistence error contract ${status} changed; refusing an unsafe patch.`);
  }
  return workflow;
}
