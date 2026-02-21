import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDocuments, useDocumentCategories } from '@/modules/documents/hooks/useDocuments';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { useBranding } from '@/shared/hooks/useBranding';
import { exportMDIToPDF, exportMDIToExcel } from '@/lib/documentExport';
import { DOCUMENT_STATUSES } from '@/modules/documents/constants';
import { format } from 'date-fns';
import {
  FileText,
  Download,
  Printer,
  Search,
  ChevronUp,
  ChevronDown,
  FileSpreadsheet,
} from 'lucide-react';

type SortField = 'document_number' | 'title' | 'category' | 'revision' | 'issue_date' | 'next_review_date' | 'status' | 'author' | 'vessel';
type SortDirection = 'asc' | 'desc';

const MasterDocumentIndex: React.FC = () => {
  const [vesselFilter, setVesselFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('document_number');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const { data: documents = [], isLoading } = useDocuments({
    search: '',
    categories: [],
    statuses: statusFilter === 'active' ? ['Draft', 'Under_Review', 'Approved'] : [],
    ismSections: [],
    vesselId: vesselFilter !== 'all' ? vesselFilter : null,
  });
  const { vessels } = useVessels();
  const { data: categories } = useDocumentCategories();
  const { branding } = useBranding();

  // Filter and search
  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    if (categoryFilter !== 'all') {
      result = result.filter(doc => doc.category_id === categoryFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(doc =>
        doc.document_number.toLowerCase().includes(query) ||
        doc.title.toLowerCase().includes(query) ||
        doc.category?.name.toLowerCase().includes(query) ||
        doc.author?.first_name.toLowerCase().includes(query) ||
        doc.author?.last_name.toLowerCase().includes(query)
      );
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string | number | null = '';
      let bVal: string | number | null = '';

      switch (sortField) {
        case 'document_number':
          aVal = a.document_number;
          bVal = b.document_number;
          break;
        case 'title':
          aVal = a.title;
          bVal = b.title;
          break;
        case 'category':
          aVal = a.category?.name || '';
          bVal = b.category?.name || '';
          break;
        case 'revision':
          aVal = a.revision;
          bVal = b.revision;
          break;
        case 'issue_date':
          aVal = a.issue_date || '';
          bVal = b.issue_date || '';
          break;
        case 'next_review_date':
          aVal = a.next_review_date || '';
          bVal = b.next_review_date || '';
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'author':
          aVal = a.author ? `${a.author.first_name} ${a.author.last_name}` : '';
          bVal = b.author ? `${b.author.first_name} ${b.author.last_name}` : '';
          break;
        case 'vessel':
          aVal = a.vessel?.name || '';
          bVal = b.vessel?.name || '';
          break;
      }

      if (sortDirection === 'asc') {
        return String(aVal).localeCompare(String(bVal));
      }
      return String(bVal).localeCompare(String(aVal));
    });

    return result;
  }, [documents, categoryFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ChevronUp className="w-4 h-4 inline ml-1" />
    ) : (
      <ChevronDown className="w-4 h-4 inline ml-1" />
    );
  };

  const handleExportPDF = () => {
    exportMDIToPDF(
      filteredDocuments,
      branding.client_display_name || branding.name || 'Company',
      {
        vessel: vesselFilter !== 'all' ? vessels.find(v => v.id === vesselFilter)?.name : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categories?.find(c => c.id === categoryFilter)?.name : undefined,
      }
    );
  };

  const handleExportExcel = () => {
    exportMDIToExcel(filteredDocuments, branding.client_display_name || branding.name || 'Company');
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in print:space-y-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Master Document Index
            </h1>
            <p className="text-muted-foreground">
              Complete list of all controlled documents
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleExportPDF}>
              <Download className="w-4 h-4 mr-2" />
              Export PDF
            </Button>
            <Button variant="outline" onClick={handleExportExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Print Header */}
        <div className="hidden print:block">
          <h1 className="text-xl font-bold">Master Document Index</h1>
          <p className="text-sm">{branding.client_display_name || branding.name}</p>
          <p className="text-xs text-muted-foreground">
            Generated: {format(new Date(), 'dd MMM yyyy HH:mm')} | Total: {filteredDocuments.length} documents
          </p>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Vessels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active Only</SelectItem>
                  <SelectItem value="all">Include Obsolete</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Document Count */}
        <div className="text-sm text-muted-foreground print:hidden">
          Showing {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
        </div>

        {/* Table */}
        <Card className="print:shadow-none print:border-0">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                        onClick={() => handleSort('document_number')}
                      >
                        Doc Number <SortIcon field="document_number" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('title')}
                      >
                        Title <SortIcon field="title" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('category')}
                      >
                        Category <SortIcon field="category" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 text-center"
                        onClick={() => handleSort('revision')}
                      >
                        Rev <SortIcon field="revision" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                        onClick={() => handleSort('issue_date')}
                      >
                        Issue Date <SortIcon field="issue_date" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50 whitespace-nowrap"
                        onClick={() => handleSort('next_review_date')}
                      >
                        Next Review <SortIcon field="next_review_date" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('status')}
                      >
                        Status <SortIcon field="status" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('author')}
                      >
                        Owner <SortIcon field="author" />
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort('vessel')}
                      >
                        Vessel <SortIcon field="vessel" />
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDocuments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                          No documents found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredDocuments.map((doc) => {
                        const statusConfig = DOCUMENT_STATUSES.find(s => s.value === doc.status);
                        return (
                          <TableRow key={doc.id} className="print:text-xs">
                            <TableCell className="font-mono text-sm whitespace-nowrap">
                              {doc.document_number}
                            </TableCell>
                            <TableCell className="max-w-[300px]">
                              <span className="line-clamp-2">{doc.title}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                style={{ borderColor: doc.category?.color, color: doc.category?.color }}
                                className="print:border-current"
                              >
                                {doc.category?.name}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge variant="secondary">{doc.revision}</Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {doc.issue_date ? format(new Date(doc.issue_date), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {doc.next_review_date ? format(new Date(doc.next_review_date), 'dd/MM/yyyy') : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${statusConfig?.color} print:bg-transparent print:text-current`}>
                                {statusConfig?.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {doc.author ? `${doc.author.first_name} ${doc.author.last_name}` : '-'}
                            </TableCell>
                            <TableCell>
                              {doc.vessel?.name || 'All'}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default MasterDocumentIndex;
