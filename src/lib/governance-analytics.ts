import type { AuditEvent, ObjectVersion, SkillWorkspace, ValidationFinding } from "./skill-schema";

export type VersionFieldDiff = { field: string; before: unknown; after: unknown; changed: boolean };

function stable(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map((item) => JSON.parse(stable(item))));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return JSON.stringify(Object.fromEntries(Object.keys(record).sort().map((key) => [key, JSON.parse(stable(record[key]))])));
  }
  return JSON.stringify(value ?? null);
}

export function compareObjectVersions(left?: ObjectVersion, right?: ObjectVersion): VersionFieldDiff[] {
  if (!left || !right) return [];
  const fields = [...new Set([...Object.keys(left.snapshot), ...Object.keys(right.snapshot)])].sort();
  return fields.map((field) => ({
    field,
    before: left.snapshot[field],
    after: right.snapshot[field],
    changed: stable(left.snapshot[field]) !== stable(right.snapshot[field]),
  }));
}

export function filterAuditEvents(events: AuditEvent[], query: string, action = "all", actor = "all") {
  const term = query.trim().toLowerCase();
  return events.filter((event) => {
    const matchesAction = action === "all" || event.action === action;
    const identity = event.actorId || event.actor;
    const matchesActor = actor === "all" || identity === actor;
    const haystack = [event.id, event.action, event.entityType, event.entityId, event.summary, identity, event.correlationId, event.frameworkVersion].filter(Boolean).join(" ").toLowerCase();
    return matchesAction && matchesActor && (!term || haystack.includes(term));
  });
}

export function taxonomyOverlapSignals(workspace: SkillWorkspace) {
  const active = workspace.skills.filter((skill) => !["archived", "retired"].includes(skill.status));
  const explicit = new Set(workspace.relationships.filter((item) => !["archived", "retired"].includes(item.status)).map((item) => [item.sourceId, item.targetId].sort().join("|")));
  const signals: Array<{ leftId: string; rightId: string; score: number; reasons: string[]; governed: boolean }> = [];
  for (let leftIndex = 0; leftIndex < active.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < active.length; rightIndex += 1) {
      const left = active[leftIndex]; const right = active[rightIndex];
      const leftTerms = new Set([left.name, ...left.aliases].map((item) => item.trim().toLowerCase()).filter(Boolean));
      const rightTerms = new Set([right.name, ...right.aliases].map((item) => item.trim().toLowerCase()).filter(Boolean));
      const sharedTerms = [...leftTerms].filter((term) => rightTerms.has(term));
      const reasons: string[] = [];
      let score = 0;
      if (sharedTerms.length) { score += 55; reasons.push(`shared term: ${sharedTerms.join(", ")}`); }
      if (left.groupId === right.groupId) { score += 15; reasons.push("same taxonomy group"); }
      if (left.kflaCompetencyId && left.kflaCompetencyId === right.kflaCompetencyId) { score += 20; reasons.push("same KFLA competency"); }
      if (left.dimension === right.dimension) { score += 10; reasons.push("same skill dimension"); }
      if (score >= 25) signals.push({ leftId: left.id, rightId: right.id, score: Math.min(100, score), reasons, governed: explicit.has([left.id, right.id].sort().join("|")) });
    }
  }
  return signals.sort((a, b) => b.score - a.score || a.leftId.localeCompare(b.leftId));
}

export function replacementChain(workspace: SkillWorkspace, skillId: string) {
  const chain: string[] = [];
  const seen = new Set<string>();
  let current = workspace.skills.find((skill) => skill.id === skillId);
  while (current && !seen.has(current.id)) {
    chain.push(current.id); seen.add(current.id);
    const relationship = workspace.relationships.find((item) => item.type === "replacement" && item.sourceId === current?.id && !["archived", "retired"].includes(item.status));
    const nextId = current.governance?.replacedById || relationship?.targetId;
    current = nextId ? workspace.skills.find((skill) => skill.id === nextId) : undefined;
  }
  return { chain, cyclic: Boolean(current), unresolved: chain.length > 0 && ["deprecated", "retired"].includes(workspace.skills.find((skill) => skill.id === chain.at(-1))?.status || "") };
}

export function compareRoleProfiles(workspace: SkillWorkspace, leftProfileId: string, rightProfileId: string) {
  const left = workspace.profiles.find((profile) => profile.id === leftProfileId);
  const right = workspace.profiles.find((profile) => profile.id === rightProfileId);
  const leftIds = new Set(left?.skills.map((item) => item.skillId) || []);
  const rightIds = new Set(right?.skills.map((item) => item.skillId) || []);
  const approved = new Set(workspace.skills.filter((skill) => skill.status === "approved").map((skill) => skill.id));
  const describe = (ids: string[]) => ids.map((id) => workspace.skills.find((skill) => skill.id === id)).filter(Boolean);
  return {
    left,
    right,
    shared: describe([...leftIds].filter((id) => rightIds.has(id))),
    leftOnly: describe([...leftIds].filter((id) => !rightIds.has(id))),
    rightOnly: describe([...rightIds].filter((id) => !leftIds.has(id))),
    leftCoverage: Math.round([...leftIds].filter((id) => approved.has(id)).length / Math.max(1, leftIds.size) * 100),
    rightCoverage: Math.round([...rightIds].filter((id) => approved.has(id)).length / Math.max(1, rightIds.size) * 100),
  };
}

export function governanceDiagnostics(workspace: SkillWorkspace, findings: ValidationFinding[]) {
  const supported = workspace.framework.supportedLanguages.filter((language) => language !== "en");
  const activeConceptIds = [
    ...workspace.domains, ...workspace.groups, ...workspace.skills,
    ...workspace.kflaFactors, ...workspace.kflaClusters, ...workspace.kfla, ...workspace.tools,
  ].filter((item) => !("status" in item) || !["archived", "retired"].includes(String(item.status))).map((item) => item.id);
  const localized = new Set(workspace.localizedLabels.filter((item) => !["archived", "retired"].includes(item.status)).map((item) => `${item.entityId}|${item.language}`));
  const possibleLabels = activeConceptIds.length * supported.length;
  const suppliedLabels = activeConceptIds.reduce((sum, id) => sum + supported.filter((language) => localized.has(`${id}|${language}`)).length, 0);
  const overlaps = taxonomyOverlapSignals(workspace);
  const replacementChains = workspace.skills.filter((skill) => ["deprecated", "retired"].includes(skill.status)).map((skill) => replacementChain(workspace, skill.id));
  return {
    recordedAt: new Date().toISOString(),
    frameworkVersion: workspace.framework.version,
    revision: workspace.revision,
    blockingFindings: findings.filter((item) => item.blocking).length,
    advisoryFindings: findings.filter((item) => !item.blocking).length,
    unresolvedOverlaps: overlaps.filter((item) => !item.governed).length,
    unresolvedReplacementChains: replacementChains.filter((item) => item.unresolved || item.cyclic).length,
    localizationCoverage: possibleLabels ? Math.round(suppliedLabels / possibleLabels * 100) : 100,
    pendingReviews: workspace.reviewQueue.filter((item) => item.status === "pending").length,
  };
}
