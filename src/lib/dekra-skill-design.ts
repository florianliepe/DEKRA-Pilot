import type { Skill } from "@/lib/skill-schema";

// Exact name matches in the DEKRA Leadership Standards supplied for the pilot.
// This is a crosswalk, not a claim about licensed Korn Ferry definitions.
export const dekraLeadershipStandards: Record<string, string> = {
  "KFLA-06": "Collaborates",
  "KFLA-11": "Customer focus",
  "KFLA-13": "Develops talent",
  "KFLA-16": "Drives engagement",
  "KFLA-28": "Drives results",
  "KFLA-29": "Demonstrates self-awareness",
};

export const dekraCoreCompetencyThemes = [
  "Collaboration",
  "Customer centricity",
  "Results focus",
  "Change agility",
  "Innovation & digitalization",
] as const;

export const dekraDesignPrinciples = [
  { id: "P1", name: "Strategic alignment", question: "Which documented DEKRA priority or business outcome makes this capability important?" },
  { id: "P2", name: "Ability to act", question: "Which observable role outcome would fail without this capability?" },
  { id: "P3", name: "Universal technology fluency", question: "What practical technology use and learning is evidenced in this role?" },
  { id: "P4", name: "Common language", question: "Is this a reusable approved concept, or a governed catalogue gap?" },
  { id: "P5", name: "Continuous learning", question: "Can reviewers see current and next-level observable proficiency?" },
  { id: "P6", name: "Composable profiles", question: "Could this skill be reused in another role without copying this job's wording?" },
] as const;

export function roleSkillLabel(skill: Skill): string {
  if (skill.dimension === "competency") {
    return skill.kflaCompetencyId && dekraLeadershipStandards[skill.kflaCompetencyId]
      ? "DEKRA Leadership Standard · KFLA competency"
      : "KFLA behavioural competency";
  }
  if (skill.dimension === "technical") return skill.capabilityType ? `${skill.capabilityType[0].toUpperCase()}${skill.capabilityType.slice(1)} skill` : "Hard / technical / functional skill · subtype unreviewed";
  return "Supporting context · outside core profile";
}
