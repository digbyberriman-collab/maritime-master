import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDocuments, useDocumentCategories, Document } from '@/modules/documents/hooks/useDocuments';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useSavedSearches, SavedSearch } from '@/shared/hooks/useSavedSearches';
import { DOCUMENT_STATUSES, ISM_SECTIONS, LANGUAGES } from '@/modules/documents/constants';
import { format } from 'date-fns';
import {
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  Eye,
  Bookmark,
  BookmarkPlus,
  Trash2,
  Calendar,
} from 'lucide-react';

// Custom debounce hook
const useDebounceValue = <T,>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
};

interface SearchFilters {
  search: string;
  categories: string[];
  statuses: string[];
  vessels: string[];
  ismSections: number[];
  languages: string[];
  authors: string[];
  dateRange: {
    issueFrom?: string;
    issueTo?: string;
    reviewFrom?: string;
    reviewTo?: string;
  };
  mandatoryOnly: boolean;
  tags: string[];
}

const defaultFilters: SearchFilters = {
  search: '',
  categories: [],
  statuses: [],
  vessels: [],
  ismSections: [],
  languages: [],
  authors: [],
  dateRange: {},
  mandatoryOnly: false,
  tags: [],
};

const DocumentSearch: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<SearchFilters>(defaultFilters);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'date-desc' | 'date-asc' | 'title'>('relevance');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [searchName, setSearchName] = useState('');

  const debouncedSearch = useDebounceValue(filters.search, 300);

  const { data: documents = [], isLoading } = useDocuments({
    search: debouncedSearch,
    categories: filters.categories,
    statuses: filters.statuses,
    ismSections: filters.ismSections,
    vesselId: filters.vessels.length === 1 ? filters.vessels[0] : null,
  });
  const { vessels } = useVessels();
  const { data: categories } = useDocumentCategories();
  const { savedSearches, saveSearch, deleteSearch } = useSavedSearches();

  // Extract unique authors from documents
  const authors = useMemo(() => {
    const authorMap = new Map<string, { id: string; name: string }>();
    documents.forEach(doc => {
      if (doc.author) {
        const id = doc.author_id;
        const name = `${doc.author.first_name} ${doc.author.last_name}`;
        authorMap.set(id, { id, name });
      }
    });
    return Array.from(authorMap.values());
  }, [documents]);

  // Further filter and sort results
  const filteredResults = useMemo(() => {
    let results = [...documents];

    // Additional filtering
    if (filters.mandatoryOnly) {
      results = results.filter(doc => doc.is_mandatory_read);
    }

    if (filters.languages.length > 0) {
      results = results.filter(doc => filters.languages.includes(doc.language));
    }

    if (filters.dateRange.issueFrom) {
      results = results.filter(doc =>
        doc.issue_date && doc.issue_date >= filters.dateRange.issueFrom!
      );
    }

    if (filters.dateRange.issueTo) {
      results = results.filter(doc =>
        doc.issue_date && doc.issue_date <= filters.dateRange.issueTo!
      );
    }

    if (filters.dateRange.reviewFrom) {
      results = results.filter(doc =>
        doc.next_review_date && doc.next_review_date >= filters.dateRange.reviewFrom!
      );
    }

    if (filters.dateRange.reviewTo) {
      results = results.filter(doc =>
        doc.next_review_date && doc.next_review_date <= filters.dateRange.reviewTo!
      );
    }

    // Sort
    switch (sortBy) {
      case 'date-desc':
        results.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        break;
      case 'date-asc':
        results.sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime());
        break;
      case 'title':
        results.sort((a, b) => a.title.localeCompare(b.title));
        break;
      // relevance - keep original order from search
    }

    return results;
  }, [documents, filters, sortBy]);

  const toggleArrayFilter = (key: keyof SearchFilters, value: string | number) => {
    const current = filters[key] as (string | number)[];
    const updated = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    setFilters({ ...filters, [key]: updated });
  };

  const clearFilters = () => {
    setFilters(defaultFilters);
  };

  const handleSaveSearch = () => {
    if (searchName.trim()) {
      saveSearch(searchName, filters);
      setSearchName('');
      setSaveDialogOpen(false);
    }
  };

  const applySavedSearch = (saved: SavedSearch) => {
    setFilters(saved.filters);
  };

  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-800 px-0.5 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const activeFilterCount =
    filters.categories.length +
    filters.statuses.length +
    filters.vessels.length +
    filters.ismSections.length +
    filters.languages.length +
    (filters.mandatoryOnly ? 1 : 0) +
    (filters.dateRange.issueFrom ? 1 : 0) +
    (filters.dateRange.issueTo ? 1 : 0) +
    (filters.dateRange.reviewFrom ? 1 : 0) +
    (filters.dateRange.reviewTo ? 1 : 0);

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Saved Searches Sidebar */}
        <div className="w-64 border-r hidden lg:block">
          <div className="p-4 border-b">
            <h3 className="font-semibold flex items-center gap-2">
              <Bookmark className="w-4 h-4" />
              Saved Searches
            </h3>
          </div>
          <ScrollArea className="h-[calc(100%-60px)]">
            <div className="p-4 space-y-2">
              {savedSearches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No saved searches yet. Save your search filters for quick access.
                </p>
              ) : (
                savedSearches.map((search) => (
                  <div
                    key={search.id}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-muted cursor-pointer group"
                    onClick={() => applySavedSearch(search)}
                  >
                    <span className="text-sm truncate">{search.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteSearch(search.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search Header */}
          <div className="p-4 lg:p-6 border-b bg-card">
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input
                  placeholder="Search documents by title, number, description, tags..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-12 h-12 text-lg"
                />
                {filters.search && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setFilters({ ...filters, search: '' })}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <Button variant="outline" onClick={() => setSaveDialogOpen(true)}>
                <BookmarkPlus className="w-4 h-4 mr-2" />
                Save Search
              </Button>
            </div>

            {/* Advanced Filters Toggle */}
            <Collapsible open={filtersExpanded} onOpenChange={setFiltersExpanded}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Advanced Filters
                  {activeFilterCount > 0 && (
                    <Badge variant="secondary">{activeFilterCount}</Badge>
                  )}
                  {filtersExpanded ? (
                    <ChevronUp className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-4 bg-muted/30 rounded-lg">
                  {/* Categories */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Categories</Label>
                    <div className="space-y-2">
                      {categories?.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`cat-${cat.id}`}
                            checked={filters.categories.includes(cat.id)}
                            onCheckedChange={() => toggleArrayFilter('categories', cat.id)}
                          />
                          <label htmlFor={`cat-${cat.id}`} className="text-sm cursor-pointer">
                            {cat.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Status */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Status</Label>
                    <div className="space-y-2">
                      {DOCUMENT_STATUSES.map((status) => (
                        <div key={status.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`status-${status.value}`}
                            checked={filters.statuses.includes(status.value)}
                            onCheckedChange={() => toggleArrayFilter('statuses', status.value)}
                          />
                          <label htmlFor={`status-${status.value}`} className="text-sm cursor-pointer">
                            {status.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Vessels */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Vessels</Label>
                    <div className="space-y-2">
                      {vessels.map((vessel) => (
                        <div key={vessel.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`vessel-${vessel.id}`}
                            checked={filters.vessels.includes(vessel.id)}
                            onCheckedChange={() => toggleArrayFilter('vessels', vessel.id)}
                          />
                          <label htmlFor={`vessel-${vessel.id}`} className="text-sm cursor-pointer">
                            {vessel.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Languages */}
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Languages</Label>
                    <div className="space-y-2">
                      {LANGUAGES.slice(0, 5).map((lang) => (
                        <div key={lang.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`lang-${lang.value}`}
                            checked={filters.languages.includes(lang.value)}
                            onCheckedChange={() => toggleArrayFilter('languages', lang.value)}
                          />
                          <label htmlFor={`lang-${lang.value}`} className="text-sm cursor-pointer">
                            {lang.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Date Ranges */}
                  <div className="col-span-2">
                    <Label className="text-sm font-medium mb-2 block">Date Ranges</Label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-muted-foreground">Issue Date From</label>
                        <Input
                          type="date"
                          value={filters.dateRange.issueFrom || ''}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              dateRange: { ...filters.dateRange, issueFrom: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Issue Date To</label>
                        <Input
                          type="date"
                          value={filters.dateRange.issueTo || ''}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              dateRange: { ...filters.dateRange, issueTo: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Review Date From</label>
                        <Input
                          type="date"
                          value={filters.dateRange.reviewFrom || ''}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              dateRange: { ...filters.dateRange, reviewFrom: e.target.value },
                            })
                          }
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Review Date To</label>
                        <Input
                          type="date"
                          value={filters.dateRange.reviewTo || ''}
                          onChange={(e) =>
                            setFilters({
                              ...filters,
                              dateRange: { ...filters.dateRange, reviewTo: e.target.value },
                            })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Mandatory Only Toggle */}
                  <div className="col-span-2 flex items-center gap-3">
                    <Switch
                      checked={filters.mandatoryOnly}
                      onCheckedChange={(checked) =>
                        setFilters({ ...filters, mandatoryOnly: checked })
                      }
                    />
                    <Label>Mandatory Read Documents Only</Label>
                  </div>
                </div>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-4">
                    <X className="w-4 h-4 mr-2" />
                    Clear All Filters
                  </Button>
                )}
              </CollapsibleContent>
            </Collapsible>
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">
            {/* Results Header */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">
                Found <strong>{filteredResults.length}</strong> document{filteredResults.length !== 1 ? 's' : ''}
              </p>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Relevance</SelectItem>
                  <SelectItem value="date-desc">Date (Newest)</SelectItem>
                  <SelectItem value="date-asc">Date (Oldest)</SelectItem>
                  <SelectItem value="title">Title (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredResults.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No documents found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredResults.map((doc) => {
                  const statusConfig = DOCUMENT_STATUSES.find(s => s.value === doc.status);
                  return (
                    <Card
                      key={doc.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => navigate('/documents')}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="font-mono text-xs">
                                {doc.document_number}
                              </Badge>
                              <Badge
                                variant="outline"
                                style={{ borderColor: doc.category?.color, color: doc.category?.color }}
                              >
                                {doc.category?.name}
                              </Badge>
                              {statusConfig && (
                                <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                              )}
                            </div>
                            <h3 className="font-semibold text-lg mb-1">
                              {highlightText(doc.title, debouncedSearch)}
                            </h3>
                            {doc.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {highlightText(doc.description, debouncedSearch)}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <span>{doc.revision}</span>
                              <span>•</span>
                              <span>{format(new Date(doc.updated_at), 'MMM d, yyyy')}</span>
                              {doc.author && (
                                <>
                                  <span>•</span>
                                  <span>{doc.author.first_name} {doc.author.last_name}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(doc.file_url, '_blank');
                              }}
                            >
                              <Download className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Save Search Dialog */}
        <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Search</DialogTitle>
              <DialogDescription>
                Save your current search and filters for quick access later.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <Label htmlFor="search-name">Search Name</Label>
              <Input
                id="search-name"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
                placeholder="e.g., Safety Procedures 2025"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveSearch} disabled={!searchName.trim()}>
                Save Search
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default DocumentSearch;
