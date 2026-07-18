// Shared competitor-resolution fixtures (Agent I).
//
// One place for the required coverage matrix so resolver, live-seams and
// query-planner tests all exercise the same entities:
//   GoPro / 大疆 DJI / Moka / SAP SuccessFactors → RESOLVED (name-only search)
//   同名歧义企业 (星辰科技)                          → AMBIGUOUS
//   无法找到官网企业 (云雀未知企业)                    → NOT_FOUND
//   用户提供官网 (competitor-demo.example.net)      → USER_CONFIRMED
//   用户提供非法私网 URL (http://192.168.10.5)      → INVALID_DOMAIN
//
// All resolution goes through the deterministic mock competitor search — zero
// real calls (SCENARIO_COMPETITOR_DATASET lives in the src module under test).

import type { CompetitorInput } from "../../src/runtime/diagnosis-input";

export const USER_CONFIRMED_WEBSITE = "https://competitor-demo.example.net";
export const PRIVATE_URL = "http://192.168.10.5/admin";

/** Name-only inputs that the mock search resolves to a single official domain. */
export const RESOLVABLE_NAMES: CompetitorInput[] = [
  "GoPro",
  "大疆 DJI",
  "Moka",
  "SAP SuccessFactors",
];

export const AMBIGUOUS_NAME: CompetitorInput = "星辰科技";
export const NOT_FOUND_NAME: CompetitorInput = "云雀未知企业";

export const USER_CONFIRMED_INPUT: CompetitorInput = {
  name: "示例竞品",
  website: USER_CONFIRMED_WEBSITE,
};

export const INVALID_DOMAIN_INPUT: CompetitorInput = {
  name: "内网竞品",
  website: PRIVATE_URL,
};

/** The full required coverage batch, in a stable order. */
export const FULL_COMPETITOR_BATCH: CompetitorInput[] = [
  ...RESOLVABLE_NAMES,
  AMBIGUOUS_NAME,
  NOT_FOUND_NAME,
  USER_CONFIRMED_INPUT,
  INVALID_DOMAIN_INPUT,
];
