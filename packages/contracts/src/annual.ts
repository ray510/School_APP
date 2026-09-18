import {z} from 'zod';
import {Level,SafeUrl,Profile} from './domain';
export const AnnualSource=z.enum(['edb-kg-profiles','chsc-primary-profiles','chsc-secondary-profiles']);
export const AnnualFact=z.object({
  label:z.string().min(1).max(240),value:z.string().max(20000).nullable(),
  state:z.enum(['as_reported','not_provided','not_applicable']),
  reference_period:z.string().max(120).nullable(),
  is_planned:z.boolean()
}).strict();
export const AnnualProfile=z.object({
  record_hash:z.string().regex(/^[a-f0-9]{64}$/),source_record_key:z.string().min(1).max(200),
  school_id:Profile.shape.school_id,level:Level,school_name:z.string().min(1).max(500),
  school_address:z.string().max(1500),profile_edition:z.string().min(1).max(160),
  catalogue_label:z.string().max(300),source_id:AnnualSource,source_url:SafeUrl,
  raw_sha256:z.string().regex(/^[a-f0-9]{64}$/),fetched_at:z.string().datetime(),
  identity_evidence:z.object({edb_source_record_key:z.string().min(1).max(100),baseline_raw_sha256:z.string().regex(/^[a-f0-9]{64}$/),reviewer:z.string().min(1).max(100),reviewed_at:z.string().datetime()}).strict(),
  facts:z.array(AnnualFact).max(200),is_test:z.boolean()
}).strict();
export type AnnualSchoolProfile=z.infer<typeof AnnualProfile>;
export const AnnualQuery=z.object({school:Profile.shape.school_id,level:Level,edition:z.string().max(160).optional()}).strict();
export function factPeriod(label:string):string|null{
  const match=label.match(/^(20\d{2})_(20\d{2})學年/);return match?`${match[1]}/${match[2]}`:null;
}
