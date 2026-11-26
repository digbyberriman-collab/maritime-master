import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { COMPLIANCE_TABS, type ComplianceTab } from '@/modules/crew/lib/compliance';
import {
  STATUS_VIEW_LABEL,
  cellHasIssue,
  daysFrom,
  issueText,
  ratioText,
  relativeDays,
  requirementCellWords,
  viewTab,
  type StatusView,
} from '@/modules/crew/lib/complianceModel';
import { dayText } from '@/modules/crew/lib/verification';
import { ComplianceStatusPill, RequirementCell, TabRatioCell } from './ComplianceCells';
import { PersonHeader } from './ComplianceStatusMatrix';
import { explain, type ComplianceRowModel } from './statusRows';

const MAX_ISSUES = 4;

/** One crew member as a card (the layout below 768 px, or ?layout=cards). */
const PersonCard: React.FC<{ model: ComplianceRowModel; view: StatusView; profileHref: ((profileId: string) => string) | null; today: string }> = ({
  model,
  view,
  profileHref,
  today,
}) => {
  const { person } = model;
  const tab = viewTab(view);
  const next = person.nextExpiry;
  const rel = relativeDays(daysFrom(today, next));
  const rows = tab ? model.rows.filter((r) => r.tab === tab) : view === 'gaps' ? model.rows.filter(cellHasIssue) : [];
  return (
    <Card className="min-w-0" data-compliance-card={person.profileId}>
      <CardContent className="min-w-0 space-y-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <PersonHeader model={model} profileHref={profileHref} />
          <ComplianceStatusPill status={person.status} required={person.required} />
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 type-caption">
          <div className="min-w-0">
            <dt className="text-muted-foreground">Met</dt>
            <dd className="type-body-sm tabular-nums text-foreground">{person.required === 0 ? 'Nothing required' : `${person.met} of ${person.required}`}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-muted-foreground">Next expiry</dt>
            <dd className="type-body-sm tabular-nums text-foreground">{next ? `${dayText(next)}${rel ? ` · ${rel}` : ''}` : '—'}</dd>
          </div>
        </dl>
        {view === 'overview' ? (
          <>
            <ul className="grid grid-cols-2 gap-2" aria-label={`${person.displayName}, by tab`}>
              {COMPLIANCE_TABS.map((t: ComplianceTab) => (
                <li key={t} className="flex min-w-0 flex-col items-start gap-1 rounded-md border border-border px-2 py-1.5">
                  <span className="max-w-full truncate type-caption text-muted-foreground">{STATUS_VIEW_LABEL[t]}</span>
                  <span className="[&>button]:mx-0">
                    <TabRatioCell cell={model.tabs[t]} context={`${person.displayName}, ${STATUS_VIEW_LABEL[t]}`} />
                  </span>
                </li>
              ))}
            </ul>
            {person.issues.length > 0 ? (
              <ul className="space-y-0.5 type-caption text-muted-foreground" aria-label={`${person.displayName}, what needs a look`}>
                {person.issues.slice(0, MAX_ISSUES).map((i) => (
                  <li key={`${i.rowId}:${i.reason}`} className="break-words">
                    {issueText(i)}
                  </li>
                ))}
                {person.issues.length > MAX_ISSUES ? <li>and {person.issues.length - MAX_ISSUES} more</li> : null}
              </ul>
            ) : null}
          </>
        ) : rows.length === 0 ? (
          <p className="type-caption text-muted-foreground">
            {tab ? `No ${STATUS_VIEW_LABEL[tab]} requirements for this position.` : 'Nothing needs a look.'}
          </p>
        ) : (
          <ul className="divide-y divide-border" aria-label={`${person.displayName}, ${tab ? STATUS_VIEW_LABEL[tab] : 'gaps'}`}>
            {rows.map((r) => (
              <li key={r.rowId} className="flex min-w-0 items-center justify-between gap-2 py-1.5">
                <span className="min-w-0 break-words type-body-sm text-foreground">{r.label}</span>
                <span className="shrink-0">
                  <RequirementCell words={requirementCellWords(r, explain)} context={`${person.displayName}, ${r.label}`} />
                </span>
              </li>
            ))}
          </ul>
        )}
        {tab && model.tabs[tab].required > 0 ? (
          <p className="type-caption tabular-nums text-muted-foreground">
            {STATUS_VIEW_LABEL[tab]} met: {ratioText(model.tabs[tab].met, model.tabs[tab].required)}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
};

/** A group of crew as cards: one column at 390 px, two from 640 px, three from 1280 px. */
export const ComplianceCards: React.FC<{
  label: string;
  models: readonly ComplianceRowModel[];
  view: StatusView;
  profileHref: ((profileId: string) => string) | null;
  today: string;
}> = ({ label, models, view, profileHref, today }) => (
  <ul className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={label} data-compliance-cards="">
    {models.map((m) => (
      <li key={m.person.profileId} className="min-w-0">
        <PersonCard model={m} view={view} profileHref={profileHref} today={today} />
      </li>
    ))}
  </ul>
);

export default ComplianceCards;
