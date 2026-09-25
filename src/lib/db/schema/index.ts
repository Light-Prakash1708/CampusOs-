/**
 * CampusOS database schema — single import surface.
 *
 * Every table carries `institution_id` (except `institutions` itself).
 * Tenant scoping is enforced by the query helpers in src/lib/db/tenant.ts,
 * which are the ONLY sanctioned way to read tenant data.
 */
export * from './enums';
export * from './tenancy';
export * from './people';
export * from './academics';
export * from './attendance';
export * from './assessments';
export * from './communication';
export * from './resources';
export * from './skills';
export * from './operations';
export * from './system';
export * from './platform';
export * from './privacy';
export * from './events';
export * from './tools';
export * from './tracker';
