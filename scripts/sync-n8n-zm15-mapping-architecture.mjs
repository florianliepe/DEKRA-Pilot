import fs from "node:fs";

const path = "docs/n8n-skill-designer-v3.workflow.json";
const workflow = JSON.parse(fs.readFileSync(path, "utf8"));
workflow.name = "DEKRA Skill Designer v3 — ZM-15 mapping architecture";
workflow.meta = { ...(workflow.meta || {}), targetMode: "ZM-15", technicalMaximum: 5, behavioralMaximum: 5, coreSkillMaximum: 10, fillerMappingsAllowed: false };

const context = workflow.nodes.find((node) => node.name === "Build Governed Agent Context");
const agent = workflow.nodes.find((node) => node.name === "Governed Skill Design Agent");
const executor = workflow.nodes.find((node) => node.name === "Deterministic Tool Policy Executor");
const store = workflow.nodes.find((node) => node.name === "Governance Gate and v3 Store");
if (!context || !agent || !executor || !store) throw new Error("Required governed workflow nodes are missing.");

context.parameters.jsCode = context.parameters.jsCode.replace(
  "'skill.map_job':['skill.taxonomy.read','skill.kfla.read_public','skill.tools.read','skill.mapping.score','skill.review.draft','skill.review.prepare']",
  "'skill.map_job':['skill.taxonomy.read','skill.kfla.read_public','skill.tools.read','skill.mapping.score','skill.validation.run','skill.review.draft','skill.review.prepare']",
);
store.parameters.jsCode = store.parameters.jsCode.replace(
  "'review_package_generator']",
  "'review_package_generator','taxonomy_hierarchy_resolver','skill_type_classifier','kfla_relationship_mapper','profile_composition_validator']",
);
context.parameters.jsCode = context.parameters.jsCode.replace(
  "approvedCatalog:approved,kflaPublicMetadata:",
  "approvedCatalog:approved,taxonomyHierarchy:{domains:(workspace.domains||[]).filter(item=>item.status==='approved').map(item=>({id:item.id,name:item.name,description:item.description})),groups:(workspace.groups||[]).filter(item=>item.status==='approved').map(item=>({id:item.id,domainId:item.domainId,name:item.name,description:item.description}))},kflaPublicMetadata:",
);
context.parameters.jsCode = context.parameters.jsCode.replace(
  "'Compose 8 to 10 distinct role skills across approved mappings and governed taxonomy gaps.'",
  "'Compose only evidence-backed core mappings: up to five technical skills and up to five behavioral competencies, maximum ten total; never pad with filler.'",
);

agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  "ZM-13 MECE ROLE PROFILE CONTRACT: For skill.map_job compose a complete proposed profile of 8 to 10 distinct skills",
  "ZM-13 MECE ROLE PROFILE CONTRACT (superseded by ZM-15): For skill.map_job compose an evidence-grounded profile of up to 10 distinct core skills",
);
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  '"validationFindings":[]}],"mapping_proposals"',
  '"validationFindings":[],"taxonomyPlacement":{"domainId":string,"groupId":string,"rationale":string,"confidence":number,"alternativeGroupIds":[]},"classification":{"type":"technical|competency","confidence":number,"rationale":string,"evidenceRefs":[],"ruleIds":[]}}],"mapping_proposals"',
);
agent.parameters.options.systemMessage = agent.parameters.options.systemMessage.replace(
  '"confidence":number}],"mapping_omissions"',
  '"confidence":number,"classification":{"type":"technical|competency","confidence":number,"rationale":string,"evidenceRefs":[],"ruleIds":[]},"taxonomyPath":{"domainId":string,"groupId":string,"skillId":string,"inherited":true},"primaryKflaCompetencyId":string|null,"secondaryKflaCompetencyIds":[]}],"mapping_omissions"',
);

const contract = `\nZM-15 TAXONOMY-AWARE CORE PROFILE CONTRACT: For skill.map_job return only technical skills and behavioral competencies in the core profile. Use at most five of each and at most ten total; fewer are correct when evidence is insufficient. Never add a weak match to reach a minimum. For every approved skill, resolve taxonomyPath {domainId,groupId,skillId,inherited:true} from the supplied mono-hierarchy. Return classification {type:technical|competency,confidence,rationale,evidenceRefs,ruleIds}. A competency must return one primaryKflaCompetencyId when supported and may return secondaryKflaCompetencyIds; technical skills must return no KFLA link. For a taxonomy-gap draft, return taxonomyPlacement {domainId,groupId,rationale,confidence,alternativeGroupIds} and only dimension technical or competency. If placement or classification is ambiguous, preserve the gap and raise a blocking review finding. Allocate 100 weight points across the evidence-backed profile, retain one primary owner for each material responsibility/outcome, and expose uncovered evidence instead of inventing filler. Experiences, traits, drivers, tools, tasks and qualifications are context, not core-skill mappings.`;
if (!agent.parameters.options.systemMessage.includes("ZM-15 TAXONOMY-AWARE CORE PROFILE CONTRACT")) agent.parameters.options.systemMessage += contract;

