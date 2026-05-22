import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
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
import { useDocuments } from '@/modules/documents/hooks/useDocuments';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import {
  BookOpen,
  Plus,
  Search,
  FileText,
  Download,
  Eye,
  Clock,
  CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';

const SOPsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  // useDocuments requires filters parameter
  const { data: documents = [], isLoading } = useDocuments({
    search: '',
    categories: [],
    statuses: [],
    ismSections: [],
    vesselId: null,
  });

  // Filter documents that are SOPs/procedures
  const sopDocuments = documents.filter(
    d => d.category?.name?.toLowerCase().includes('sop') || 
         d.category?.name?.toLowerCase().includes('procedure') ||
         d.title?.toLowerCase().includes('sop') ||
         d.title?.toLowerCase().includes('procedure')
  );

  const filteredDocuments = sopDocuments.filter((doc) => {
    const matchesSearch = searchQuery === '' || 
      doc.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === 'all' || doc.category?.id === categoryFilter;
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  // Get unique categories
  const categories = [...new Set(sopDocuments.map(d => d.category?.name).filter(Boolean))];

  // Stats
  const activeSOPs = sopDocuments.filter(d => d.status === 'active' || d.status === 'approved').length;
  const pendingReview = sopDocuments.filter(d => d.status === 'pending_review').length;
  const totalSOPs = sopDocuments.length;

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
      case 'approved':
        return <Badge className="bg-green-500 text-white">Active</Badge>;
      case 'pending_review':
        return <Badge className="bg-yellow-500 text-white">Pending Review</Badge>;
      case 'draft':
        return <Badge variant="secondary">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status || 'Unknown'}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          icon={<BookOpen className="w-6 h-6" />}
          title="Standard Operating Procedures"
          description="Manage and access vessel SOPs and operational procedures"
          actions={
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              New SOP
            </Button>
          }
        />

        <StatGrid cols={3}>
          <StatCard
            label="Active SOPs"
            value={activeSOPs}
            icon={<CheckCircle className="w-4 h-4 text-green-500" />}
            tone="success"
            hint="Currently in effect"
          />
          <StatCard
            label="Pending Review"
            value={pendingReview}
            icon={<Clock className="w-4 h-4 text-yellow-500" />}
            tone={pendingReview > 0 ? 'warning' : 'default'}
            hint="Awaiting approval"
          />
          <StatCard
            label="Total Procedures"
            value={totalSOPs}
            icon={<FileText className="w-4 h-4 text-blue-500" />}
            hint="All SOPs"
          />
        </StatGrid>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search SOPs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat as string} value={cat as string}>
                      {cat as string}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending_review">Pending Review</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* SOPs Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading SOPs...</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No SOPs found</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first Standard Operating Procedure
                </p>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  New SOP
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{doc.title}</span>
                        </div>
                      </TableCell>
                      <TableCell>{doc.category?.name || '-'}</TableCell>
                      <TableCell>v{doc.revision || '1.0'}</TableCell>
                      <TableCell>
                        {doc.updated_at && format(new Date(doc.updated_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status || '')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" title="View">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Download">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SOPsPage;
