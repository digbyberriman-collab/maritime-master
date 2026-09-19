export interface AlertLinkSource {
  id: string;
  source_module: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
}

const ROUTES: Array<[string, string]> = [
  ['certificate', '/certificates/alerts'],
  ['audit', '/audits'],
  ['capa', '/reports/capa-tracker'],
  ['drill', '/ism/drills'],
  ['incident', '/incidents'],
  ['maintenance', '/maintenance?tab=schedule'],
  ['document', '/documents'],
  ['training', '/training'],
  ['form', '/ism/forms/submissions'],
  ['risk_assessment', '/ism/risk-assessments'],
  ['crew', '/crew/list'],
];

export const COMPLIANCE_TERMS = ['compliance', 'certificate', 'audit', 'capa', 'ism', 'isps', 'mlc', 'marpol'];

export function isComplianceAlert(alert: Pick<AlertLinkSource, 'source_module' | 'related_entity_type'> & { alert_type?: string | null }): boolean {
  const searchable = [alert.source_module, alert.related_entity_type, alert.alert_type]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return COMPLIANCE_TERMS.some((term) => searchable.includes(term));
}

export function getAlertDestination(alert: AlertLinkSource): string {
  const source = `${alert.source_module ?? ''} ${alert.related_entity_type ?? ''}`.toLowerCase();
  const match = ROUTES.find(([term]) => source.includes(term));
  if (!match) return `/alerts?id=${alert.id}`;
  const [, route] = match;
  if (!alert.related_entity_id) return route;
  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}id=${alert.related_entity_id}`;
}

export function getTaskDestination(taskId: string): string {
  return `/maintenance?tab=schedule&task=${taskId}`;
}
