/**
 * The fixed template catalogue of `send-email` (gap/08 NO4). Callers choose a
 * template and pass plain-text variables; every variable is cleaned and
 * HTML-escaped, every link variable must be https, and the subject and body
 * come from code only. `CREW_INVITATION` and `PASSWORD_RESET` reuse the
 * shared templates (`_shared/email.ts`); their link variable is
 * `action_link` (the older names `invitation_link` / `reset_link` are
 * accepted and mapped).
 */
import { cleanVariables, escapeHtml, isSafeLink, renderEmail, renderLayout, type RenderedEmail } from '../_shared/email.ts';

export const SEND_EMAIL_TEMPLATES = [
  'CREW_INVITATION',
  'PASSWORD_RESET',
  'FLIGHT_REQUEST_TO_AGENT',
  'ALERT_ESCALATION',
  'CERTIFICATE_EXPIRY_WARNING',
  'INCIDENT_NOTIFICATION',
] as const;
export type SendEmailTemplate = (typeof SEND_EMAIL_TEMPLATES)[number];

export function isSendEmailTemplate(value: string): value is SendEmailTemplate {
  return (SEND_EMAIL_TEMPLATES as readonly string[]).includes(value);
}

export type RenderOutcome =
  | { ok: true; email: RenderedEmail }
  | { ok: false; reason: 'missing_variables'; missing: string[] }
  | { ok: false; reason: 'invalid_link'; field: string };

interface NoticeDef {
  required: readonly string[];
  links: readonly string[];
  render(v: Readonly<Record<string, string>>): RenderedEmail;
}

const e = escapeHtml;
const fact = (label: string, value: string) => `<strong>${e(label)}:</strong> ${e(value)}`;
const FOOT = 'You receive this because of your role in STORM. Notification settings are in STORM under your profile.';

function notice(subject: string, heading: string, facts: Array<[string, string]>, intro: string, link?: { label: string; href: string }): RenderedEmail {
  return {
    subject,
    html: renderLayout({
      preheader: e(intro),
      heading: e(heading),
      paragraphs: [e(intro), ...facts.map(([label, value]) => fact(label, value))],
      button: link ? { label: e(link.label), href: e(link.href) } : undefined,
      footnotes: [e(FOOT)],
    }),
    text: [intro, '', ...facts.map(([l, v]) => `${l}: ${v}`), ...(link ? ['', `${link.label}: ${link.href}`] : []), '', FOOT].join('\n'),
  };
}

const NOTICES: Readonly<Record<Exclude<SendEmailTemplate, 'CREW_INVITATION' | 'PASSWORD_RESET'>, NoticeDef>> = {
  FLIGHT_REQUEST_TO_AGENT: {
    required: ['crew_name', 'vessel_name', 'travel_details', 'request_link'],
    links: ['request_link'],
    render: (v) =>
      notice(`New flight request: ${v.crew_name}, ${v.vessel_name}`, 'New flight request', [['Crew member', v.crew_name], ['Vessel', v.vessel_name], ['Travel details', v.travel_details]], 'A flight request is waiting for you in STORM.', {
        label: 'View request',
        href: v.request_link,
      }),
  },
  ALERT_ESCALATION: {
    required: ['alert_title', 'alert_description', 'vessel_name', 'action_link'],
    links: ['action_link'],
    render: (v) =>
      notice(`Urgent: ${v.alert_title}, ${v.vessel_name}`, v.alert_title, [['Vessel', v.vessel_name], ['Details', v.alert_description]], 'An alert was escalated to you in STORM.', {
        label: 'Open in STORM',
        href: v.action_link,
      }),
  },
  CERTIFICATE_EXPIRY_WARNING: {
    required: ['certificate_name', 'vessel_name', 'expiry_date', 'days_remaining'],
    links: [],
    render: (v) =>
      notice(
        `Certificate expiring: ${v.certificate_name}, ${v.vessel_name}`,
        'Certificate expiring',
        [['Certificate', v.certificate_name], ['Vessel', v.vessel_name], ['Expiry date', v.expiry_date], ['Days remaining', v.days_remaining]],
        'A certificate expires soon. Plan the renewal before it lapses.',
      ),
  },
  INCIDENT_NOTIFICATION: {
    required: ['incident_type', 'vessel_name', 'incident_date', 'severity', 'summary', 'incident_link'],
    links: ['incident_link'],
    render: (v) =>
      notice(
        `Incident reported: ${v.incident_type}, ${v.vessel_name}`,
        'Incident reported',
        [['Type', v.incident_type], ['Vessel', v.vessel_name], ['Date', v.incident_date], ['Severity', v.severity], ['Summary', v.summary]],
        'An incident was reported in STORM.',
        { label: 'View incident', href: v.incident_link },
      ),
  },
};

const LINK_ALIASES: Record<string, string> = { invitation_link: 'action_link', reset_link: 'action_link' };

export function renderSendEmail(template: SendEmailTemplate, input: Record<string, string>): RenderOutcome {
  if (template === 'CREW_INVITATION' || template === 'PASSWORD_RESET') {
    const vars: Record<string, string> = {};
    for (const [k, v] of Object.entries(input)) vars[LINK_ALIASES[k] ?? k] = v;
    if (!vars.action_link?.trim()) return { ok: false, reason: 'missing_variables', missing: ['action_link'] };
    const r = renderEmail(template, vars);
    return r.ok ? r : { ok: false, reason: 'invalid_link', field: 'action_link' };
  }
  const def = NOTICES[template];
  const vars = cleanVariables(input, def.links);
  const missing = def.required.filter((name) => !vars[name]);
  if (missing.length > 0) return { ok: false, reason: 'missing_variables', missing };
  for (const link of def.links) if (!isSafeLink(vars[link])) return { ok: false, reason: 'invalid_link', field: link };
  return { ok: true, email: def.render(vars) };
}
