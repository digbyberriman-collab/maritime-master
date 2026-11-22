import React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocumentCategories, DocumentFilters as Filters } from '@/modules/documents/hooks/useDocuments';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { DOCUMENT_STATUSES, ISM_SECTIONS } from '@/modules/documents/constants';
import { X, ClipboardList, Settings, FileText, BarChart3, BookOpen, Award } from 'lucide-react';
import { StatusPill } from '@/shared/components/status';
import { activeFilterCount } from '@/modules/documents/lib/documentFilters';

const iconMap: Record<string, React.ReactNode> = {
  'clipboard-list': <ClipboardList className="w-4 h-4" />,
  'settings': <Settings className="w-4 h-4" />,
  'file-text': <FileText className="w-4 h-4" />,
  'bar-chart-3': <BarChart3 className="w-4 h-4" />,
  'book-open': <BookOpen className="w-4 h-4" />,
  'award': <Award className="w-4 h-4" />,
};

interface DocumentFiltersProps {
  filters: Filters;
  onFiltersChange: (filters: Filters) => void;
  /**
   * `sidebar` (default): the 256 px column beside the list on wide screens.
   * `panel`: the same controls in a sheet on phones and tablets; the sheet
   * scrolls, so no inner scroll area and no fixed width.
   */
  variant?: 'sidebar' | 'panel';
}

const DocumentFilters: React.FC<DocumentFiltersProps> = ({ filters, onFiltersChange, variant = 'sidebar' }) => {
  const { data: categories = [] } = useDocumentCategories();
  const { vessels = [] } = useVessels();

  const handleCategoryToggle = (categoryId: string) => {
    const newCategories = filters.categories.includes(categoryId)
      ? filters.categories.filter((c) => c !== categoryId)
      : [...filters.categories, categoryId];
    onFiltersChange({ ...filters, categories: newCategories });
  };

  const handleStatusToggle = (status: string) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onFiltersChange({ ...filters, statuses: newStatuses });
  };

  const handleIsmSectionToggle = (section: number) => {
    const newSections = filters.ismSections.includes(section)
      ? filters.ismSections.filter((s) => s !== section)
      : [...filters.ismSections, section];
    onFiltersChange({ ...filters, ismSections: newSections });
  };

  const handleVesselChange = (value: string) => {
    onFiltersChange({ ...filters, vesselId: value === 'all' ? null : value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      search: '',
      categories: [],
      statuses: [],
      ismSections: [],
      vesselId: null,
    });
  };

  const hasActiveFilters = activeFilterCount(filters) > 0;

  const body = (
        <div className="space-y-6">
          {/* Categories */}
          <div>
            <h3 className="type-eyebrow mb-3 text-muted-foreground">Categories</h3>
            <div className="space-y-2">
              {categories.map((category) => (
                <div key={category.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`category-${category.id}`}
                    checked={filters.categories.includes(category.id)}
                    onCheckedChange={() => handleCategoryToggle(category.id)}
                  />
                  <Label
                    htmlFor={`category-${category.id}`}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <span style={{ color: category.color }}>
                      {iconMap[category.icon] || <FileText className="w-4 h-4" />}
                    </span>
                    {category.name}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <h3 className="type-eyebrow mb-3 text-muted-foreground">Status</h3>
            <div className="space-y-2">
              {DOCUMENT_STATUSES.map((status) => (
                <div key={status.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status.value}`}
                    checked={filters.statuses.includes(status.value)}
                    onCheckedChange={() => handleStatusToggle(status.value)}
                  />
                  <Label htmlFor={`status-${status.value}`} className="flex cursor-pointer items-center gap-2 text-sm">
                    <StatusPill domain="document" status={status.value} />
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Vessel */}
          <div>
            <h3 className="type-eyebrow mb-3 text-muted-foreground">Vessel</h3>
            <Select value={filters.vesselId || 'all'} onValueChange={handleVesselChange}>
              <SelectTrigger aria-label="Vessel" className="bg-background">
                <SelectValue placeholder="All Vessels" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Vessels</SelectItem>
                {vessels.map((vessel) => (
                  <SelectItem key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* ISM Sections */}
          <div>
            <h3 className="type-eyebrow mb-3 text-muted-foreground">ISM Section</h3>
            <div className="space-y-2">
              {ISM_SECTIONS.map((section) => (
                <div key={section.value} className="flex min-w-0 items-center space-x-2">
                  <Checkbox
                    id={`ism-${section.value}`}
                    checked={filters.ismSections.includes(section.value)}
                    onCheckedChange={() => handleIsmSectionToggle(section.value)}
                  />
                  <Label
                    htmlFor={`ism-${section.value}`}
                    className="min-w-0 cursor-pointer truncate text-sm"
                    title={section.label}
                  >
                    {section.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
  );

  const header = (
    <div className="mb-4 flex min-h-8 items-center justify-between gap-2">
      <h2 className="type-subtitle text-foreground">Filters</h2>
      {hasActiveFilters && (
        <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2 [@media(pointer:coarse)]:min-h-11">
          <X aria-hidden="true" className="mr-1 h-4 w-4" />
          Clear all
        </Button>
      )}
    </div>
  );

  if (variant === 'panel') {
    return (
      <div data-document-filters="panel">
        {header}
        {body}
      </div>
    );
  }

  return (
    <aside aria-label="Document filters" className="flex h-full w-64 shrink-0 flex-col border-r border-border p-4">
      {header}
      {/* A plain scroller, not ScrollArea: its table-layout viewport let long ISM labels and the vessel select overflow the column. */}
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">{body}</div>
    </aside>
  );
};

export default DocumentFilters;
