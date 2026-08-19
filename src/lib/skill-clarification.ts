import type {
  JobClarificationDimension,
  JobClarificationQuestion,
  JobClarificationSession,
  JobDescription,
} from "./skill-schema";

export const clarificationSufficiencyThreshold = 80;

const dimensionConfiguration: Record<JobClarificationDimension, {
  label: string;
  mappingDimensions: string[];
  question: (title: string) => string;
  rationale: string;
  patterns: RegExp[];
}> = {
  outcomes: {
    label: "Measurable outcomes",
    mappingDimensions: ["outcomeRelevance", "directEvidenceStrength", "missingEvidencePenalty"],
    question: (title) => `Which measurable outcomes prove successful ${title} performance?`,
    rationale: "The role evidence does not yet connect work to a measurable business or safety outcome.",
    patterns: [/\b(outcome|result|impact|improv|reduc|increase|target|metric|quality|safety)\w*/i],
  },
  critical_incident: {
    label: "Critical incident",
    mappingDimensions: ["semanticRelevance", "responsibilityCoverage", "granularityCompatibility"],
    question: () => "Describe a critical incident that distinguishes durable capability from routine activity.",
    rationale: "A concrete incident is needed to separate observable capability from a task or personality label.",
    patterns: [/\b(incident|failure|exception|breakdown|root cause|corrective|resolve|recover)\b/i],
  },
  autonomy: {
    label: "Decision autonomy",
    mappingDimensions: ["proficiencyCompatibility", "responsibilityCoverage", "contradictionPenalty"],
    question: () => "Which decisions may this role make independently, and which require approval or escalation?",
    rationale: "Decision rights are needed to calibrate proficiency and resolve accountability boundaries.",
    patterns: [/\b(independent|autonom|decision|authority|accountable|approve|escalat)\w*/i],
  },
  complexity: {
    label: "Complexity and ambiguity",
    mappingDimensions: ["granularityCompatibility", "kflaCompatibility", "semanticRelevance"],
    question: () => "How does the role resolve ambiguity, dependencies, competing evidence or stakeholder tension?",
    rationale: "Complexity evidence is needed to distinguish routine application from advanced capability.",
    patterns: [/\b(complex|ambigu|dependen|conflict|trade.?off|stakeholder|competing)\w*/i],
  },
  performance_level: {
    label: "Performance level",
    mappingDimensions: ["proficiencyCompatibility", "approvedMappingSimilarity", "missingEvidencePenalty"],
    question: () => "What observable evidence separates foundational, proficient and advanced performance in this role?",
    rationale: "Observable level anchors are needed before a target proficiency can be recommended.",
    patterns: [/\b(foundational|proficient|advanced|expert|coach|mentor|lead|master)\w*/i],
  },
};

const dimensionOrder = Object.keys(dimensionConfiguration) as JobClarificationDimension[];

function sourceText(job: JobDescription) {
  return [
    job.purpose,
    job.sourceText,
    ...job.responsibilities,
    ...job.outcomes,
    ...job.activities,
    ...job.context,
    ...job.constraints,
    ...job.qualifications,
  ].filter(Boolean).join("\n");
}

function excerptsFor(job: JobDescription, patterns: RegExp[]) {
  const segments = job.evidenceSegments
    .filter((segment) => patterns.some((pattern) => pattern.test(`${segment.normalizedValue} ${segment.quotation}`)))
    .slice(0, 2)
    .map((segment) => ({ evidenceId: segment.id, label: `${segment.sourceName} · ${segment.location}`, excerpt: segment.quotation || segment.normalizedValue }));
  if (segments.length) return segments;
  const sentences = sourceText(job).split(/(?<=[.!?])\s+|\n+/).map((item) => item.trim()).filter(Boolean);
  return sentences.filter((sentence) => patterns.some((pattern) => pattern.test(sentence))).slice(0, 2)
    .map((excerpt, index) => ({ label: `Job description · matched statement ${index + 1}`, excerpt }));
}

export function detectJobEvidenceContradictions(job: JobDescription) {
  const text = sourceText(job);
  const contradictions: NonNullable<JobClarificationSession["contradictions"]> = [];
  const add = (id: string, dimension: JobClarificationDimension, severity: "warning" | "critical", summary: string, statements: string[], resolutionPrompt: string) => {
    contradictions.push({ id, dimension, severity, summary, statements, resolutionPrompt, status: "open" });
  };
  if (/\b(independent|autonomous|full authority)\b/i.test(text) && /\b(requires? approval|must be approved|no authority|always escalate)\b/i.test(text)) {
    add("CONTRADICTION-AUTONOMY", "autonomy", "critical", "The source assigns both independent authority and mandatory approval without a boundary.", excerptsFor(job, [/\b(independent|autonomous|authority|approval|escalat)\w*/i]).map((item) => item.excerpt), "Define which decisions are independent and which require approval or escalation.");
  }
  if (/\b(tool|system|platform)\b.{0,35}\b(optional|preferred)\b/i.test(text) && /\b(tool|system|platform)\b.{0,35}\b(mandatory|required|must)\b/i.test(text)) {
    add("CONTRADICTION-TOOL", "performance_level", "warning", "A controlled tool appears both optional and mandatory.", excerptsFor(job, [/\b(optional|preferred|mandatory|required)\b/i]).map((item) => item.excerpt), "Clarify whether the tool is mandatory, substitutable, or only an example of the underlying skill.");
  }
  return contradictions;
}

