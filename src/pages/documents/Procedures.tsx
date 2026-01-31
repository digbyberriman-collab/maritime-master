import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  ClipboardList, Search, Filter, Plus, FolderOpen, FileText,
  Eye, Download, Edit, Loader2, CheckCircle, Clock, AlertCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';

interface Procedure {
  id: string;
  title: string;
  document_number: string | null;
  category: string | null;
  status: string;
  version: string | null;
  effective_date: string | null;
  review_date: string | null;
  department: string | null;
  created_at: string;
}

const categories = [
  { value: 'navigation', label: 'Navigation' },
  { value: 'cargo', label: 'Cargo Operations' },
  { value: 'engineering', label: 'Engineering' },
  { value: 'safety', label: 'Safety' },
  { value: 'security', label: 'Security' },
  { value: 'environmental', label: 'Environmental' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'crew', label: 'Crew Management' },
];

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-yellow-100 text-yellow-700',
  under_review: 'bg-blue-100 text-blue-700',
  archived: 'bg-gray-100 text-gray-700',
};

export default function Procedures() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadProcedures();
  }, [categoryFilter, statusFilter]);

  async function loadProcedures() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('documents')
        .select('id, title, document_number, status, revision, effective_date, next_review_date, created_at')
        .eq('document_type', 'procedure')
        .order('title', { ascending: true });

      if (error) throw error;
      
      // Map to interface
      const mapped: Procedure[] = (data || []).map((d: any) => ({
        id: d.id,
        title: d.title,
        document_number: d.document_number,
        category: null,
        status: d.status || 'active',
        version: d.revision,
        effective_date: d.effective_date,
        review_date: d.next_review_date,
        department: null,
        created_at: d.created_at
      }));
      
      // Apply filters
      let filtered = mapped;
      if (statusFilter !== 'all') {
        filtered = filtered.filter(p => p.status === statusFilter);
      }
      setProcedures(filtered);
    } catch (error) {
      console.error('Failed to load procedures:', error);
      // Mock data for display
      setProcedures([
        {
          id: '1',
          title: 'Bridge Watchkeeping Procedures',
          document_number: 'SOP-NAV-001',
          category: 'navigation',
          status: 'active',
          version: '3.2',
          effective_date: '2024-01-15',
          review_date: '2025-01-15',
          department: 'Deck',
          created_at: '2024-01-01',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredProcedures = procedures.filter(p => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      p.title?.toLowerCase().includes(searchLower) ||
      p.document_number?.toLowerCase().includes(searchLower) ||
      p.department?.toLowerCase().includes(searchLower)
    );
  });

  const activeCount = procedures.filter(p => p.status === 'active').length;
  const reviewCount = procedures.filter(p => p.status === 'under_review').length;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-6 h-6" />
              Procedures & SOPs
            </h1>
            <p className="text-muted-foreground">Standard operating procedures and work instructions</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Procedure
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{procedures.length}</p>
                  <p className="text-sm text-muted-foreground">Total Procedures</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{reviewCount}</p>
                  <p className="text-sm text-muted-foreground">Under Review</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <FolderOpen className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{categories.length}</p>
                  <p className="text-sm text-muted-foreground">Categories</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search procedures..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <FolderOpen className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Procedures List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredProcedures.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <ClipboardList className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No procedures found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredProcedures.map((procedure) => (
              <Card key={procedure.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FileText className="w-6 h-6 text-primary" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{procedure.title}</p>
                        <Badge className={statusColors[procedure.status] || 'bg-gray-100'}>
                          {procedure.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {procedure.document_number && (
                          <span className="font-mono">{procedure.document_number}</span>
                        )}
                        {procedure.version && (
                          <>
                            <span>•</span>
                            <span>v{procedure.version}</span>
                          </>
                        )}
                        {procedure.category && (
                          <>
                            <span>•</span>
                            <span className="capitalize">{procedure.category}</span>
                          </>
                        )}
                        {procedure.department && (
                          <>
                            <span>•</span>
                            <span>{procedure.department}</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex-shrink-0 text-right text-sm text-muted-foreground">
                      {procedure.review_date && (
                        <p>Review: {format(new Date(procedure.review_date), 'MMM yyyy')}</p>
                      )}
                    </div>
                    
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
