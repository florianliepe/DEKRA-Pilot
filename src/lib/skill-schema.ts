export const proficiencyLevels = [
  { id: 1, name: "Awareness", description: "Understands the concept and works with direct guidance." },
  { id: 2, name: "Application", description: "Performs standard work independently in routine situations." },
  { id: 3, name: "Mastery", description: "Solves complex, non-routine problems and coaches others." },
  { id: 4, name: "Strategic / Expert", description: "Shapes strategy and pioneers new methods." },
] as const;

export type SkillDimension = "technical" | "competency" | "experience" | "trait" | "driver";
export type Lifecycle = "draft" | "in_review" | "approved" | "retired";

export type TaxonomyNode = { id: string; name: string; description: string; status: Lifecycle };
export type KflaCompetency = {
  id: string;
  number: number;
  name: string;
  factor: "Thought" | "Results" | "People" | "Self";
  enabled: boolean;
  definition: string;
  source: "public-name" | "licensed" | "custom";
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
};
export type ProfileSkill = { skillId: string; targetLevel: 1 | 2 | 3 | 4; weight: number; critical: boolean };
export type RoleProfile = { id: string; title: string; jobFamily: string; purpose: string; status: Lifecycle; skills: ProfileSkill[] };
export type Interview = {
  id: string;
  roleTitle: string;
  stakeholder: "Incumbent" | "Manager" | "SME" | "HR";
  interviewee: string;
  status: "not_started" | "in_progress" | "complete";
  currentQuestion: number;
  responses: Array<{ question: string; answer: string }>;
};
export type ReviewItem = {
  id: string;
  title: string;
  type: "new_skill" | "duplicate" | "mapping" | "profile";
  summary: string;
  confidence: number;
  evidence: string;
  status: "pending" | "accepted" | "rejected";
};
export type SkillWorkspace = {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  domains: TaxonomyNode[];
  groups: Array<TaxonomyNode & { domainId: string }>;
  skills: Skill[];
  profiles: RoleProfile[];
  interviews: Interview[];
  reviewQueue: ReviewItem[];
  kfla: KflaCompetency[];
};

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
