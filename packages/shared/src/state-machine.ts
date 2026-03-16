import { AppError } from "@open-vault/errors";
import type {
  ProjectStatus,
  SecretStatus,
  ShareLinkStatus,
  TeamMemberStatus,
} from "./types";

// Explicit transition table — no ad-hoc state changes permitted

type Transition<S extends string> = Partial<Record<S, S[]>>;

const PROJECT_TRANSITIONS: Transition<ProjectStatus> = {
  ACTIVE: ["DELETED"],
};

const SECRET_TRANSITIONS: Transition<SecretStatus> = {
  ACTIVE: ["DELETED"],
};

const SHARE_LINK_TRANSITIONS: Transition<ShareLinkStatus> = {
  ACTIVE: ["EXPIRED", "EXHAUSTED", "REVOKED"],
};

const TEAM_MEMBER_TRANSITIONS: Transition<TeamMemberStatus> = {
  PENDING: ["ACCEPTED", "DECLINED", "EXPIRED"],
};

function assertTransition<S extends string>(
  table: Transition<S>,
  from: S,
  to: S,
  context: string
): void {
  const allowed = table[from] ?? [];
  if (!(allowed as string[]).includes(to)) {
    throw AppError.invalidTransition(`${context}:${from}`, `${context}:${to}`);
  }
}

export function transitionProject(from: ProjectStatus, to: ProjectStatus) {
  assertTransition(PROJECT_TRANSITIONS, from, to, "Project");
}

export function transitionSecret(from: SecretStatus, to: SecretStatus) {
  assertTransition(SECRET_TRANSITIONS, from, to, "Secret");
}

export function transitionShareLink(from: ShareLinkStatus, to: ShareLinkStatus) {
  assertTransition(SHARE_LINK_TRANSITIONS, from, to, "ShareLink");
}

export function transitionTeamMember(from: TeamMemberStatus, to: TeamMemberStatus) {
  assertTransition(TEAM_MEMBER_TRANSITIONS, from, to, "TeamMember");
}
