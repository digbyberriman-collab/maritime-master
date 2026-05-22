import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';
import { DEPARTMENTS } from '../lib/capabilityCatalog';

interface Props {
  selected: string[];
  onChange: (next: string[]) => void;
}

export const DepartmentScopeCard: React.FC<Props> = ({ selected, onChange }) => {
  const toggle = (dept: string, on: boolean) => {
    const next = on ? [...selected, dept] : selected.filter((d) => d !== dept);
    onChange(next);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Department Scope</CardTitle>
        <CardDescription>Select which departments this user can conduct appraisals for. Leave empty for all.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {DEPARTMENTS.map((d) => (
            <label key={d} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={selected.includes(d)} onCheckedChange={(v) => toggle(d, !!v)} />
              <span>{d}</span>
            </label>
          ))}
        </div>
        {selected.length === 0 && (
          <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 text-warning rounded-md px-3 py-2 text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>No departments selected = access to <strong>ALL</strong> departments.</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};