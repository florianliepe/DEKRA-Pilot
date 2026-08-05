import type { PmoDocument } from "./pmo-schema";

// Public-shell placeholder only. Canonical project data is loaded from the
// protected n8n API after the user supplies the pilot password.
export const bootstrapPmoData: PmoDocument = {
  schemaVersion: "1.0",
  revision: 1,
  project: {
    id: "DEKRA-PILOT",
    name: "DEKRA Pilot Workspace",
    subtitle: "Protected project control tower",
    phase: "Connect to load project data",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    overallRag: "grey",
    progress: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  workstreams: [],
  milestones: [],
  deliverables: [],
  risks: [],
  meetings: [],
  activity: [],
};
