import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import PageHeader from '@/shared/components/layout/PageHeader';
import DocumentFilters from '@/modules/documents/components/DocumentFilters';
import DocumentCard from '@/modules/documents/components/DocumentCard';
import DocumentTable from '@/modules/documents/components/DocumentTable';
import UploadDocumentModal from '@/modules/documents/components/UploadDocumentModal';
import DeleteDocumentDialog from '@/modules/documents/components/DeleteDocumentDialog';
import DocumentViewerModal from '@/modules/documents/components/DocumentViewerModal';
import { useDocuments, Document, DocumentFilters as Filters } from '@/modules/documents/hooks/useDocuments';
import { activeFilterCount, EMPTY_DOCUMENT_FILTERS } from '@/modules/documents/lib/documentFilters';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/states';
import { TABLET_MIN_WIDTH, useMinWidth } from '@/shared/components/data';
import { cn } from '@/lib/utils';
import {
  Search,
  Upload,
  LayoutGrid,
  List,
  FileText,
  ClipboardList,
  SlidersHorizontal,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';
type SortOption = 'title' | 'updated_at' | 'document_number' | 'next_review_date';

/** The filter column sits beside the list from this width; below it the filters open in a sheet. */
const FILTER_COLUMN_MIN_WIDTH = 1024;

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('updated_at');
  const [filters, setFilters] = useState<Filters>(EMPTY_DOCUMENT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Below 768 px the register is always cards (a table cannot fit 390 px);
  // the list toggle only shows where the table fits.
  const isTablet = useMinWidth(TABLET_MIN_WIDTH);
  const hasFilterColumn = useMinWidth(FILTER_COLUMN_MIN_WIDTH);
  const effectiveView: ViewMode = isTablet ? viewMode : 'grid';

  const { data: documents = [], isLoading } = useDocuments(filters);
  const filterCount = activeFilterCount(filters);

  // Sort documents
  const sortedDocuments = useMemo(() => {
    return [...documents].sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'document_number':
          return a.document_number.localeCompare(b.document_number);
        case 'next_review_date':
          if (!a.next_review_date && !b.next_review_date) return 0;
          if (!a.next_review_date) return 1;
          if (!b.next_review_date) return -1;
          return new Date(a.next_review_date).getTime() - new Date(b.next_review_date).getTime();
        case 'updated_at':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });
  }, [documents, sortBy]);

  const handleView = (doc: Document) => {
    setSelectedDocument(doc);
    setViewModalOpen(true);
  };

  const handleEdit = (doc: Document) => {
    // TODO: Implement edit modal
    console.log('Edit document:', doc);
  };

  const handleDownload = (doc: Document) => {
    window.open(doc.file_url, '_blank');
  };

  const handleDelete = (doc: Document) => {
    setSelectedDocument(doc);
    setDeleteDialogOpen(true);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFilters({ ...filters, search: e.target.value });
  };

  const isFiltered = Boolean(filters.search) || filterCount > 0;

  return (
    <DashboardLayout>
      <PageHeader
        className="max-sm:flex-col max-sm:items-stretch"
        title="Documents"
        description="Controlled manuals, procedures, policies and drawings for the fleet."
        actions={
          <>
            <Button variant="outline" className="hidden sm:inline-flex" onClick={() => navigate('/documents/master-index')}>
              <ClipboardList aria-hidden="true" className="mr-2 h-4 w-4" />
              Master document index
            </Button>
            <Button onClick={() => setUploadModalOpen(true)}>
              <Upload aria-hidden="true" className="mr-2 h-4 w-4" />
              Upload document
            </Button>
          </>
        }
      />

      <Card className="flex min-w-0 overflow-hidden lg:h-[calc(100dvh-14rem)] lg:min-h-[28rem]">
        {hasFilterColumn ? <DocumentFilters filters={filters} onFiltersChange={setFilters} /> : null}

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar: wraps on narrow screens; controls are 44 px on touch (D-35). */}
          <div role="toolbar" aria-label="Document list controls" className="flex flex-wrap items-center gap-2 border-b border-border p-3 lg:p-4">
            <div className="relative min-w-0 flex-[1_1_16rem]">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                aria-label="Search documents"
                placeholder="Search by title, number or tag…"
                value={filters.search}
                onChange={handleSearchChange}
                className="pl-9"
              />
            </div>

            {!hasFilterColumn ? (
              <Button variant="outline" onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
                <SlidersHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />
                Filters
                {filterCount > 0 ? (
                  <span className="ml-2 rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
                    {filterCount}
                  </span>
                ) : null}
              </Button>
            ) : null}

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger aria-label="Sort documents" className="w-auto min-w-[11rem] flex-1 sm:flex-none">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated_at">Last updated</SelectItem>
                <SelectItem value="title">Title (A–Z)</SelectItem>
                <SelectItem value="document_number">Document number</SelectItem>
                <SelectItem value="next_review_date">Next review date</SelectItem>
              </SelectContent>
            </Select>

            {isTablet ? (
              <div role="group" aria-label="View" className="flex items-center rounded-md border border-input">
                <Button
                  variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-r-none"
                  aria-label="Cards"
                  aria-pressed={viewMode === 'grid'}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid aria-hidden="true" className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="rounded-l-none"
                  aria-label="Table"
                  aria-pressed={viewMode === 'list'}
                  onClick={() => setViewMode('list')}
                >
                  <List aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>

          {/* Document list/grid: scrolls inside the card on desktop, with the page below 1024 px. */}
          <div className="min-w-0 flex-1 p-3 lg:overflow-auto lg:p-4" data-view={effectiveView}>
            {isLoading ? (
              <div role="status" aria-busy="true">
                {effectiveView === 'grid' ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-44" />
                    ))}
                  </div>
                ) : (
                  <Skeleton className="h-96" />
                )}
                <span className="sr-only">Loading documents</span>
              </div>
            ) : sortedDocuments.length === 0 ? (
              <EmptyState
                kind={isFiltered ? 'filtered' : 'first-use'}
                icon={FileText}
                title={isFiltered ? 'No documents match these filters' : 'No documents yet'}
                body={isFiltered ? 'Try other filters or search terms.' : 'Upload your first controlled document to get started.'}
                action={
                  isFiltered ? (
                    <Button variant="outline" onClick={() => setFilters(EMPTY_DOCUMENT_FILTERS)}>
                      Clear filters
                    </Button>
                  ) : (
                    <Button onClick={() => setUploadModalOpen(true)}>
                      <Upload aria-hidden="true" className="mr-2 h-4 w-4" />
                      Upload document
                    </Button>
                  )
                }
              />
            ) : effectiveView === 'grid' ? (
              <ul aria-label="Documents" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {sortedDocuments.map((doc) => (
                  <li key={doc.id} className="min-w-0">
                    <DocumentCard
                      document={doc}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDownload={handleDownload}
                      onDelete={handleDelete}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <DocumentTable
                documents={sortedDocuments}
                onView={handleView}
                onEdit={handleEdit}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            )}
          </div>
        </div>
      </Card>

      {/* Filters below 1024 px: the same controls in a sheet (focus trap, Esc, focus return). */}
      <Sheet open={filtersOpen && !hasFilterColumn} onOpenChange={setFiltersOpen}>
        <SheetContent side="left" className={cn('w-[min(20rem,100vw)] overflow-y-auto')}>
          <SheetHeader className="sr-only">
            <SheetTitle>Document filters</SheetTitle>
            <SheetDescription>Narrow the register by category, status, vessel and ISM section.</SheetDescription>
          </SheetHeader>
          <DocumentFilters filters={filters} onFiltersChange={setFilters} variant="panel" />
        </SheetContent>
      </Sheet>

      {/* Modals */}
      <UploadDocumentModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
      />

      <DocumentViewerModal
        document={selectedDocument}
        open={viewModalOpen}
        onOpenChange={setViewModalOpen}
      />

      <DeleteDocumentDialog
        document={selectedDocument}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </DashboardLayout>
  );
};

export default Documents;
