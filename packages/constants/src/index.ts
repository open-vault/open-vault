// These values are law. Never change them.
export const MAX_PROJECT_NAME_LENGTH = 128;
export const MIN_PROJECT_NAME_LENGTH = 2;
export const MAX_SECRET_NAME_LENGTH_KV = 255;
export const MAX_SECRET_NAME_LENGTH_OTHER = 128;
export const MAX_TEAM_NAME_LENGTH = 64;
export const MIN_TEAM_NAME_LENGTH = 3;
export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const SESSION_TOKEN_TTL_HOURS = 24;
export const INVITATION_EXPIRY_HOURS = 72;
export const SHARE_LINK_MAX_EXPIRY_DAYS = 30;
export const KEY_DERIVATION_INFO = "open-vault-v1";
export const KEY_DERIVATION_SALT = "open-vault-key-derivation-v1";
export const KEY_DERIVATION_LENGTH_BYTES = 32;
export const IV_LENGTH_BYTES = 12;
export const AES_KEY_LENGTH_BITS = 256;
export const CHALLENGE_LENGTH_BYTES = 32;

// Validation regexes (determinism contracts)
export const PROJECT_NAME_REGEX = /^[a-z][a-z0-9_/-]{1,127}$/;
export const SECRET_NAME_KV_REGEX = /^[A-Z][A-Z0-9_]{0,254}$/;
export const SECRET_NAME_OTHER_REGEX = /^[a-z][a-z0-9_-]{0,127}$/;
export const TEAM_SLUG_REGEX = /^[a-z][a-z0-9_-]{2,63}$/;
