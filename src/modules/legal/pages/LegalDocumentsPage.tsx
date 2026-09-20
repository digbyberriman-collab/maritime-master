import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLegalAccess } from '@/modules/auth/hooks/useLegalAccess';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { DocumentTable } from '@/modules/legal/components/documents/DocumentTable';
import { NewDocumentDialog } from '@/modules/legal/components/documents/NewDocumentDialog';
import { useLegalDocuments, useLegalDocumentSearch, type LegalTemplateRow } from '@/modules/legal/hooks/useLegalDocuments';
import { DOCUMENT_CATEGORIES, TEMPLATE_STATUSES } from '@/modules/legal/lib/constants';
import { errorMessage } from '@/modules/legal/lib/storage';

const useDebounced = (value: string, ms: number) => {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
};

const LegalDocumentsPage: React.FC = () => {
  const access = useLegalAccess();
  const { templates, isLoading, error, createTemplate, deleteTemplate } = useLegalDocuments();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState('all');
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LegalTemplateRow | null>(null);
  const debounced = useDebounced(search, 300);
  const contentSearch = useLegalDocumentSearch(debounced);

  const hits = useMemo(() => new Map(contentSearch.hits.map((h) => [h.template_id, h])), [contentSearch.hits]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (status !== 'all' && t.status !== status) return false;
      if (!q) return true;
      const inMeta = `${t.name} ${t.description ?? ''} ${(t.tags ?? []).join(' ')} ${t.department}`.toLowerCase().includes(q);
      return inMeta || hits.has(t.id);
    });
  }, [templates, search, category, status, hits]);

  return (
    <LegalShell
      description="Versioned templates: contracts, waivers, policies and maritime forms. Draft → review → approved."
      actions={
        access.canEdit && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="mr-2 h-4 w-4" /> New document
          </Button>
        )
      }
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load documents</AlertTitle>
          <AlertDescription>{errorMessage(error)}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search names, tags and document content" className="pl-9" aria-label="Search documents" />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="md:w-44" aria-label="Category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {DOCUMENT_CATEGORIES.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="md:w-44" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            {TEMPLATE_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {contentSearch.isFetching && <p className="text-xs text-muted-foreground">Searching document content…</p>}
      <DocumentTable
        rows={rows}
        isLoading={isLoading}
        canEdit={access.canEdit}
        onDelete={setPendingDelete}
        hits={hits}
        emptyText={templates.length === 0 ? (access.canEdit ? 'No documents yet. Create the first template.' : 'The legal team has not published any documents yet.') : 'No documents match.'}
      />

      <NewDocumentDialog open={creating} onOpenChange={setCreating} onCreate={(args) => createTemplate.mutateAsync(args)} isPending={createTemplate.isPending} />

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{pendingDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>Every version and every form submission made against it will be removed. Archive it instead if it is still referenced anywhere.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingDelete) deleteTemplate.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </LegalShell>
  );
};

export default LegalDocumentsPage;
