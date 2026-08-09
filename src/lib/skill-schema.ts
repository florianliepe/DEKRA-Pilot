export const proficiencyLevels = [
  { id: 1, name: "Awareness", description: "Understands the concept and works with direct guidance." },
  { id: 2, name: "Application", description: "Performs standard work independently in routine situations." },
  { id: 3, name: "Mastery", description: "Solves complex, non-routine problems and coaches others." },
  { id: 4, name: "Strategic / Expert", description: "Shapes strategy and pioneers new methods." },
] as const;

export type ProficiencyDefinition = {
  id: 1 | 2 | 3 | 4;
  name: string;
  description: string;
  behavioralIndicators: string[];
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type SkillDimension = "technical" | "competency" | "experience" | "trait" | "driver";
export type Lifecycle = "draft" | "in_review" | "approved" | "archived" | "deprecated" | "retired";
export type ReviewStatus = "pending" | "accepted" | "rejected" | "deferred" | "merged";
export type DataClassification = "public" | "internal" | "confidential" | "licensed";
export type SourceClassification = "public" | "organization_authored" | "licensed";

export type LocalizedConceptLabel = {
  id: string;
  entityType: "domain" | "group" | "skill" | "kfla_factor" | "kfla_cluster" | "kfla_competency" | "controlled_tool";
  entityId: string;
  language: string;
  label: string;
  description?: string;
  sourceClassification: Exclude<SourceClassification, "licensed">;
  licenceStatus: "public_metadata" | "internal_explanation";
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type GovernanceMeta = {
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  updatedBy: string;
  replacedById?: string;
};

export type TaxonomyNode = { id: string; name: string; description: string; status: Lifecycle; governance?: GovernanceMeta };
export type TaxonomyRelationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: "broader" | "narrower" | "related" | "prerequisite" | "replacement" | "synonym";
  rationale: string;
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type KflaFactor = {
  id: "KFLA-FACTOR-THOUGHT" | "KFLA-FACTOR-RESULTS" | "KFLA-FACTOR-PEOPLE" | "KFLA-FACTOR-SELF";
  name: "Thought" | "Results" | "People" | "Self";
  description: string;
  sourceClassification: SourceClassification;
  licenceStatus: "public_metadata" | "internal_explanation" | "licensed_verified";
  sourceVersion: string;
  reviewDate: string;
  contentOwner: string;
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type KflaCluster = {
  id: string;
  factorId: KflaFactor["id"];
  name: string;
  description: string;
  sourceClassification: SourceClassification;
  licenceStatus: "public_metadata" | "internal_explanation" | "licensed_verified";
  sourceVersion: string;
  reviewDate: string;
  contentOwner: string;
  assignmentBasis: "organization_authored_navigation" | "licensed_verified";
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type KflaCompetency = {
  id: string;
  number: number;
  name: string;
  factor: KflaFactor["name"];
  factorId: KflaFactor["id"];
  clusterId: string;
  enabled: boolean;
  definition: string;
  source: "public-name" | "licensed" | "custom";
  sourceClassification: SourceClassification;
  licenceStatus: "public_metadata" | "internal_explanation" | "licensed_available" | "licensed_restricted";
  sourceVersion: string;
  reviewDate: string;
  contentOwner: string;
  reviewStatus: "verified_public_metadata" | "internal_review" | "licensed_review_required";
  publicSummary: string;
  internalInterpretation: string;
  licensedDefinitionRef?: string;
  observableSignals: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  positiveExamples: string[];
  counterExamples: string[];
  typicalEvidence: string[];
  relatedCompetencyIds: string[];
  mappingMistakes: string[];
  boundaryNotes: string;
  localizedLabels?: Record<string, string>;
  provenance: Array<{ label: string; url: string; access: "public" | "licensed" | "internal"; reviewedAt?: string }>;
  governance?: GovernanceMeta;
};

export type ControlledTool = {
  id: string;
  name: string;
  category: "method" | "technology" | "regulation" | "data" | "workflow";
  description: string;
  aliases: string[];
  skillIds: string[];
  allowedAgentActions: Array<"read" | "suggest_mapping" | "validate">;
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type JsonSchemaShape = { type: "object"; required?: string[]; properties: Record<string, { type: string; description?: string }> };
export type AgentToolDefinition = {
  id: string;
  name: string;
  purpose: string;
  inputSchema: JsonSchemaShape;
  outputSchema: JsonSchemaShape;
  requiredPermission: string;
  allowedDataClassifications: DataClassification[];
  timeoutMs: number;
  retryPolicy: { maxAttempts: number; backoffMs: number; retryableErrors: string[] };
  rateLimit: { requests: number; windowSeconds: number };
  errorContract: { codes: string[]; redactInputs: boolean };
  auditRequirements: string[];
  version: string;
  lifecycleStatus: "draft" | "active" | "deprecated" | "disabled";
  owner: string;
  allowedAgentActions: string[];
  replacementToolId?: string;
  supersedesToolIds?: string[];
};

export const requiredAgentToolIds = [
  "job_parser", "evidence_extractor", "taxonomy_search", "skill_similarity_search", "syntax_validator",
  "granularity_validator", "kfla_lookup", "controlled_tool_lookup", "mapping_scorer",
  "draft_suggestion_writer", "review_package_generator",
] as const;

export type AuditEvent = {
  id: string;
  at: string;
  actor: "human" | "agent" | "n8n";
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  correlationId?: string;
  frameworkVersion?: string;
  beforeVersion?: number;
  afterVersion?: number;
};

export type ReleaseManifest = {
  id: string;
  revision: number;
  schemaVersion: 3;
  frameworkVersion: string;
  rulesVersion: string;
  promptVersion: string;
  mappingScoreVersion: string;
  state: "prepared" | "published" | "failed" | "rolled_back";
  approvedAt: string;
  approvedBy: string;
  expectedPreviousRevision: number;
  expectedGitHubSha?: string;
  githubCommitSha?: string;
  githubPath: string;
  idempotencyKey: string;
  objectCounts: Record<string, number>;
  validationSummary: { blocking: number; warnings: number };
  rollbackOfRevision?: number;
};

export type Publication = {
  revision: number;
  state: "working" | "approved_release" | "publishing" | "conflict" | "failed";
  approvedAt?: string;
  approvedBy?: string;
  githubPath: string;
  githubCommitSha?: string;
  expectedGitHubSha?: string;
  idempotencyKey?: string;
  lastError?: string;
};

export type Skill = {
  id: string;
  name: string;
  description: string;
  groupId: string;
  dimension: SkillDimension;
  kflaCompetencyId?: string;
  aliases: string[];
  evidence: string[];
  confidence: number;
  observability: string;
  futureRelevance: "core" | "emerging" | "legacy";
  status: Lifecycle;
  syntax?: { action: string; object: string; outcome?: string; context?: string };
  externalRefs?: Array<{ framework: "ESCO" | "ONET" | "KornFerry" | "custom"; id: string; label: string }>;
  governance?: GovernanceMeta;
};

export type ProfileSkill = { skillId: string; targetLevel: 1 | 2 | 3 | 4; weight: number; critical: boolean };
export type ProfileExcludedLink = { skillId: string; reason: string; sourceMappingId?: string; status: "unapproved_skill" | "rejected_mapping" | "deferred_mapping" | "coverage_gap" };
export type RoleProfile = { id: string; title: string; jobFamily: string; purpose: string; status: Lifecycle; skills: ProfileSkill[]; jobDescriptionId?: string; strategicVectorIds?: string[]; excludedLinks?: ProfileExcludedLink[]; agentRunId?: string; governance?: GovernanceMeta };
export type JobEvidenceKind = "purpose" | "responsibility" | "outcome" | "activity" | "tool" | "qualification" | "context" | "constraint";
export type JobSourceFile = { name: string; mediaType: string; size: number; contentHash?: string };
export type JobEvidenceSegment = {
  id: string;
  sourceId: string;
  sourceName: string;
  section: string;
  location: string;
  quotation: string;
  normalizedType: JobEvidenceKind;
  normalizedValue: string;
  confidence: number;
};
export type JobIntakeFinding = { code: "UNSUPPORTED" | "DUPLICATE" | "LOW_QUALITY" | "MISSING_SECTION"; severity: "warning" | "error"; message: string; sourceName?: string };
export type JobDescription = {
  id: string;
  title: string;
  jobFamily: string;
  country: string;
  language: string;
  purpose: string;
  sourceText: string;
  responsibilities: string[];
  outcomes: string[];
  activities: string[];
  tools: string[];
  qualifications: string[];
  context: string[];
  constraints: string[];
  evidenceSegments: JobEvidenceSegment[];
  sourceFiles: JobSourceFile[];
  intakeFindings: JobIntakeFinding[];
  intakeIdempotencyKey?: string;
  status: "draft" | "analysed" | "mapped" | "approved" | "archived";
  version: number;
  updatedAt: string;
};

export type MappingScoreBreakdown = {
  semanticRelevance: number;
  directEvidenceStrength: number;
  responsibilityCoverage: number;
  outcomeRelevance: number;
  taxonomyCompatibility: number;
  granularityCompatibility: number;
  kflaCompatibility: number;
  controlledToolRelevance: number;
  proficiencyCompatibility: number;
  approvedMappingSimilarity: number;
  duplicatePenalty: number;
  contradictionPenalty: number;
  missingEvidencePenalty: number;
};

export type JobSkillMapping = {
  id: string;
  jobDescriptionId: string;
  skillId: string;
  targetLevel: 1 | 2 | 3 | 4;
  weight: number;
  critical: boolean;
  relevance: number;
  confidence?: number;
  rationale: string;
  evidence: string[];
  evidenceRefs?: string[];
  kflaCompetencyIds?: string[];
  strategicVectorIds: string[];
  source: "agent" | "manual";
  status: "proposed" | "approved" | "rejected" | "deferred";
  scoreBreakdown?: MappingScoreBreakdown;
  scoreVersion?: string;
  toolIds?: string[];
  overrideReason?: string;
  reviewerFeedback?: string;
  evidenceCompleteness?: number;
  agentRunId?: string;
  governance?: GovernanceMeta;
};

export type MappingOmission = {
  id: string;
  jobDescriptionId: string;
  skillId: string;
  reason: string;
  evidenceRefs: string[];
  score?: number;
  status: "explained" | "challenged" | "superseded";
  agentRunId: string;
};

export type MappingFeedback = {
  id: string;
  mappingId: string;
  decision: "confirmed" | "adjusted" | "rejected" | "needs_evidence";
  reviewer: string;
  reason: string;
  recordedAt: string;
  confidenceBefore: number;
  confidenceAfter?: number;
  evidenceCompleteness: number;
  frameworkVersion: string;
  rulesVersion: string;
  scoreVersion: string;
};

export type StrategicVector = {
  id: string;
  name: string;
  description: string;
  horizon: string;
  priority: "foundational" | "accelerate" | "differentiate";
  skillIds: string[];
  status: Lifecycle;
};

export type AgentToolInvocation = {
  toolId: string;
  toolVersion: string;
  inputRef: string;
  outputRef?: string;
  durationMs: number;
  result: "success" | "error" | "denied";
  errorCode?: string;
  retryCount: number;
  rulesVersion: string;
  frameworkVersion: string;
  actingUser: string;
  correlationId: string;
};

export type AgentRun = {
  id: string;
  mode: "ingest" | "interview" | "job_mapping" | "regression" | "elicitation";
  status: "running" | "completed" | "needs_review" | "failed";
  jobDescriptionId?: string;
  startedAt: string;
  completedAt?: string;
  model: string;
  tools: string[];
  trace: Array<{ step: string; result: string }>;
  invocations?: AgentToolInvocation[];
  policyVersion?: string;
  promptVersion?: string;
  idempotencyKey?: string;
  retryOfRunId?: string;
  attempt?: number;
  error?: { code: string; message: string; retryable: boolean };
};

export type Interview = {
  id: string;
  roleTitle: string;
  stakeholder: "Incumbent" | "Manager" | "SME" | "HR";
  interviewee: string;
  status: "not_started" | "in_progress" | "complete";
  currentQuestion: number;
  responses: Array<{ question: string; answer: string }>;
};

export type JobClarificationDimension = "outcomes" | "critical_incident" | "autonomy" | "complexity" | "performance_level";
export type JobClarificationQuestion = { id: string; dimension: JobClarificationDimension; question: string; rationale: string; answer?: string; evidenceRecordId?: string; status: "open" | "answered" | "skipped" };
export type JobClarificationSession = {
  id: string;
  jobDescriptionId: string;
  status: "draft" | "in_progress" | "complete";
  currentQuestion: number;
  questions: JobClarificationQuestion[];
  startedAt: string;
  updatedAt: string;
  idempotencyKey: string;
};

export type ReviewItem = {
  id: string;
  title: string;
  type: "new_skill" | "duplicate" | "mapping" | "profile" | "taxonomy_change" | "tool_association";
  summary: string;
  confidence: number;
  evidence: string;
  explanation?: string;
  rulesVersion?: string;
  frameworkVersion?: string;
  status: ReviewStatus;
  entityId?: string;
  mergeTargetId?: string;
  decisionBy?: string;
  decisionAt?: string;
  decisionReason?: string;
  payload?: Record<string, unknown>;
};

export type ValidationRule = {
  id: string;
  name: string;
  description: string;
  severity: "info" | "warning" | "error";
  affectedField: string;
  suggestedCorrection: string;
  blocking: boolean;
  frameworkVersion: string;
  status: Lifecycle;
};

export type ValidationFinding = {
  id: string;
  ruleId: string;
  severity: ValidationRule["severity"];
  explanation: string;
  entityType: string;
  entityId: string;
  affectedField: string;
  suggestedCorrection: string;
  blocking: boolean;
  frameworkVersion: string;
  evidenceReference?: string;
};

export type SourceRecord = {
  id: string;
  title: string;
  sourceType: "job_description" | "interview" | "workshop" | "public_research" | "internal_document" | "licensed_reference";
  sourceClassification: SourceClassification;
  licenceStatus: "public" | "internally_authored" | "licensed_restricted";
  sourceVersion: string;
  reviewDate: string;
  contentOwner: string;
  uri?: string;
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type EvidenceRecord = {
  id: string;
  sourceId: string;
  summary: string;
  location: string;
  dataClassification: DataClassification;
  supportedEntityIds: string[];
  confidence: number;
  status: Lifecycle;
  governance?: GovernanceMeta;
};

export type FrameworkConfig = {
  version: string;
  rulesVersion: string;
  promptVersion: string;
  canonicalLanguage: string;
  supportedLanguages: string[];
  mappingScoreVersion: string;
  mappingWeights: Record<keyof MappingScoreBreakdown, number>;
  approvalRoles: string[];
};

export type ElicitationSession = {
  id: string;
  title: string;
  status: "draft" | "in_progress" | "submitted" | "completed";
  currentStep: number;
  updatedAt: string;
  fields: {
    capability: string;
    activities: string;
    outcomes: string;
    knowledge: string;
    tools: string;
    context: string;
    constraints: string;
    granularity: "atomic" | "composite" | "umbrella";
    synonyms: string;
    kflaCompetencyIds: string[];
    proficiencyIndicators: string;
  };
};

export type ObjectVersion = {
  id: string;
  entityType: string;
  entityId: string;
  version: number;
  recordedAt: string;
  recordedBy: string;
  action: string;
  snapshot: Record<string, unknown>;
};

export type SkillWorkspace = {
  schemaVersion: 3;
  revision: number;
  updatedAt: string;
  domains: TaxonomyNode[];
  groups: Array<TaxonomyNode & { domainId: string }>;
  relationships: TaxonomyRelationship[];
  skills: Skill[];
  profiles: RoleProfile[];
  interviews: Interview[];
  jobClarifications: JobClarificationSession[];
  elicitationSessions: ElicitationSession[];
  reviewQueue: ReviewItem[];
  kflaFactors: KflaFactor[];
  kflaClusters: KflaCluster[];
  kfla: KflaCompetency[];
  jobDescriptions: JobDescription[];
  mappings: JobSkillMapping[];
  mappingOmissions: MappingOmission[];
  mappingFeedback: MappingFeedback[];
  strategicVectors: StrategicVector[];
  agentRuns: AgentRun[];
  tools: ControlledTool[];
  agentTools: AgentToolDefinition[];
  validationRules: ValidationRule[];
  proficiencyDefinitions: ProficiencyDefinition[];
  sources: SourceRecord[];
  evidenceRecords: EvidenceRecord[];
  localizedLabels: LocalizedConceptLabel[];
  auditLog: AuditEvent[];
  objectVersions: ObjectVersion[];
  releaseHistory: ReleaseManifest[];
  framework: FrameworkConfig;
  publication: Publication;
};

function arrayOr<T>(value: T[] | undefined, fallback: T[]): T[] {
  return Array.isArray(value) ? value : fallback;
}

export function migrateSkillWorkspace(value: unknown, fallback: SkillWorkspace): SkillWorkspace {
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<SkillWorkspace> & { schemaVersion?: number };
  return {
    ...fallback,
    ...source,
    schemaVersion: 3,
    domains: arrayOr(source.domains, fallback.domains),
    groups: arrayOr(source.groups, fallback.groups),
    relationships: arrayOr(source.relationships, fallback.relationships),
    skills: arrayOr(source.skills, fallback.skills),
    profiles: arrayOr(source.profiles, fallback.profiles),
    interviews: arrayOr(source.interviews, fallback.interviews),
    jobClarifications: arrayOr(source.jobClarifications, fallback.jobClarifications),
    elicitationSessions: arrayOr(source.elicitationSessions, fallback.elicitationSessions),
    reviewQueue: arrayOr(source.reviewQueue, fallback.reviewQueue),
    kflaFactors: arrayOr(source.kflaFactors, fallback.kflaFactors).map((item) => ({ ...fallback.kflaFactors.find((candidate) => candidate.id === item.id), ...item } as KflaFactor)),
    kflaClusters: arrayOr(source.kflaClusters, fallback.kflaClusters).map((item) => ({ ...fallback.kflaClusters.find((candidate) => candidate.id === item.id), ...item } as KflaCluster)),
    jobDescriptions: arrayOr(source.jobDescriptions, fallback.jobDescriptions).map((job) => {
      const baseline = fallback.jobDescriptions.find((candidate) => candidate.id === job.id);
      return {
        ...baseline,
        ...job,
        activities: arrayOr(job.activities, baseline?.activities || []),
        tools: arrayOr(job.tools, baseline?.tools || []),
        qualifications: arrayOr(job.qualifications, baseline?.qualifications || []),
        context: arrayOr(job.context, baseline?.context || []),
        constraints: arrayOr(job.constraints, baseline?.constraints || []),
        evidenceSegments: arrayOr(job.evidenceSegments, baseline?.evidenceSegments || []),
        sourceFiles: arrayOr(job.sourceFiles, baseline?.sourceFiles || []),
        intakeFindings: arrayOr(job.intakeFindings, baseline?.intakeFindings || []),
      };
    }),
    mappings: arrayOr(source.mappings, fallback.mappings).map((mapping) => ({
      ...fallback.mappings.find((candidate) => candidate.id === mapping.id),
      ...mapping,
      scoreBreakdown: mapping.scoreBreakdown && "evidence" in mapping.scoreBreakdown
        ? legacyScoreBreakdown(mapping.scoreBreakdown as unknown as Record<string, number>)
        : mapping.scoreBreakdown,
    })),
    mappingOmissions: arrayOr(source.mappingOmissions, fallback.mappingOmissions),
    mappingFeedback: arrayOr(source.mappingFeedback, fallback.mappingFeedback),
    strategicVectors: arrayOr(source.strategicVectors, fallback.strategicVectors),
    agentRuns: arrayOr(source.agentRuns, fallback.agentRuns),
    tools: arrayOr(source.tools, fallback.tools),
    agentTools: arrayOr(source.agentTools, fallback.agentTools),
    validationRules: arrayOr(source.validationRules, fallback.validationRules),
    proficiencyDefinitions: arrayOr(source.proficiencyDefinitions, fallback.proficiencyDefinitions),
    sources: arrayOr(source.sources, fallback.sources),
    evidenceRecords: arrayOr(source.evidenceRecords, fallback.evidenceRecords),
    localizedLabels: arrayOr(source.localizedLabels, fallback.localizedLabels),
    auditLog: arrayOr(source.auditLog, fallback.auditLog),
    objectVersions: arrayOr(source.objectVersions, fallback.objectVersions),
    releaseHistory: arrayOr(source.releaseHistory, fallback.releaseHistory),
    framework: source.framework || fallback.framework,
    publication: source.publication || fallback.publication,
    kfla: arrayOr(source.kfla, fallback.kfla).map((item) => {
      const baseline = fallback.kfla.find((candidate) => candidate.id === item.id);
      return { ...baseline, ...item } as KflaCompetency;
    }),
  };
}

function legacyScoreBreakdown(value: Record<string, number>): MappingScoreBreakdown {
  return {
    semanticRelevance: value.taxonomy || 0,
    directEvidenceStrength: value.evidence || 0,
    responsibilityCoverage: value.evidence || 0,
    outcomeRelevance: value.strategic || 0,
    taxonomyCompatibility: value.taxonomy || 0,
    granularityCompatibility: value.taxonomy || 0,
    kflaCompatibility: value.strategic || 0,
    controlledToolRelevance: value.strategic || 0,
    proficiencyCompatibility: value.proficiency || 0,
    approvedMappingSimilarity: value.taxonomy || 0,
    duplicatePenalty: 0,
    contradictionPenalty: 0,
    missingEvidencePenalty: value.evidence ? 0 : 100,
  };
}

export function skillQuality(skill: Skill, workspace: SkillWorkspace) {
  const duplicate = workspace.skills.some((item) => item.id !== skill.id && item.status !== "retired" && item.status !== "archived" && (item.name.toLowerCase() === skill.name.toLowerCase() || item.aliases.some((alias) => alias.toLowerCase() === skill.name.toLowerCase())));
  const checks = {
    syntax: Boolean(skill.syntax?.action && skill.syntax.object),
    observable: skill.observability.trim().length >= 20,
    definition: skill.description.trim().length >= 25,
    taxonomy: workspace.groups.some((group) => group.id === skill.groupId && group.status !== "retired" && group.status !== "archived"),
    unique: !duplicate,
    evidence: skill.evidence.length > 0,
  };
  return { checks, score: Math.round(Object.values(checks).filter(Boolean).length / Object.keys(checks).length * 100) };
}

export function validateWorkspace(workspace: SkillWorkspace): ValidationFinding[] {
  const findings: ValidationFinding[] = [];
  const add = (ruleId: string, entityType: string, entityId: string, explanation: string, affectedField: string, suggestedCorrection: string, blocking = true, evidenceReference?: string) => {
    const rule = workspace.validationRules.find((candidate) => candidate.id === ruleId);
    findings.push({
      id: `FND-${ruleId}-${entityId}`,
      ruleId,
      severity: rule?.severity || (blocking ? "error" : "warning"),
      explanation,
      entityType,
      entityId,
      affectedField,
      suggestedCorrection,
      blocking: rule?.blocking ?? blocking,
      frameworkVersion: rule?.frameworkVersion || workspace.framework.version,
      evidenceReference,
    });
  };
  const names = new Map<string, string>();
  for (const skill of workspace.skills.filter((item) => !["retired", "archived"].includes(item.status))) {
    const key = skill.name.trim().toLowerCase();
    if (names.has(key)) add("SKILL-UNIQUE-001", "skill", skill.id, `Canonical name duplicates ${names.get(key)}.`, "name", "Merge the records or define one as an alias.");
    names.set(key, skill.id);
    if (!skill.syntax?.action || !skill.syntax.object) add("SKILL-SYNTAX-001", "skill", skill.id, "Action + object syntax is incomplete.", "syntax", "Add one observable action and one enduring object.");
    if (skill.observability.trim().length < 20) add("SKILL-EVIDENCE-001", "skill", skill.id, "Observable outcome evidence is missing or too short.", "observability", "Describe evidence a reviewer can observe in real work.");
    if (!skill.evidence.length) add("SKILL-EVIDENCE-002", "skill", skill.id, "No source evidence is linked.", "evidence", "Attach a source excerpt and location.");
  }
  for (const group of workspace.groups.filter((item) => !["retired", "archived"].includes(item.status))) {
    if (!workspace.domains.some((domain) => domain.id === group.domainId && !["retired", "archived"].includes(domain.status))) add("TAXONOMY-PARENT-001", "group", group.id, "Parent domain is unavailable.", "domainId", "Move the group to an active domain.");
  }
  const relationshipKeys = new Set<string>();
  for (const relationship of workspace.relationships.filter((item) => !["retired", "archived"].includes(item.status))) {
    const key = `${relationship.sourceId}:${relationship.type}:${relationship.targetId}`;
    const endpointsValid = relationship.sourceId !== relationship.targetId && [relationship.sourceId, relationship.targetId].every((id) => workspace.skills.some((skill) => skill.id === id && !["retired", "archived"].includes(skill.status)));
    if (!endpointsValid || !relationship.rationale.trim() || relationshipKeys.has(key)) add("RELATIONSHIP-INTEGRITY-001", "relationship", relationship.id, "Active relationships require two distinct active skills, a rationale and a unique source/type/target tuple.", "sourceId", "Select distinct active concepts, add rationale and remove duplicate graph edges.");
    relationshipKeys.add(key);
  }
  for (const mapping of workspace.mappings.filter((item) => item.status !== "rejected" && item.status !== "deferred")) {
    if (!mapping.evidence.length || !mapping.rationale.trim()) add("MAPPING-EVIDENCE-001", "mapping", mapping.id, "Mapping evidence or rationale is missing.", "evidence", "Add a source excerpt and explain the relationship.");
    if (!workspace.skills.some((skill) => skill.id === mapping.skillId && skill.status === "approved")) add("MAPPING-CATALOG-001", "mapping", mapping.id, "Mapping is not grounded in an approved skill.", "skillId", "Select an approved catalog skill or route the skill proposal for approval.");
    if (mapping.overrideReason === "") add("MAPPING-OVERRIDE-001", "mapping", mapping.id, "A reviewer override requires a reason.", "overrideReason", "Record the evidence-based override rationale.");
    const job = workspace.jobDescriptions.find((candidate) => candidate.id === mapping.jobDescriptionId);
    const evidenceIds = new Set([...(job?.evidenceSegments || []).map((segment) => segment.id), ...workspace.evidenceRecords.map((record) => record.id)]);
    if (mapping.source === "agent" && (!mapping.evidenceRefs?.length || mapping.evidenceRefs.some((id) => !evidenceIds.has(id)))) add("MAPPING-EVIDENCE-REF-001", "mapping", mapping.id, "Agent mapping does not resolve to direct governed job evidence.", "evidenceRefs", "Link at least one source segment or clarification evidence record from the selected job description.");
    const scoreKeys: Array<keyof MappingScoreBreakdown> = ["semanticRelevance", "directEvidenceStrength", "responsibilityCoverage", "outcomeRelevance", "taxonomyCompatibility", "granularityCompatibility", "kflaCompatibility", "controlledToolRelevance", "proficiencyCompatibility", "approvedMappingSimilarity", "duplicatePenalty", "contradictionPenalty", "missingEvidencePenalty"];
    if (!mapping.scoreBreakdown || scoreKeys.some((key) => !Number.isFinite(mapping.scoreBreakdown?.[key]) || Number(mapping.scoreBreakdown?.[key]) < 0 || Number(mapping.scoreBreakdown?.[key]) > 100)) add("MAPPING-SCORE-001", "mapping", mapping.id, "The transparent thirteen-part mapping score is incomplete or outside 0–100.", "scoreBreakdown", "Provide all ten positive dimensions and three penalties within the governed range.");
  }
  for (const job of workspace.jobDescriptions.filter((item) => ["analysed", "mapped", "approved"].includes(item.status))) {
    if (!job.evidenceSegments.length) add("JOB-EVIDENCE-001", "job_description", job.id, "Analysed job description has no traceable source segments.", "evidenceSegments", "Re-run governed intake and retain source, section, location and quotation for each normalized statement.");
    if (job.intakeFindings.some((finding) => finding.severity === "error")) add("JOB-INTAKE-QUALITY-001", "job_description", job.id, "Job intake contains unresolved blocking quality findings.", "intakeFindings", "Correct unsupported or low-quality source material before mapping.");
  }
  for (const omission of workspace.mappingOmissions.filter((item) => item.status !== "superseded")) {
    const job = workspace.jobDescriptions.find((candidate) => candidate.id === omission.jobDescriptionId);
    const evidenceIds = new Set([...(job?.evidenceSegments || []).map((segment) => segment.id), ...workspace.evidenceRecords.map((record) => record.id)]);
    if (!job || !workspace.skills.some((skill) => skill.id === omission.skillId && skill.status === "approved") || !omission.reason.trim() || omission.evidenceRefs.some((id) => !evidenceIds.has(id))) add("MAPPING-OMISSION-001", "mapping_omission", omission.id, "Omitted candidate requires an approved skill, explanation and traceable evidence.", "evidenceRefs", "Repair the omission explanation or mark it superseded.");
  }
  for (const session of workspace.jobClarifications) {
    if (!workspace.jobDescriptions.some((job) => job.id === session.jobDescriptionId) || !session.idempotencyKey.trim() || session.questions.some((question) => question.status === "answered" && (!question.answer?.trim() || !question.evidenceRecordId || !workspace.evidenceRecords.some((record) => record.id === question.evidenceRecordId)))) add("JOB-CLARIFICATION-001", "job_clarification", session.id, "Clarification answers require a job, idempotency key and governed evidence record.", "questions", "Persist each answer as an evidence record before completing the clarification.");
  }
  for (const feedback of workspace.mappingFeedback) {
    if (!workspace.mappings.some((mapping) => mapping.id === feedback.mappingId) || !feedback.reviewer.trim() || !feedback.reason.trim() || feedback.evidenceCompleteness < 0 || feedback.evidenceCompleteness > 100) add("MAPPING-FEEDBACK-001", "mapping_feedback", feedback.id, "Mapping feedback requires an existing mapping, accountable reviewer, reason and evidence completeness between 0 and 100.", "mappingId", "Link an existing mapping and complete the accountable feedback record.");
  }
  for (const profile of workspace.profiles.filter((item) => !["archived", "retired"].includes(item.status))) {
    const skillIds = profile.skills.map((link) => link.skillId);
    if (new Set(skillIds).size !== skillIds.length || profile.skills.some((link) => !workspace.skills.some((skill) => skill.id === link.skillId && !["archived", "retired"].includes(skill.status)))) add("PROFILE-INTEGRITY-001", "role_profile", profile.id, "Role profile contains a duplicate or unavailable skill link.", "skills", "Remove duplicate links and select active governed skills only.");
    if (profile.status === "approved" && (!profile.jobDescriptionId || !workspace.jobDescriptions.some((job) => job.id === profile.jobDescriptionId && job.status !== "archived"))) add("PROFILE-SOURCE-001", "role_profile", profile.id, "Approved role profile is not grounded in an active job description.", "jobDescriptionId", "Link the profile to its governed source job description before release.");
  }
  for (const tool of workspace.tools.filter((item) => !["archived", "retired"].includes(item.status))) {
    if (new Set(tool.skillIds).size !== tool.skillIds.length || tool.skillIds.some((id) => !workspace.skills.some((skill) => skill.id === id && !["archived", "retired"].includes(skill.status)))) add("CONTROLLED-TOOL-INTEGRITY-001", "controlled_tool", tool.id, "Controlled tool contains a duplicate or unavailable skill link.", "skillIds", "Retain unique links to active governed skills only.");
  }
  const agentToolIds = new Set<string>();
  for (const tool of workspace.agentTools) {
    const completeSchema = (schema: JsonSchemaShape) => schema?.type === "object" && Boolean(schema.properties) && Object.keys(schema.properties).length > 0 && (schema.required || []).every((field) => Boolean(schema.properties[field]));
    const contractComplete = completeSchema(tool.inputSchema)
      && completeSchema(tool.outputSchema)
      && /^skill\./.test(tool.requiredPermission)
      && tool.allowedDataClassifications.length > 0
      && !tool.allowedDataClassifications.includes("licensed")
      && tool.timeoutMs > 0
      && tool.retryPolicy.maxAttempts > 0
      && tool.retryPolicy.backoffMs >= 0
      && tool.retryPolicy.retryableErrors.length > 0
      && tool.rateLimit.requests > 0
      && tool.rateLimit.windowSeconds > 0
      && tool.errorContract.codes.length > 0
      && tool.errorContract.redactInputs
      && ["correlationId", "actingUser", "durationMs", "result"].every((field) => tool.auditRequirements.includes(field))
      && /^\d+\.\d+\.\d+$/.test(tool.version)
      && Boolean(tool.owner.trim())
      && tool.allowedAgentActions.length > 0;
    if (agentToolIds.has(tool.id) || !contractComplete) add("AGENT-REGISTRY-001", "agent_tool", tool.id, "Agent-tool identity or callable contract is incomplete.", "contract", "Provide a unique stable ID, complete schemas, permission, data boundary, runtime policies, error contract, audit fields, semantic version, owner and allowed actions.");
    if (tool.replacementToolId && !workspace.agentTools.some((candidate) => candidate.id === tool.replacementToolId && candidate.id !== tool.id)) add("AGENT-REGISTRY-001", "agent_tool", tool.id, "Replacement tool does not resolve to another registry entry.", "replacementToolId", "Select an existing successor tool or remove the replacement reference.");
    agentToolIds.add(tool.id);
  }
  const missingRequiredTools = requiredAgentToolIds.filter((id) => !workspace.agentTools.some((tool) => tool.id === id && tool.lifecycleStatus === "active"));
  if (missingRequiredTools.length) add("AGENT-REGISTRY-001", "workspace", "AGENT-REGISTRY", `Required active tools are missing: ${missingRequiredTools.join(", ")}.`, "agentTools", "Restore and approve all eleven canonical allowlisted tool implementations before release.");
  for (const mapping of workspace.mappings.filter((item) => item.status !== "rejected" && item.status !== "deferred")) {
    const toolIds = mapping.toolIds || [];
    if (new Set(toolIds).size !== toolIds.length || toolIds.some((id) => !workspace.tools.some((tool) => tool.id === id && !["archived", "retired"].includes(tool.status)))) add("MAPPING-TOOL-001", "mapping", mapping.id, "Mapping contains a duplicate or unavailable controlled-tool reference.", "toolIds", "Select unique active controlled tools or remove obsolete references.");
  }
  if (workspace.kflaFactors.length !== 4 || workspace.kflaFactors.some((item) => item.status !== "approved")) add("KFLA-HIERARCHY-001", "workspace", "KFLA", "KFLA must contain exactly four approved factors.", "kflaFactors", "Restore and approve the canonical four-factor public metadata layer.");
  if (workspace.kflaClusters.length !== 12 || workspace.kflaClusters.some((item) => item.status !== "approved" || !workspace.kflaFactors.some((factor) => factor.id === item.factorId && factor.status === "approved"))) add("KFLA-HIERARCHY-002", "workspace", "KFLA", "KFLA must contain exactly twelve approved clusters with approved factors.", "kflaClusters", "Restore and approve twelve governed navigation clusters and their factor assignments.");
  if (workspace.kfla.length !== 38 || workspace.kfla.some((item) => !item.enabled || !workspace.kflaClusters.some((cluster) => cluster.id === item.clusterId && cluster.factorId === item.factorId && cluster.status === "approved"))) add("KFLA-HIERARCHY-003", "workspace", "KFLA", "All 38 enabled competencies must resolve to an approved cluster and matching factor.", "kfla", "Restore missing competencies or approve corrected cluster relationships.");
  const kflaMetadata = [...workspace.kflaFactors, ...workspace.kflaClusters, ...workspace.kfla];
  if (kflaMetadata.some((item) => !item.sourceClassification || !("licenceStatus" in item) || !item.licenceStatus || !("sourceVersion" in item) || !item.sourceVersion || !("reviewDate" in item) || !item.reviewDate || !("contentOwner" in item) || !item.contentOwner)) add("KFLA-METADATA-001", "workspace", "KFLA", "KFLA governance metadata is incomplete.", "metadata", "Complete source classification, licence status, source version, review date and content owner.");
  if (workspace.proficiencyDefinitions.length !== 4 || new Set(workspace.proficiencyDefinitions.map((item) => item.id)).size !== 4 || workspace.proficiencyDefinitions.some((item) => !item.behavioralIndicators.length)) add("PROFICIENCY-INTEGRITY-001", "workspace", "PROFICIENCY", "The governed four-level proficiency model is incomplete.", "proficiencyDefinitions", "Restore levels one through four with observable behavioral indicators.");
  for (const evidence of workspace.evidenceRecords.filter((item) => !["archived", "retired"].includes(item.status))) {
    if (!workspace.sources.some((source) => source.id === evidence.sourceId && !["archived", "retired"].includes(source.status))) add("EVIDENCE-SOURCE-001", "evidence", evidence.id, "Evidence does not resolve to an active governed source.", "sourceId", "Select an active governed source or restore the referenced source.", true, evidence.location);
  }
  const localizedKeys = new Set<string>();
  const conceptExists = (entityType: LocalizedConceptLabel["entityType"], entityId: string) => {
    if (entityType === "domain") return workspace.domains.some((item) => item.id === entityId);
    if (entityType === "group") return workspace.groups.some((item) => item.id === entityId);
    if (entityType === "skill") return workspace.skills.some((item) => item.id === entityId);
    if (entityType === "kfla_factor") return workspace.kflaFactors.some((item) => item.id === entityId);
    if (entityType === "kfla_cluster") return workspace.kflaClusters.some((item) => item.id === entityId);
    if (entityType === "kfla_competency") return workspace.kfla.some((item) => item.id === entityId);
    return workspace.tools.some((item) => item.id === entityId);
  };
  for (const localized of workspace.localizedLabels.filter((item) => !["archived", "retired"].includes(item.status))) {
    const key = `${localized.entityType}:${localized.entityId}:${localized.language.toLowerCase()}`;
    if (!conceptExists(localized.entityType, localized.entityId)) add("MULTILINGUAL-REFERENCE-001", "localized_label", localized.id, "Localized label does not resolve to a canonical concept.", "entityId", "Select an existing canonical concept or archive this label.");
    if (!workspace.framework.supportedLanguages.includes(localized.language)) add("MULTILINGUAL-LANGUAGE-001", "localized_label", localized.id, `Language ${localized.language} is not enabled by the framework.`, "language", "Enable the language in framework configuration or choose a supported language.");
    if (localizedKeys.has(key)) add("MULTILINGUAL-UNIQUE-001", "localized_label", localized.id, "A concept may have only one active label per language.", "language", "Merge the localized records or archive the duplicate.");
    if (!localized.label.trim()) add("MULTILINGUAL-LABEL-001", "localized_label", localized.id, "Localized label is empty.", "label", "Provide a concise label in the selected language.");
    localizedKeys.add(key);
  }
  return findings;
}

export function workspaceFindings(workspace: SkillWorkspace) {
  return validateWorkspace(workspace).filter((finding) => finding.blocking).map((finding) => `${finding.entityId}: ${finding.explanation}`);
}

export function profileGuidance(profile: RoleProfile, skills: Skill[]) {
  const mapped = profile.skills.map((item) => skills.find((skill) => skill.id === item.skillId)).filter(Boolean) as Skill[];
  const technical = mapped.filter((skill) => skill.dimension === "technical").length;
  const behavioral = mapped.filter((skill) => skill.dimension === "competency").length;
  const human = mapped.filter((skill) => skill.dimension === "trait" || skill.dimension === "driver").length;
  return {
    count: profile.skills.length,
    validCount: profile.skills.length >= 8 && profile.skills.length <= 12,
    composition: `${technical} technical · ${behavioral} behavioral · ${human} traits/drivers`,
    suggested: technical >= 5 && technical <= 6 && behavioral >= 3 && behavioral <= 4 && human >= 1 && human <= 2,
  };
}
