// Shared types and Zod schemas for the entire platform

import { z } from 'zod';

// ============ Type Definitions ============

export type SchoolLevel = 'KG' | 'PRIMARY' | 'SECONDARY';
export type EntryGrade = 'K1' | 'K2' | 'K3' | 'P1' | 'S1';
export type ValueState = 'known' | 'not_provided' | 'not_applicable' | 'not_yet_announced' | 'not_verified' | 'conflict';
export type ContractStatus = 'DISCOVERED' | 'CONTRACT_VERIFIED' | 'LIVE_VERIFIED' | 'STALE' | 'DEGRADED' | 'BLOCKED';
export type ReleaseStatus = 'DRAFT' | 'VALIDATING' | 'READY_FOR_REVIEW' | 'APPROVED' | 'PUBLISHED' | 'REJECTED' | 'REVOKED';

export interface AcademicYear {
  startYear: number;
  endYear: number;
  label: string;
}

export interface FieldValue<T> {
  value: T | null;
  state: ValueState;
  referencePeriod: string | null;
  evidenceIds: string[];
}

export interface ApiResponse<T> {
  data: T;
  meta: {
    request_id: string;
    environment: string;
    channel?: string;
    release_id?: string | null;
    data_status?: string;
    next_cursor?: string | null;
  };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
  meta: {
    request_id: string;
  };
}

// ============ Zod Schemas ============

export const SchoolLevelSchema = z.enum(['KG', 'PRIMARY', 'SECONDARY']);
export const EntryGradeSchema = z.enum(['K1', 'K2', 'K3', 'P1', 'S1']);
export const ValueStateSchema = z.enum(['known', 'not_provided', 'not_applicable', 'not_yet_announced', 'not_verified', 'conflict']);
export const ContractStatusSchema = z.enum(['DISCOVERED', 'CONTRACT_VERIFIED', 'LIVE_VERIFIED', 'STALE', 'DEGRADED', 'BLOCKED']);
export const ReleaseStatusSchema = z.enum(['DRAFT', 'VALIDATING', 'READY_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'REVOKED']);

export const AcademicYearSchema = z.object({
  startYear: z.number().int().min(2000).max(2100),
  endYear: z.number().int().min(2000).max(2100),
  label: z.string(),
});

export const FieldValueSchema = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema.nullable(),
    state: ValueStateSchema,
    referencePeriod: z.string().nullable(),
    evidenceIds: z.array(z.string()),
  });

// Query parameter schemas
export const SchoolsQuerySchema = z.object({
  level: SchoolLevelSchema,
  q: z.string().max(200).optional(),
  district: z.string().optional(),
  funding: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(40).default(20),
});

export const CompareQuerySchema = z.object({
  ids: z.array(z.string()).min(2).max(4),
  level: SchoolLevelSchema,
  release_context: z.string().optional(),
});

export const EventsQuerySchema = z.object({
  cycle: z.string().optional(),
  school: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

// Health check response
export const HealthResponseSchema = z.object({
  environment: z.enum(['local', 'staging', 'production']),
  schema_version: z.string(),
  readiness: z.enum(['ok', 'degraded', 'empty', 'error']),
  public_release_id: z.string().nullable(),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type SchoolsQuery = z.infer<typeof SchoolsQuerySchema>;
export type CompareQuery = z.infer<typeof CompareQuerySchema>;
export type EventsQuery = z.infer<typeof EventsQuerySchema>;

// Common type guards
export const isSchoolLevel = (value: unknown): value is SchoolLevel => {
  return SchoolLevelSchema.safeParse(value).success;
};

export const isValueState = (value: unknown): value is ValueState => {
  return ValueStateSchema.safeParse(value).success;
};
