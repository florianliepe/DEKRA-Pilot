import { z } from "zod";

export const RagSchema = z.enum(["green", "amber", "red", "grey"]);
export const DeliveryStatusSchema = z.enum(["not_started", "in_progress", "at_risk", "blocked", "done"]);

export const WorkstreamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  owner: z.string().min(1),
  progress: z.number().min(0).max(100),
  rag: RagSchema,
});

export const MilestoneSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  phase: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(["upcoming", "at_risk", "complete"]),
  owner: z.string().min(1),
  description: z.string().default(""),
});

export const DeliverableSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  workstream: z.string().min(1),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: DeliveryStatusSchema,
  owner: z.string().min(1),
  progress: z.number().min(0).max(100),
  priority: z.enum(["P1", "P2", "P3"]),
});

export const RiskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().default(""),
  probability: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  state: z.enum(["open", "mitigating", "monitoring", "closed"]),
  owner: z.string().min(1),
  mitigation: z.string().default(""),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const MeetingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["steering", "working_session", "workstream", "decision"]),
  participants: z.array(z.string()).default([]),
  summary: z.string().min(1),
  decisions: z.array(z.string()).default([]),
  actions: z.array(z.object({ text: z.string().min(1), owner: z.string().min(1), dueDate: z.string() })).default([]),
});

export const ActivitySchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  type: z.enum(["update", "risk", "meeting", "deliverable", "automation"]),
  actor: z.string().min(1),
  message: z.string().min(1),
  entityId: z.string().optional(),
});

export const PmoDocumentSchema = z.object({
  schemaVersion: z.literal("1.0"),
  revision: z.number().int().min(1),
  project: z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    subtitle: z.string().min(1),
    phase: z.string().min(1),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    overallRag: RagSchema,
    progress: z.number().min(0).max(100),
    updatedAt: z.string().datetime(),
  }),
  workstreams: z.array(WorkstreamSchema),
  milestones: z.array(MilestoneSchema),
  deliverables: z.array(DeliverableSchema),
  risks: z.array(RiskSchema),
  meetings: z.array(MeetingSchema),
  activity: z.array(ActivitySchema),
});

export type PmoDocument = z.infer<typeof PmoDocumentSchema>;
export type Rag = z.infer<typeof RagSchema>;
export type Milestone = z.infer<typeof MilestoneSchema>;
export type Deliverable = z.infer<typeof DeliverableSchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Meeting = z.infer<typeof MeetingSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
