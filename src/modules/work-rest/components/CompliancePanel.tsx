import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { ComplianceResult, RuleSet } from '../types';

interface Props {
  compliance: ComplianceResult;
  ruleSet: RuleSet;
}

export const CompliancePanel: React.FC<Props> = ({ compliance, ruleSet }) => {
  const ncCount = compliance.non_conformities.length;
  const totalWorkH = compliance.totals.work_minutes / 60;
  const totalRestH = compliance.totals.rest_minutes / 60;
  const failing7d = compliance.rolling_7d.filter((w) => !w.passes).length;
  const failing24 = compliance.rolling_24h.filter((w) => !w.passes).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Compliance summary
          {compliance.is_compliant ? (
            <Badge className="ml-auto bg-success/15 text-success border-success/40">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Compliant
            </Badge>
          ) : (
            <Badge className="ml-auto bg-destructive/15 text-destructive border-destructive/40">
              <AlertTriangle className="h-3 w-3 mr-1" /> {ncCount} non-conformity
              {ncCount === 1 ? '' : 'ies'}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total work" value={`${totalWorkH.toFixed(1)}h`} />
          <Stat label="Total rest" value={`${totalRestH.toFixed(1)}h`} />
          <Stat
            label="Failing 24h windows"
            value={String(failing24)}
            warn={failing24 > 0}
          />
          <Stat
            label="Failing 7-day windows"
            value={String(failing7d)}
            warn={failing7d > 0}
          />
        </div>
        <div className="text-xs text-muted-foreground border rounded p-2 bg-muted/30">
          <strong>Rules in force:</strong> ≥ {ruleSet.min_rest_per_24h}h rest /24h ·
          ≥ {ruleSet.min_rest_per_7d}h rest /7d · ≤ {ruleSet.max_rest_periods_per_24h}{' '}
          rest periods/day · one rest block ≥ {ruleSet.min_long_rest_block}h ·
          intervals between rest ≤ {ruleSet.max_interval_between_rest}h
        </div>
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: string; warn?: boolean }> = ({
  label,
  value,
  warn,
}) => (
  <div className={`rounded border p-2 ${warn ? 'border-destructive/40 bg-destructive/5' : ''}`}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold">{value}</div>
  </div>
);
