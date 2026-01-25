import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import DocumentFilters from '@/components/documents/DocumentFilters';
import DocumentCard from '@/components/documents/DocumentCard';
import DocumentTable from '@/components/documents/DocumentTable';
import UploadDocumentModal from '@/components/documents/UploadDocumentModal';
import DeleteDocumentDialog from '@/components/documents/DeleteDocumentDialog';
import DocumentViewerModal from '@/components/documents/DocumentViewerModal';
import { useDocuments, Document, DocumentFilters as Filters } from '@/hooks/useDocuments';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Search,
  Upload,
  LayoutGrid,
  List,
  FileText,
  ClipboardList,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';
type SortOption = 'title' | 'updated_at' | 'document_number' | 'next_review_date';

const Documents: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('updated_at');
  const [filters, setFilters] = useState<Filters>({
    search: '',
    categories: [],
    statuses: [],
    ismSections: [],
    vesselId: null,
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  const { data: documents = [], isLoading } = useDocuments(filters);

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

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-8rem)]">
        {/* Sidebar Filters */}
        <DocumentFilters filters={filters} onFiltersChange={setFilters} />

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="p-4 lg:p-6 border-b border-border bg-card">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h1 className="text-2xl font-bold text-foreground">Documents</h1>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="hidden sm:flex">
                  <ClipboardList className="w-4 h-4 mr-2" />
                  Master Document Index
                </Button>
                <Button onClick={() => setUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </div>

            {/* Search and Controls */}
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search by title, number, or tag..."
                  value={filters.search}
                  onChange={handleSearchChange}
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="w-[180px] bg-background">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="updated_at">Date (Newest first)</SelectItem>
                    <SelectItem value="title">Title (A-Z)</SelectItem>
                    <SelectItem value="document_number">Document Number</SelectItem>
                    <SelectItem value="next_review_date">Next Review Date</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center border rounded-md">
                  <Button
                    variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="rounded-r-none"
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'secondary' : 'ghost'}
                    size="icon"
                    className="rounded-l-none"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* Document List/Grid */}
          <div className="flex-1 overflow-auto p-4 lg:p-6">
            {isLoading ? (
              viewMode === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              ) : (
                <Skeleton className="h-96" />
              )
            ) : sortedDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <FileText className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No documents found</h3>
                <p className="text-muted-foreground mb-4">
                  {filters.search || filters.categories.length > 0 || filters.statuses.length > 0
                    ? 'Try adjusting your filters or search terms'
                    : 'Upload your first document to get started.'}
                </p>
                <Button onClick={() => setUploadModalOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedDocuments.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    document={doc}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDownload={handleDownload}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
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
      </div>

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
