/**
 * The privacy notice users accept (CAMPUSOS-006). Bump the version when the
 * notice at /privacy changes materially; users are asked to review it again.
 */
export const PRIVACY_NOTICE_VERSION = '2026-09-27';

/**
 * Personal workspaces (students without a college) are for adults only.
 * Under-18s join through their college, which handles consent for its own
 * students. A verifiable guardian-consent flow needs legal review first
 * (DPDP Rules 2025) and is not built.
 */
export const PERSONAL_WORKSPACE_MIN_AGE = 18;

export type AgeBand = 'UNDER_18' | '18_OR_OVER';
