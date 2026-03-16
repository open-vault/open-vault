/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _constants from "../_constants.js";
import type * as _errors from "../_errors.js";
import type * as _utils from "../_utils.js";
import type * as _validators from "../_validators.js";
import type * as auth from "../auth.js";
import type * as projects from "../projects.js";
import type * as scheduled from "../scheduled.js";
import type * as secrets from "../secrets.js";
import type * as shareLinks from "../shareLinks.js";
import type * as teams from "../teams.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  _constants: typeof _constants;
  _errors: typeof _errors;
  _utils: typeof _utils;
  _validators: typeof _validators;
  auth: typeof auth;
  projects: typeof projects;
  scheduled: typeof scheduled;
  secrets: typeof secrets;
  shareLinks: typeof shareLinks;
  teams: typeof teams;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
