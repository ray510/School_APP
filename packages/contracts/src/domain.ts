import { z } from 'zod';
export const Level = z.enum(['KG', 'PRIMARY', 'SECONDARY']);
export const Year = z.coerce.number().int().min(2000).max(2100);
export const Session = z.enum(['AM', 'PM', 'ALL_DAY', 'UNKNOWN']);
export const SafeUrl = z.string().max(2048).url().refine(value => {
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
}, 'Only public HTTP(S) links are supported');
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');
export const Fee = z.object({
  amount_cents: z.number().int().min(0).max(100000000).nullable(),
  state: z.enum(['known', 'not_provided', 'not_applicable', 'not_verified', 'conflict']),
  reference_period: z.string().max(100).nullable()
}).strict().refine(fee => fee.state === 'known' ? fee.amount_cents !== null : fee.amount_cents === null, 'Fee value/state conflict');
export const Profile = z.object({
  school_id: z.string().regex(/^sch_[a-zA-Z0-9_-]{1,80}$/),
  item_key: z.string().min(1).max(240),
  level: Level,
  school_no: z.string().max(100),
  chinese_name: z.string().min(1).max(500),
  english_name: z.string().max(500),
  chinese_address: z.string().max(1500),
  english_address: z.string().max(1500),
  district: z.string().max(120).nullable(),
  funding: z.string().max(120).nullable(),
  category: z.string().max(160),
  session: Session,
  campus_id: z.string().max(100).nullable(),
  website: SafeUrl.nullable(),
  telephone: z.string().max(100).nullable(),
  fee: Fee,
  profile_edition: z.string().max(120).nullable(),
  source_reference_period: z.string().max(120).nullable(),
  source_url: SafeUrl,
  source_id: z.string().min(1).max(120),
  snapshot_id: z.string().min(1).max(120),
  fetched_at: z.string().datetime(),
  is_test: z.boolean()
}).strict();
export type SchoolProfile = z.infer<typeof Profile>;
export const Search = z.object({
  level: Level,
  year: Year,
  q: z.string().max(200).default('').transform(value => value.normalize('NFC').trim().toLowerCase()).refine(value => new TextEncoder().encode(value).length <= 600),
  district: z.string().max(120).default(''),
  funding: z.string().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(40).default(20),
  cursor: z.string().max(2048).optional(),
  release: z.string().min(1).max(120).optional()
}).strict();
export const PrivateEntry = z.object({
  school_id: Profile.shape.school_id,
  item_key: Profile.shape.item_key,
  level: Level,
  entry_year: Year,
  name: z.string().min(1).max(500),
  status: z.enum(['considering','preparing','applied','waiting','result_received']),
  note: z.string().max(4000),
  updated_at: z.string().datetime()
}).strict();
export type ShortlistEntry = z.infer<typeof PrivateEntry>;
export const PersonalEvent = z.object({
  id: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  date: DateOnly,
  note: z.string().max(2000)
}).strict();
export const PrivateExport = z.object({
  schema_version: z.literal(1),
  entries: z.array(PrivateEntry).max(200),
  events: z.array(PersonalEvent).max(200)
}).strict().superRefine((value, context) => {
  const keys = value.entries.map(entryKey);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Duplicate shortlist keys' });
  if (new Set(value.events.map(event => event.id)).size !== value.events.length) context.addIssue({code:'custom',message:'Duplicate personal event IDs'});
});
export type PrivateData = z.infer<typeof PrivateExport>;
export function entryKey(entry: Pick<ShortlistEntry, 'item_key' | 'entry_year'>): string {
  return `${entry.entry_year}::${entry.item_key}`;
}
export function readPrivateImport(text: string): PrivateData {
  if (new TextEncoder().encode(text).length > 1000000) throw new Error('Import exceeds 1 MB');
  return PrivateExport.parse(JSON.parse(text));
}
export function feeLabel(fee: z.infer<typeof Fee>): string {
  if (fee.state === 'known' && fee.amount_cents !== null) return `HK$${(fee.amount_cents / 100).toFixed(2)}${fee.amount_cents === 0 ? '（學費為零，不代表其他費用全免）' : ''}`;
  return ({not_provided:'未提供',not_applicable:'不適用',not_verified:'未核實',conflict:'資料有衝突',known:'未提供'})[fee.state];
}
export const AdmissionEvent = z.object({
  id: z.string().min(1).max(120), title: z.string().min(1).max(300),
  level: Level, entry_year: Year, route: z.string().min(1).max(120),
  school_id: Profile.shape.school_id.nullable(),
  starts_on: DateOnly.nullable(), ends_on: DateOnly.nullable(),
  starts_at: z.string().datetime().nullable(), ends_at: z.string().datetime().nullable(),
  source_url: SafeUrl, verified: z.literal(true), reviewed_at: z.string().datetime()
}).strict().refine(event => {
  if (event.starts_on) return !event.starts_at && !event.ends_at && (!event.ends_on || event.ends_on >= event.starts_on);
  return !!event.starts_at && !!event.ends_at && !event.ends_on && event.ends_at > event.starts_at;
}, 'Use either date-only or an exact UTC interval, never inferred times');
export type PublicEvent = z.infer<typeof AdmissionEvent>;
