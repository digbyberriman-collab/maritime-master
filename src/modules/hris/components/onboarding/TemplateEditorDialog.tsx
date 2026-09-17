import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useCompanyVessels } from '@/modules/hris/hooks/useCrewContracts';
import type { TemplatePayload } from '@/modules/hris/hooks/useOnboarding';
import {
  DEFAULT_TEMPLATE_SECTIONS,
  ONBOARDING_OWNERS,
  OWNER_LABELS,
  countTemplateItems,
  parseTemplateSections,
  validateTemplate,
  type OnboardingOwner,
  type OnboardingTemplateRow,
  type TemplateItem,
  type TemplateSection,
} from '@/modules/hris/lib/onboarding';

interface TemplateEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template?: OnboardingTemplateRow | null;
  submitting?: boolean;
  onSubmit: (payload: TemplatePayload) => Promise<unknown>;
}

const DEPARTMENTS = ['Deck', 'Engineering', 'Interior', 'Galley', 'Management'];

const emptyItem = (): TemplateItem => ({ title: '', owner: 'hr', due_offset_days: 0, required: true });

const clone = (sections: TemplateSection[]): TemplateSection[] => sections.map((s) => ({ section: s.section, items: s.items.map((i) => ({ ...i })) }));

const move = <T,>(list: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
};

/** Section / item builder for an onboarding template. */
export const TemplateEditorDialog: React.FC<TemplateEditorDialogProps> = ({ open, onOpenChange, template, submitting, onSubmit }) => {
  const { vessels } = useCompanyVessels();
  const [name, setName] = useState('');
  const [vesselId, setVesselId] = useState<string>('all');
  const [departments, setDepartments] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [sections, setSections] = useState<TemplateSection[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShowErrors(false);
    setName(template?.name ?? '');
    setVesselId(template?.vessel_id ?? 'all');
    setDepartments(template?.applicable_departments ?? []);
    setIsDefault(template?.is_default ?? false);
    setSections(template ? parseTemplateSections(template.sections) : clone(DEFAULT_TEMPLATE_SECTIONS));
  }, [open, template]);

  const errors = useMemo(() => validateTemplate({ name, sections }), [name, sections]);
  const counts = useMemo(() => countTemplateItems(sections), [sections]);

  const patchSection = (sIdx: number, patch: Partial<TemplateSection>) => setSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, ...patch } : s)));
  const patchItem = (sIdx: number, iIdx: number, patch: Partial<TemplateItem>) =>
    setSections((prev) => prev.map((s, i) => (i === sIdx ? { ...s, items: s.items.map((it, j) => (j === iIdx ? { ...it, ...patch } : it)) } : s)));

  const submit = async () => {
    if (errors.length) {
      setShowErrors(true);
      return;
    }
    await onSubmit({
      name,
      vessel_id: vesselId === 'all' ? null : vesselId,
      applicable_departments: departments,
      sections: sections.map((s) => ({ section: s.section.trim(), items: s.items.map((i) => ({ ...i, title: i.title.trim() })) })),
      is_default: isDefault,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>{template ? 'Edit template' : 'New onboarding template'}</DialogTitle>
          <DialogDescription>
            Sections and items are exploded into a checklist when onboarding starts. Due offsets are days relative to the start date (negative = before joining).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] px-6">
          <div className="space-y-5 pb-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-name">Name</Label>
                <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Standard crew induction" />
              </div>
              <div className="space-y-1.5">
                <Label>Vessel</Label>
                <Select value={vesselId} onValueChange={setVesselId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any vessel (company-wide)</SelectItem>
                    {vessels.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Applicable departments</Label>
              <div className="flex flex-wrap gap-3">
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={departments.includes(d)} onCheckedChange={(v) => setDepartments((prev) => (v ? [...prev, d] : prev.filter((x) => x !== d)))} />
                    {d}
                  </label>
                ))}
                <span className="text-xs text-muted-foreground self-center">Leave empty for all departments.</span>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isDefault} onCheckedChange={(v) => setIsDefault(Boolean(v))} />
              Use as the company default when no vessel-specific template matches
            </label>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Sections <span className="font-normal text-muted-foreground">· {counts.total} items, {counts.required} required</span></h3>
                <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => setSections((prev) => [...prev, { section: '', items: [emptyItem()] }])}>
                  <Plus className="h-4 w-4" /> Section
                </Button>
              </div>

              {sections.map((section, sIdx) => (
                <div key={sIdx} className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <Input value={section.section} onChange={(e) => patchSection(sIdx, { section: e.target.value })} placeholder="Section name (e.g. Before joining)" className="h-8" />
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={sIdx === 0} onClick={() => setSections((p) => move(p, sIdx, sIdx - 1))} aria-label="Move section up"><ChevronUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={sIdx === sections.length - 1} onClick={() => setSections((p) => move(p, sIdx, sIdx + 1))} aria-label="Move section down"><ChevronDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setSections((p) => p.filter((_, i) => i !== sIdx))} aria-label="Remove section"><Trash2 className="h-4 w-4" /></Button>
                  </div>

                  <div className="space-y-2">
                    {section.items.map((item, iIdx) => (
                      <div key={iIdx} className="grid grid-cols-[1fr_auto] gap-2 md:grid-cols-[1fr_120px_90px_auto_auto]">
                        <Input value={item.title} onChange={(e) => patchItem(sIdx, iIdx, { title: e.target.value })} placeholder="Item title" className="h-8 col-span-2 md:col-span-1" />
                        <Select value={item.owner} onValueChange={(v) => patchItem(sIdx, iIdx, { owner: v as OnboardingOwner })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{ONBOARDING_OWNERS.map((o) => <SelectItem key={o} value={o}>{OWNER_LABELS[o]}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input
                          type="number"
                          value={item.due_offset_days}
                          onChange={(e) => patchItem(sIdx, iIdx, { due_offset_days: Number(e.target.value) })}
                          className="h-8"
                          aria-label="Due offset in days"
                          title="Days from start date"
                        />
                        <label className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <Checkbox checked={item.required} onCheckedChange={(v) => patchItem(sIdx, iIdx, { required: Boolean(v) })} /> Required
                        </label>
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" onClick={() => patchSection(sIdx, { items: section.items.filter((_, j) => j !== iIdx) })} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => patchSection(sIdx, { items: [...section.items, emptyItem()] })}>
                      <Plus className="h-3.5 w-3.5" /> Add item
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {showErrors && errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <ul className="list-disc pl-4 text-xs space-y-0.5">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </AlertDescription>
              </Alert>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {template ? 'Save template' : 'Create template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TemplateEditorDialog;
