// Competitor entity & official-domain resolution (Agent I) — public surface.
export type {
  CompetitorResolution,
  CompetitorResolutionResult,
  CompetitorResolutionStatus,
} from "./types";
export { CONFIRMED_STATUSES } from "./types";
export {
  resolveCompetitors,
  type CompetitorResolverDeps,
} from "./resolve";
export {
  createMockCompetitorSearch,
  SCENARIO_COMPETITOR_DATASET,
  type MockCompetitorEntry,
} from "./mock-search";
