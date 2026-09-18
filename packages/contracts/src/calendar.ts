import { AdmissionEvent, DateOnly, type PublicEvent } from './domain';
function escapeText(value: string): string {
  return value.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
}
/** RFC 5545 lines are folded by UTF-8 octets, not JavaScript character count. */
export function foldLine(value: string): string {
  const encoder = new TextEncoder(); const parts: string[] = []; let line = ''; let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { parts.push(line); line = ' '; bytes = 1; }
    line += character; bytes += size;
  }
  parts.push(line); return parts.join('\r\n');
}
function utc(value: string): string { return new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/, 'Z'); }
export function dayAfter(value: string): string {
  DateOnly.parse(value); const date = new Date(value + 'T00:00:00Z'); date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0,10);
}
export function toCalendar(events: PublicEvent[], now = new Date().toISOString()): string {
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HK School Guide//Annual Guide//ZH','CALSCALE:GREGORIAN'];
  for (const input of events) {
    const event = AdmissionEvent.parse(input);
    lines.push('BEGIN:VEVENT', `UID:${escapeText(event.id)}@hk-school-guide`, `DTSTAMP:${utc(now)}`, `SUMMARY:${escapeText(event.title)}`);
    if (event.starts_on) {
      lines.push(`DTSTART;VALUE=DATE:${event.starts_on.replace(/-/g,'')}`, `DTEND;VALUE=DATE:${dayAfter(event.ends_on ?? event.starts_on).replace(/-/g,'')}`);
    } else {
      lines.push(`DTSTART:${utc(event.starts_at!)}`, `DTEND:${utc(event.ends_at!)}`);
    }
    lines.push(`URL:${escapeText(event.source_url)}`, 'DESCRIPTION:請以官方最新安排為準；日期不代表已獲安排個人面試。','END:VEVENT');
  }
  lines.push('END:VCALENDAR'); return lines.map(foldLine).join('\r\n') + '\r\n';
}
