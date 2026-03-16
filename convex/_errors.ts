// Inlined from @open-vault/errors — Convex bundler cannot resolve workspace packages

export const ErrorCode = {
  VALIDATION_ERROR: "validation_error",
  AUTH_FAILED: "auth_failed",
  UNAUTHENTICATED: "unauthenticated",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  DUPLICATE_RESOURCE: "duplicate_resource",
  INVALID_TRANSITION: "invalid_transition",
  SHARE_LINK_EXPIRED: "share_link_expired",
  SHARE_LINK_EXHAUSTED: "share_link_exhausted",
  SHARE_LINK_REVOKED: "share_link_revoked",
  INTERNAL_ERROR: "internal_error",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCodeType,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }

  static validationError(message: string, details?: unknown) {
    return new AppError(ErrorCode.VALIDATION_ERROR, message, details);
  }
  static authFailed(message = "Authentication failed") {
    return new AppError(ErrorCode.AUTH_FAILED, message);
  }
  static unauthenticated(message = "No valid session") {
    return new AppError(ErrorCode.UNAUTHENTICATED, message);
  }
  static forbidden(message = "Forbidden") {
    return new AppError(ErrorCode.FORBIDDEN, message);
  }
  static notFound(resource: string) {
    return new AppError(ErrorCode.NOT_FOUND, `${resource} not found`);
  }
  static duplicate(resource: string) {
    return new AppError(ErrorCode.DUPLICATE_RESOURCE, `${resource} already exists`);
  }
  static invalidTransition(from: string, to: string) {
    return new AppError(ErrorCode.INVALID_TRANSITION, `Cannot transition from ${from} to ${to}`);
  }
  static shareLinkExpired() {
    return new AppError(ErrorCode.SHARE_LINK_EXPIRED, "Share link has expired");
  }
  static shareLinkExhausted() {
    return new AppError(ErrorCode.SHARE_LINK_EXHAUSTED, "Share link view limit reached");
  }
  static shareLinkRevoked() {
    return new AppError(ErrorCode.SHARE_LINK_REVOKED, "Share link has been revoked");
  }
  static internalError(message = "Internal error") {
    return new AppError(ErrorCode.INTERNAL_ERROR, message);
  }
}
