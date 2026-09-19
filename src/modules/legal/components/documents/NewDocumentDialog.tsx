import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DOCUMENT_CATEGORIES, DOCUMENT_TYPES, TEMPLATE_DEPARTMENTS } from '@/modules/legal/lib/constants';
import { parseTags } from '@/modules/legal/lib/requests';
import type { CreateTemplateArgs } from '@/modules/legal/hooks/useLegalDocuments';

interface NewDocumentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (args: CreateTemplateArgs) => Promise<unknown>;
  isPending?: boolean;
  defaultType?: 'template' | 'form';
}

export const NewDocumentDialog: React.FC<NewDocumentDialogProps> = ({ open, onOpenChange, onCreate, isPending, defaultType = 'template' }) => {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>(defaultType);
  const [category, setCategory] = useState('general');
  const [department, setDepartment] = useState('Legal');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [gate, setGate] = useState(false);
  const [validity, setValidity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setType(defaultType);
    setCategory('general');
    setDepartment('Legal');
    setDescription('');
    setTags([]);
    setTagInput('');
    setGate(false);
    setValidity('');
    setError(null);
  };

  const addTags = () => {
    if (!tagInput.trim()) return;
    setTags(parseTags(tagInput, tags));
    setTagInput('');
  };

  const submit = async () => {
    if (name.trim().length < 2) {
      setError('Give the document a name');
      return;
    }
    const months = validity.trim() === '' ? null : Number(validity);
    if (months !== null && (!Number.isInteger(months) || months <= 0)) {
      setError('Validity must be a whole number of months');
      return;
    }
    await onCreate({ name, document_type: type, category, department, description, tags, is_prerequisite_gate: gate, validity_months: months });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New document</DialogTitle>
          <DialogDescription>Creates the template with an empty version 1. You can start writing straight away.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-name">Name *</Label>
            <Input id="doc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Crew Non-Disclosure Agreement" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Type</Label>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Document type">
              {DOCUMENT_TYPES.map((t) => {
                const Icon = t.icon;
                const selected = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(t.value)}
                    className={`flex items-start gap-2 rounded-md border p-3 text-left text-sm transition-colors ${selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/50'}`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span>
                      <span className="block font-medium text-foreground">{t.label}</span>
                      <span className="block text-xs text-muted-foreground">{t.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger aria-label="Category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={setDepartment}>
                <SelectTrigger aria-label="Department">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_DEPARTMENTS.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-description">Description</Label>
            <Textarea id="doc-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="What it is for and when to use it." />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="doc-tags">Tags</Label>
            <div className="flex gap-2">
              <Input
                id="doc-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    addTags();
                  }
                }}
                placeholder="Type a tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTags}>
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" aria-label={`Remove tag ${t}`} onClick={() => setTags(tags.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-start gap-2 pt-5">
              <Checkbox id="doc-gate" checked={gate} onCheckedChange={(v) => setGate(v === true)} />
              <Label htmlFor="doc-gate" className="text-sm font-normal leading-snug">
                Prerequisite gate
                <span className="block text-xs text-muted-foreground">Signing is required before another part of the app unlocks.</span>
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-validity">Re-sign every (months)</Label>
              <Input id="doc-validity" inputMode="numeric" value={validity} onChange={(e) => setValidity(e.target.value)} placeholder="Leave blank for never" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={isPending}>
            {isPending ? 'Creating…' : 'Create document'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewDocumentDialog;
