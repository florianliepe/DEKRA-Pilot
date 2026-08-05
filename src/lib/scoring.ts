export function priorityScore(impact: number, urgency: number, criticality: number): number {
  return Math.round((0.4 * impact + 0.3 * urgency + 0.3 * criticality) * 20);
}

export function priorityBand(score: number): "P1" | "P2" | "P3" | "P4" {
  if (score >= 80) return "P1";
  if (score >= 65) return "P2";
  if (score >= 45) return "P3";
  return "P4";
}
