import React from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import type { CrewDocumentTab } from '@/modules/crew/types/db.pending';
import { searchDocumentTypes, type DocumentCatalogue, type DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import { CREW_DOCUMENT_TABS, CREW_DOCUMENT_TAB_LABEL } from '@/modules/crew/lib/documentTabs';

export interface DocumentTypePickerProps {
  catalogue: DocumentCatalogue;
  /** The tab the dialog opened from; its categories show first. */
  tab: CrewDocumentTab;
  /** A category to open on (a group's "+ Add"). */
  initialCategory?: string | null;
  /** How many documents of each type the person holds (the "Added" tiles). */
  held: ReadonlyMap<string, number>;
  onPick: (type: DocumentType) => void;
}

const ALL = '__all__';

const chip = (active: boolean) =>
  cn(
    'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 type-caption font-medium transition-colors duration-quick ease-tide',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11',
    active ? 'border-primary bg-signal-muted text-primary' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  );

/** What a tile says under the name: code or abbreviation and the STCW regulation. */
function typeDetail(type: DocumentType): string | null {
  const parts = [type.abbreviation && type.abbreviation !== type.name ? type.abbreviation : type.code, type.stcwReference].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? [...new Set(parts)].join(' · ') : null;
}

/**
 * Step 1 of the add-document dialog (gap/04 C25): search across every
 * document type by name, code, abbreviation or STCW regulation; or browse a
 * profile tab's categories (each with its number of types). Types the person
 * already holds are marked Added (a second one, a second passport say, can
 * still be added). A search runs over all three tabs and says where a type
 * is filed, because the tab is the type's (T-185), never the one the dialog
 * was opened from.
 */
export const DocumentTypePicker: React.FC<DocumentTypePickerProps> = ({ catalogue, tab: initialTab, initialCategory, held, onPick }) => {
  const [query, setQuery] = React.useState('');
  const [tab, setTab] = React.useState<CrewDocumentTab>(() => {
    const cat = catalogue.categories.find((c) => c.key === initialCategory);
    return cat?.tab ?? initialTab;
  });
  const [category, setCategory] = React.useState<string>(initialCategory ?? ALL);
  const searchId = React.useId();

  const active = React.useMemo(() => catalogue.types.filter((t) => t.isActive), [catalogue.types]);
  const tabCounts = React.useMemo(() => {
    const counts: Record<CrewDocumentTab, number> = { documents: 0, stcw: 0, qualifications: 0 };
    for (const t of active) counts[t.tab] += 1;
    return counts;
  }, [active]);
  const categories = React.useMemo(
    () =>
      catalogue.categories
        .filter((c) => c.isActive && c.tab === tab)
        .map((c) => ({ category: c, count: active.filter((t) => t.categoryKey === c.key).length }))
        .filter((c) => c.count > 0),
    [catalogue.categories, active, tab],
  );
  const searching = query.trim() !== '';
  const results = React.useMemo(() => {
    if (searching) return searchDocumentTypes(active, query);
    return active.filter((t) => t.tab === tab && (category === ALL || t.categoryKey === category));
  }, [active, query, searching, tab, category]);
  const categoryLabel = React.useMemo(() => new Map(catalogue.categories.map((c) => [c.key, c.label])), [catalogue.categories]);

  // Group the browse list by category, in catalogue order; a search stays one ranked list.
  const groups = React.useMemo(() => {
    if (searching) return [{ key: 'results', label: null as string | null, types: results }];
    const order = catalogue.categories.map((c) => c.key);
    const by = new Map<string, DocumentType[]>();
    for (const t of results) by.set(t.categoryKey, [...(by.get(t.categoryKey) ?? []), t]);
    return [...by.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([key, types]) => ({ key, label: categoryLabel.get(key) ?? key, types }));
  }, [results, searching, catalogue.categories, categoryLabel]);

  return (
    <div className="flex min-h-0 min-w-0 flex-col gap-3" data-document-picker="">
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          Search document types
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, code or abbreviation"
          className="pl-9 [@media(pointer:coarse)]:h-11"
          autoComplete="off"
          autoFocus
        />
      </div>

      {!searching ? (
        <>
          <div role="group" aria-label="Profile tab" className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap">
            {CREW_DOCUMENT_TABS.map((t) => (
              <button
                key={t}
                type="button"
                className={cn(chip(t === tab), 'justify-center px-2 sm:px-3')}
                aria-pressed={t === tab}
                aria-label={`${CREW_DOCUMENT_TAB_LABEL[t]}, ${tabCounts[t]} types`}
                onClick={() => {
                  setTab(t);
                  setCategory(ALL);
                }}
              >
                {CREW_DOCUMENT_TAB_LABEL[t]}
                <span className="hidden tabular-nums opacity-80 sm:inline">{tabCounts[t]}</span>
              </button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Category"
            className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto overscroll-x-contain px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible"
          >
            <button type="button" className={chip(category === ALL)} aria-pressed={category === ALL} onClick={() => setCategory(ALL)}>
              All categories
              <span className="tabular-nums opacity-80">{tabCounts[tab]}</span>
            </button>
            {categories.map(({ category: c, count }) => (
              <button key={c.key} type="button" className={chip(category === c.key)} aria-pressed={category === c.key} onClick={() => setCategory(c.key)}>
                {c.label}
                <span className="tabular-nums opacity-80">{count}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="type-caption text-muted-foreground" aria-live="polite">
          {results.length === 0 ? `No document type matches “${query.trim()}”.` : `${results.length} ${results.length === 1 ? 'type matches' : 'types match'} across all tabs.`}
        </p>
      )}

      <div className="min-w-0 space-y-4">
        {groups.map((g) =>
          g.types.length === 0 ? null : (
            <section key={g.key} aria-label={g.label ?? 'Matching document types'} className="min-w-0">
              {g.label ? <h3 className="mb-2 type-eyebrow text-muted-foreground">{g.label}</h3> : null}
              <ul className="grid min-w-0 gap-2 sm:grid-cols-2">
                {g.types.map((t) => {
                  const count = held.get(t.id) ?? 0;
                  const detail = typeDetail(t);
                  return (
                    <li key={t.id} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => onPick(t)}
                        data-document-type={t.key}
                        data-added={count > 0 ? 'true' : undefined}
                        className={cn(
                          'flex h-full min-h-11 w-full min-w-0 items-start gap-3 rounded-md border px-3 py-2.5 text-left transition-colors duration-quick ease-tide',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          count > 0 ? 'border-success/40 bg-success-muted/40 hover:bg-success-muted' : 'border-border hover:bg-muted',
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block break-words type-body font-medium text-foreground">{t.name}</span>
                          {detail || searching ? (
                            <span className="mt-0.5 block break-words type-caption text-muted-foreground">
                              {[detail, searching ? `${CREW_DOCUMENT_TAB_LABEL[t.tab]} · ${categoryLabel.get(t.categoryKey) ?? t.categoryKey}` : null].filter(Boolean).join(' · ')}
                            </span>
                          ) : null}
                        </span>
                        {count > 0 ? (
                          <span className="inline-flex shrink-0 items-center gap-1 type-caption font-semibold text-success">
                            <Check aria-hidden="true" className="size-3.5" />
                            {count > 1 ? `Added ×${count}` : 'Added'}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
        {!searching && results.length === 0 ? <p className="type-body text-muted-foreground">No document types in this category.</p> : null}
      </div>
    </div>
  );
};

export default DocumentTypePicker;
