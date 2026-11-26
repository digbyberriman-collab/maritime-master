import React from 'react';
import { Check, ChevronsUpDown, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import type { DocumentCatalogue, DocumentType } from '@/modules/crew/hooks/useDocumentTypes';
import { typeDetail } from './cellLook';

/**
 * A searchable document type picker (the add-qualification dialog's
 * options, the equivalence drawer's two sides): every active type of the
 * catalogue the reader may use, grouped by category, searched by name, code,
 * abbreviation and regulation. Types in `exclude` are not offered.
 */
export function DocumentTypeCombobox({
  catalogue,
  value,
  onChange,
  label,
  placeholder = 'Choose a document type',
  exclude,
  disabled,
  id,
  className,
}: {
  catalogue: DocumentCatalogue;
  value: string | null;
  onChange: (type: DocumentType) => void;
  label: string;
  placeholder?: string;
  exclude?: ReadonlySet<string>;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = value ? catalogue.byId.get(value) ?? null : null;
  const groups = React.useMemo(
    () =>
      catalogue.categories
        .filter((c) => c.isActive)
        .map((c) => ({ category: c, types: catalogue.types.filter((t) => t.isActive && t.categoryKey === c.key && !exclude?.has(t.id)) }))
        .filter((g) => g.types.length > 0),
    [catalogue, exclude],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={disabled}
          className={cn('w-full min-w-0 justify-between font-normal', className)}
        >
          <span className={cn('flex min-w-0 items-center gap-2', !selected && 'text-muted-foreground')}>
            <FileText aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span className="truncate">{selected ? selected.name : placeholder}</span>
          </span>
          <ChevronsUpDown aria-hidden="true" className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
        <Command filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0)}>
          <CommandInput placeholder="Search name, code or regulation" />
          <CommandList>
            <CommandEmpty>No document type matches.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.category.key} heading={g.category.label}>
                {g.types.map((t) => {
                  const detail = typeDetail(t);
                  return (
                    <CommandItem
                      key={t.id}
                      value={`${t.name} ${t.code ?? ''} ${t.abbreviation ?? ''} ${t.stcwReference ?? ''} ${t.id}`}
                      onSelect={() => {
                        onChange(t);
                        setOpen(false);
                      }}
                    >
                      <Check aria-hidden="true" className={cn('mr-2 h-4 w-4 shrink-0', value === t.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{t.name}</span>
                        {detail ? <span className="truncate text-xs text-muted-foreground">{detail}</span> : null}
                      </span>
                      {t.companyId ? <span className="ml-2 shrink-0 text-xs text-muted-foreground">Company</span> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default DocumentTypeCombobox;
