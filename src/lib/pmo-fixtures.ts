import type { PmoDocument } from "./pmo-schema";

export const bootstrapPmoData: PmoDocument = {
  schemaVersion: "1.0",
  revision: 1,
  project: {
    id: "DEKRA-SBO-PILOT",
    name: "Skill-Based Organisation Pilot",
    subtitle: "Global Skill & Job Architecture",
    phase: "Mobilise & align",
    startDate: "2026-07-20",
    endDate: "2026-11-06",
    overallRag: "amber",
    progress: 34,
    updatedAt: "2026-08-05T09:30:00.000Z",
  },
  workstreams: [
    { id: "WS1", name: "Programme, Governance & Value", shortName: "Programme", owner: "PMO Lead", progress: 62, rag: "green" },
    { id: "WS2", name: "Skill Architecture", shortName: "Skills", owner: "Skill Design Lead", progress: 38, rag: "amber" },
    { id: "WS3", name: "Job & Role Architecture", shortName: "Jobs", owner: "Job Architecture Lead", progress: 31, rag: "green" },
    { id: "WS4", name: "Data, Mapping & Technology", shortName: "Data & Tech", owner: "Data Lead", progress: 24, rag: "amber" },
    { id: "WS5", name: "Adoption, Change & Compliance", shortName: "Adoption", owner: "Change Lead", progress: 20, rag: "red" },
  ],
  milestones: [
    { id: "G0", title: "Mobilisation complete", phase: "Mobilise", date: "2026-08-07", status: "at_risk", owner: "PMO Lead", description: "Scope, team, governance and delivery baseline approved." },
    { id: "G1", title: "Architecture baseline", phase: "Discover", date: "2026-08-28", status: "upcoming", owner: "Skill Design Lead", description: "Skill principles, proficiency model and job architecture baseline agreed." },
    { id: "G2", title: "Design freeze", phase: "Design", date: "2026-09-25", status: "upcoming", owner: "Programme Director", description: "Taxonomy, profile standard and data model ready for build." },
    { id: "G3", title: "Pilot data ready", phase: "Build", date: "2026-10-16", status: "upcoming", owner: "Data Lead", description: "Validated skill library, job profiles and mappings complete." },
    { id: "G4", title: "Scale decision", phase: "Validate", date: "2026-11-06", status: "upcoming", owner: "Steering Committee", description: "Evidence reviewed and scale blueprint approved." },
  ],
  deliverables: [
    { id: "DEL-001", title: "Pilot Charter & Scope Selection Matrix", workstream: "WS1", dueDate: "2026-08-07", status: "in_progress", owner: "PMO Lead", progress: 85, priority: "P1" },
    { id: "DEL-002", title: "Skill Architecture Charter", workstream: "WS2", dueDate: "2026-08-14", status: "in_progress", owner: "Skill Design Lead", progress: 55, priority: "P1" },
    { id: "DEL-003", title: "Target Job Family Structure", workstream: "WS3", dueDate: "2026-08-21", status: "in_progress", owner: "Job Architecture Lead", progress: 44, priority: "P1" },
    { id: "DEL-004", title: "Data & System Landscape Map", workstream: "WS4", dueDate: "2026-08-21", status: "at_risk", owner: "Data Lead", progress: 35, priority: "P1" },
    { id: "DEL-005", title: "Works Council Information Package", workstream: "WS5", dueDate: "2026-08-14", status: "blocked", owner: "Change Lead", progress: 18, priority: "P1" },
    { id: "DEL-006", title: "Integrated Pilot Plan & Gate Criteria", workstream: "WS1", dueDate: "2026-08-07", status: "done", owner: "PMO Lead", progress: 100, priority: "P2" },
    { id: "DEL-007", title: "Proficiency Framework", workstream: "WS2", dueDate: "2026-08-28", status: "not_started", owner: "Skill Design Lead", progress: 8, priority: "P2" },
  ],
  risks: [
    { id: "R-01", title: "Works council engagement starts too late", description: "Representation requirements may delay the pilot gate.", probability: 4, impact: 5, state: "mitigating", owner: "Change Lead", mitigation: "Pre-brief representatives and agree evidence boundaries before G1.", updatedAt: "2026-08-04" },
    { id: "R-02", title: "Source data quality is lower than assumed", description: "Job descriptions contain duplicates and inconsistent naming.", probability: 4, impact: 4, state: "open", owner: "Data Lead", mitigation: "Profile data before mapping and agree a minimum viable quality threshold.", updatedAt: "2026-08-05" },
    { id: "R-03", title: "Skill granularity diverges by workstream", description: "Teams may produce inconsistent skill definitions.", probability: 3, impact: 4, state: "monitoring", owner: "Skill Design Lead", mitigation: "Use one rulebook and weekly cross-workstream calibration.", updatedAt: "2026-08-03" },
    { id: "R-04", title: "Pilot scope exceeds available capacity", description: "SME commitments are not yet locked for all units.", probability: 3, impact: 5, state: "mitigating", owner: "PMO Lead", mitigation: "Freeze capacity at G0 and move optional families to the scale backlog.", updatedAt: "2026-08-05" },
  ],
  meetings: [
    { id: "MTG-003", title: "Pilot mobilisation stand-up", date: "2026-08-05", type: "working_session", participants: ["PMO Lead", "Skill Design Lead", "Data Lead"], summary: "Reviewed G0 readiness and aligned the minimum evidence package for Friday.", decisions: ["Keep the pilot scope to two job families", "Use GitHub as the canonical project store"], actions: [{ text: "Confirm SME capacity by business unit", owner: "PMO Lead", dueDate: "2026-08-07" }] },
    { id: "MTG-002", title: "Skill design calibration", date: "2026-08-03", type: "workstream", participants: ["Skill Design Lead", "Job Architecture Lead"], summary: "Tested the initial granularity rules against five anchor profiles.", decisions: ["Separate knowledge areas from executable skills"], actions: [{ text: "Update naming rule examples", owner: "Skill Design Lead", dueDate: "2026-08-10" }] },
    { id: "MTG-001", title: "Steering committee kickoff", date: "2026-07-29", type: "steering", participants: ["Executive Sponsor", "Programme Director", "PMO Lead"], summary: "Confirmed pilot ambition, governance cadence and gate authority.", decisions: ["Bi-weekly steering cadence", "Gates require explicit evidence"], actions: [{ text: "Publish governance charter", owner: "PMO Lead", dueDate: "2026-08-07" }] },
  ],
  activity: [
    { id: "ACT-006", timestamp: "2026-08-05T09:30:00.000Z", type: "automation", actor: "PMO Intake workflow", message: "Refreshed project status from the latest work-package intake." },
    { id: "ACT-005", timestamp: "2026-08-05T08:45:00.000Z", type: "risk", actor: "Data Lead", message: "Raised source data quality to high exposure.", entityId: "R-02" },
    { id: "ACT-004", timestamp: "2026-08-05T08:10:00.000Z", type: "meeting", actor: "PMO Lead", message: "Published mobilisation stand-up summary.", entityId: "MTG-003" },
    { id: "ACT-003", timestamp: "2026-08-04T15:20:00.000Z", type: "deliverable", actor: "Change Lead", message: "Marked the Works Council information package as blocked.", entityId: "DEL-005" },
    { id: "ACT-002", timestamp: "2026-08-03T16:00:00.000Z", type: "meeting", actor: "Skill Design Lead", message: "Captured skill design calibration decisions.", entityId: "MTG-002" },
    { id: "ACT-001", timestamp: "2026-07-29T14:00:00.000Z", type: "update", actor: "Programme Director", message: "Pilot governance baseline approved." },
  ],
};
