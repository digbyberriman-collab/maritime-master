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
import { useDocumentCategories, DocumentFilters as Filters } from '@/hooks/useDocuments';
import { useVessels } from '@/hooks/useVessels';
import { DOCUMENT_STATUSES, ISM_SECTIONS } from '@/lib/documentConstants';
import { X, ClipboardList, Settings, FileText, BarChart3, BookOpen, Award } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

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
}

const DocumentFilters: React.FC<DocumentFiltersProps> = ({ filters, onFiltersChange }) => {
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

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.statuses.length > 0 ||
    filters.ismSections.length > 0 ||
    filters.vesselId !== null;

  return (
    <aside className="w-64 border-r border-border bg-card p-4 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Filters</h3>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearAllFilters} className="h-8 px-2">
            <X className="w-4 h-4 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6">
          {/* Categories */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Categories</h4>
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
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Status</h4>
            <div className="space-y-2">
              {DOCUMENT_STATUSES.map((status) => (
                <div key={status.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`status-${status.value}`}
                    checked={filters.statuses.includes(status.value)}
                    onCheckedChange={() => handleStatusToggle(status.value)}
                  />
                  <Label
                    htmlFor={`status-${status.value}`}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <span className={`px-2 py-0.5 rounded text-xs ${status.color}`}>
                      {status.label}
                    </span>
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Vessel */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Vessel</h4>
            <Select value={filters.vesselId || 'all'} onValueChange={handleVesselChange}>
              <SelectTrigger className="bg-background">
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
            <h4 className="text-sm font-medium text-muted-foreground mb-3">ISM Section</h4>
            <div className="space-y-2">
              {ISM_SECTIONS.map((section) => (
                <div key={section.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`ism-${section.value}`}
                    checked={filters.ismSections.includes(section.value)}
                    onCheckedChange={() => handleIsmSectionToggle(section.value)}
                  />
                  <Label
                    htmlFor={`ism-${section.value}`}
                    className="text-sm cursor-pointer truncate"
                    title={section.label}
                  >
                    {section.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScrollArea>
    </aside>
  );
};

export default DocumentFilters;