export function assessJobClarification(job: JobDescription, session?: JobClarificationSession) {
  const answered = new Set(session?.questions.filter((item) => item.status === "answered").map((item) => item.dimension));
  const dimensionScores = Object.fromEntries(dimensionOrder.map((dimension) => {
    if (answered.has(dimension)) return [dimension, 20];
    const config = dimensionConfiguration[dimension];
    const matches = excerptsFor(job, config.patterns);
    return [dimension, matches.length >= 2 ? 16 : matches.length === 1 ? 10 : 0];
  })) as Record<JobClarificationDimension, number>;
  const contradictions = detectJobEvidenceContradictions(job).map((item) => {
    const prior = session?.contradictions?.find((candidate) => candidate.id === item.id);
    return prior ? { ...item, status: prior.status, resolution: prior.resolution, resolvedAt: prior.resolvedAt } : item;
  });
  const unresolvedCritical = contradictions.filter((item) => item.severity === "critical" && item.status === "open");
  const unresolvedWarnings = contradictions.filter((item) => item.severity === "warning" && item.status === "open");
  const rawScore = Object.values(dimensionScores).reduce((sum, value) => sum + value, 0);
  const sufficiencyScore = Math.max(0, Math.min(100, rawScore - unresolvedCritical.length * 20 - unresolvedWarnings.length * 5));
  const gaps = dimensionOrder
    .map((dimension) => ({ dimension, score: dimensionScores[dimension], config: dimensionConfiguration[dimension] }))
    .filter((item) => item.score < 20)
    .sort((left, right) => left.score - right.score || dimensionOrder.indexOf(left.dimension) - dimensionOrder.indexOf(right.dimension));
  return {
    sufficiencyScore,
    sufficiencyThreshold: clarificationSufficiencyThreshold,
    dimensionScores,
    contradictions,
    unresolvedCritical,
    unresolvedWarnings,
    canMap: sufficiencyScore >= clarificationSufficiencyThreshold && unresolvedCritical.length === 0,
    gaps,
  };
}

export function nextEvidenceGroundedQuestion(job: JobDescription, session?: JobClarificationSession, force = false): JobClarificationQuestion | undefined {
  const assessment = assessJobClarification(job, session);
  const existingSignatures = new Set((session?.questions || []).map((item) => `${item.dimension}:${item.gapType || "missing"}`));
  const contradiction = assessment.contradictions.find((item) => item.status === "open" && !existingSignatures.has(`${item.dimension}:contradictory`));
  if (contradiction) {
    return {
      id: `CLAR-${job.id}-Q${(session?.questions.length || 0) + 1}`,
      dimension: contradiction.dimension,
      question: contradiction.resolutionPrompt,
      rationale: contradiction.summary,
      affectedMappingDimensions: dimensionConfiguration[contradiction.dimension].mappingDimensions,
      sourceExcerpts: contradiction.statements.map((excerpt, index) => ({ label: `Conflicting source statement ${index + 1}`, excerpt })),
      gapType: "contradictory",
      priority: contradiction.severity === "critical" ? "critical" : "high",
      blocking: contradiction.severity === "critical",
      contradictionId: contradiction.id,
      status: "open",
    };
  }
  if (!force && assessment.canMap) return undefined;
  const candidates = assessment.gaps.length || !force ? assessment.gaps : dimensionOrder.map((dimension) => ({ dimension, score: assessment.dimensionScores[dimension], config: dimensionConfiguration[dimension] }));
  const gap = candidates.find((item) => !existingSignatures.has(`${item.dimension}:${item.score ? "weak" : "missing"}`));
  if (!gap) return undefined;
  return {
    id: `CLAR-${job.id}-Q${(session?.questions.length || 0) + 1}`,
    dimension: gap.dimension,
    question: gap.config.question(job.title || "role"),
    rationale: gap.config.rationale,
    affectedMappingDimensions: gap.config.mappingDimensions,
    sourceExcerpts: excerptsFor(job, gap.config.patterns),
    gapType: gap.score ? "weak" : "missing",
    priority: gap.score ? "medium" : "high",
    blocking: false,
    status: "open",
  };
}