executor.parameters.jsCode = executor.parameters.jsCode.replace(
  "review_package_generator:()=>({packageRef:opaque('review_package_generator','package')})",
  "review_package_generator:()=>({packageRef:opaque('review_package_generator','package')}),taxonomy_hierarchy_resolver:()=>({taxonomyPathRef:opaque('taxonomy_hierarchy_resolver','path')}),skill_type_classifier:()=>({classificationRef:opaque('skill_type_classifier','classification')}),kfla_relationship_mapper:()=>({kflaMappingRef:opaque('kfla_relationship_mapper','relationships')}),profile_composition_validator:()=>({findingsRef:opaque('profile_composition_validator','findings')})",
);

let code = store.parameters.jsCode;
code = code.replace(
  "const candidateCount=proposals.length+gaps.length;const totalProfileWeight",
  "const candidateCount=proposals.length+gaps.length;const approvedById=new Map((workspace.skills||[]).map(item=>[item.id,item]));const technicalCount=proposals.filter(item=>approvedById.get(item.skillId)?.dimension==='technical').length+gaps.filter(item=>item.dimension==='technical').length;const behavioralCount=proposals.filter(item=>approvedById.get(item.skillId)?.dimension==='competency').length+gaps.filter(item=>item.dimension==='competency').length;const unsupportedCoreCount=proposals.filter(item=>!['technical','competency'].includes(approvedById.get(item.skillId)?.dimension)).length+gaps.filter(item=>!['technical','competency'].includes(item.dimension)).length;const totalProfileWeight",
);
code = code.replace(
  "for(const [index,gap] of gaps.entries()){const evidenceRefs=Array.isArray(gap.evidenceRefs)?gap.evidenceRefs:[];if(!String(gap.action||'').trim()",
  "for(const [index,gap] of gaps.entries()){const evidenceRefs=Array.isArray(gap.evidenceRefs)?gap.evidenceRefs:[];const placement=gap.taxonomyPlacement||{};const placementGroup=(workspace.groups||[]).find(item=>item.id===placement.groupId&&item.status==='approved');const placementDomain=(workspace.domains||[]).find(item=>item.id===placement.domainId&&item.status==='approved');if(!['technical','competency'].includes(gap.dimension)||!placementGroup||!placementDomain||placementGroup.domainId!==placementDomain.id||!String(placement.rationale||'').trim()||!String(gap.action||'').trim()",
);
code = code.replace(
  "if(unsupportedCoreCount)globalFinding('MAPPING-PROFILE-TYPE-001','classification',`${unsupportedCoreCount} non-core facets were returned as skills.`,'Keep experiences, traits, drivers, tools, tasks and qualifications outside the core profile.',materialIds[0]);if(Math.round(totalProfileWeight)!==100)",
  "if(unsupportedCoreCount)globalFinding('MAPPING-PROFILE-TYPE-001','classification',`${unsupportedCoreCount} non-core facets were returned as skills.`,'Keep experiences, traits, drivers, tools, tasks and qualifications outside the core profile.',materialIds[0]);for(const item of proposals){const skill=approvedById.get(item.skillId);const group=(workspace.groups||[]).find(candidate=>candidate.id===skill?.groupId&&candidate.status==='approved');const domain=(workspace.domains||[]).find(candidate=>candidate.id===group?.domainId&&candidate.status==='approved');const path=item.taxonomyPath||{};if(!skill||!group||!domain||path.skillId!==skill.id||path.groupId!==group.id||path.domainId!==domain.id||path.inherited!==true)globalFinding('MAPPING-TAXONOMY-PATH-001','taxonomyPath',`Mapping ${item.skillId} does not resolve to its governed L1/L2/L3 path.`,'Resolve the selected approved skill through its single group and domain.',item.evidenceRefs?.[0]);const type=item.classification?.type;if(!item.classification||type!==skill.dimension||!['technical','competency'].includes(type)||!item.classification.rationale||!(item.classification.evidenceRefs||[]).length)globalFinding('MAPPING-CLASSIFICATION-001','classification',`Mapping ${item.skillId} lacks an evidence-grounded technical or behavioral classification.`,'Return classification, confidence, rationale, evidenceRefs and ruleIds matching the approved skill.',item.evidenceRefs?.[0]);const kflaIds=[item.primaryKflaCompetencyId,...(item.secondaryKflaCompetencyIds||[])].filter(Boolean);if(type==='technical'&&kflaIds.length)globalFinding('MAPPING-KFLA-TYPE-001','primaryKflaCompetencyId',`Technical skill ${item.skillId} must not carry a KFLA relationship.`,'Remove KFLA links from the technical mapping.',item.evidenceRefs?.[0]);if(type==='competency'&&(!item.primaryKflaCompetencyId||!(workspace.kfla||[]).some(k=>k.id===item.primaryKflaCompetencyId&&k.enabled)))globalFinding('MAPPING-KFLA-PRIMARY-001','primaryKflaCompetencyId',`Behavioral competency ${item.skillId} lacks one valid primary KFLA relationship.`,'Select one evidence-backed primary public-metadata KFLA competency or expose a blocking gap.',item.evidenceRefs?.[0]);}if(Math.round(totalProfileWeight)!==100)",
);
code = code.replace(
  "if(candidateCount<8||candidateCount>10)globalFinding('MAPPING-PROFILE-SIZE-001','mapping_proposals',`The complete role profile contains ${candidateCount} skills or governed gaps; 8 to 10 are required.`,'Consolidate overlaps or add evidence-grounded mappings/taxonomy gaps without padding weak matches.',materialIds[0]);",
  "if(candidateCount<1||candidateCount>10)globalFinding('MAPPING-PROFILE-SIZE-001','mapping_proposals',`The core profile contains ${candidateCount} evidence-backed mappings or gaps; one to ten are allowed.`,'Remove filler and retain no more than ten evidence-backed core mappings.',materialIds[0]);if(technicalCount>5)globalFinding('MAPPING-PROFILE-TECHNICAL-001','classification',`The profile contains ${technicalCount} technical skills; at most five are allowed.`,'Consolidate overlap and retain the five strongest evidence-backed technical skills.',materialIds[0]);if(behavioralCount>5)globalFinding('MAPPING-PROFILE-BEHAVIORAL-001','classification',`The profile contains ${behavioralCount} behavioral competencies; at most five are allowed.`,'Consolidate overlap and retain the five strongest evidence-backed behavioral competencies.',materialIds[0]);if(unsupportedCoreCount)globalFinding('MAPPING-PROFILE-TYPE-001','classification',`${unsupportedCoreCount} non-core facets were returned as skills.`,'Keep experiences, traits, drivers, tools, tasks and qualifications outside the core profile.',materialIds[0]);",
);
code = code.replace(
  "explanation:item.explanation,source:'agent',status:'proposed'",
  "explanation:item.explanation,classification:item.classification,taxonomyPath:item.taxonomyPath,primaryKflaCompetencyId:item.primaryKflaCompetencyId,secondaryKflaCompetencyIds:item.secondaryKflaCompetencyIds||[],source:'agent',status:'proposed'",
);
code = code.replace(
  "groupId:'GRP-SBO',dimension:item.dimension==='trait_driver'?'trait':item.dimension||'technical'",
  "groupId:String(item.taxonomyPlacement?.groupId||'UNPLACED'),dimension:['technical','competency'].includes(item.dimension)?item.dimension:'technical'",
);
code = code.replace(
  "jobDescriptionId:body.jobDescriptionId||null}",
  "jobDescriptionId:body.jobDescriptionId||null,taxonomyPlacement:item.taxonomyPlacement||null,classification:item.classification||null}",
);
store.parameters.jsCode = code;

const publisherPath = "docs/n8n-skill-publisher-v3.workflow.json";
const publisher = JSON.parse(fs.readFileSync(publisherPath, "utf8"));
const publisherGate = publisher.nodes.find((node) => node.name === "Validate and Prepare Atomic Release");
if (!publisherGate) throw new Error("Publisher validation node not found.");
publisherGate.parameters.jsCode = publisherGate.parameters.jsCode.replace(
  "'mapping_scorer','draft_suggestion_writer','review_package_generator'",
  "'mapping_scorer','draft_suggestion_writer','review_package_generator','taxonomy_hierarchy_resolver','skill_type_classifier','kfla_relationship_mapper','profile_composition_validator'",
);
fs.writeFileSync(publisherPath, JSON.stringify(publisher, null, 2) + "\n");

fs.writeFileSync(path, JSON.stringify(workflow, null, 2) + "\n");
console.log("Synchronized ZM-15 core-profile, hierarchy, classification, KFLA relation and composition contracts.");
