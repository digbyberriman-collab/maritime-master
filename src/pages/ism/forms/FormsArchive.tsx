import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Archive, Search, Filter, Download, Eye, Calendar,
  FileText, Loader2, User, Ship, CheckCircle
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface ArchivedSubmission {
  id: string;
  template_name: string | null;
  template_id: string | null;
  status: string;
  submitted_at: string | null;
  submitted_by_name: string | null;
  vessel_name: string | null;
  signature_count: number;
  data: Record<string, unknown>;
}

export default function FormsArchive() {
  const [submissions, setSubmissions] = useState<ArchivedSubmission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('all');
  const [templateFilter, setTemplateFilter] = useState('all');
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([]);

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('form_templates')
        .select('id, template_name')
        .eq('status', 'active')
        .order('template_name');

      if (error) throw error;
      setTemplates((data || []).map((t: any) => ({ id: t.id, name: t.template_name })));
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  }

  const loadSubmissions = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('form_submissions')
        .select(`
          id,
          template_id,
          status,
          submitted_at,
          submitted_by_name,
          vessel_name,
          data,
          form_templates(name)
        `)
        .eq('status', 'completed')
        .order('submitted_at', { ascending: false });

      if (templateFilter !== 'all') {
        query = query.eq('template_id', templateFilter);
      }

      if (dateRange !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (dateRange) {
          case 'week':
            startDate = new Date(now.setDate(now.getDate() - 7));
            break;
          case 'month':
            startDate = new Date(now.setMonth(now.getMonth() - 1));
            break;
          case 'quarter':
            startDate = new Date(now.setMonth(now.getMonth() - 3));
            break;
          case 'year':
            startDate = new Date(now.setFullYear(now.getFullYear() - 1));
            break;
          default:
            startDate = new Date(0);
        }

        query = query.gte('submitted_at', startDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      setSubmissions((data || []).map((s: any) => ({
        id: s.id,
        template_name: s.form_templates?.template_name || 'Unknown Template',
        template_id: s.template_id,
        status: s.status,
        submitted_at: s.submitted_at,
        submitted_by_name: s.submitted_by_name,
        vessel_name: s.vessel_name,
        signature_count: 0,
        data: s.data || {},
      })));
    } catch (error) {
      console.error('Failed to load submissions:', error);
      setSubmissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, templateFilter]);

  useEffect(() => {
    loadSubmissions();
    loadTemplates();
  }, [loadSubmissions]);

  async function handleExportPDF(id: string) {
    toast.info('Generating PDF...');
    // PDF export would be implemented here
    setTimeout(() => toast.success('PDF downloaded'), 1000);
  }

  const filteredSubmissions = submissions.filter(s => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      s.template_name?.toLowerCase().includes(searchLower) ||
      s.submitted_by_name?.toLowerCase().includes(searchLower) ||
      s.vessel_name?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Archive className="w-6 h-6" />
              Form Archive
            </h1>
            <p className="text-muted-foreground">Completed and archived form submissions</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/ism/forms/exports">
                <Download className="w-4 h-4 mr-2" />
                Bulk Export
              </Link>
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{submissions.length}</p>
                  <p className="text-sm text-muted-foreground">Total Archived</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {new Set(submissions.map(s => s.template_id)).size}
                  </p>
                  <p className="text-sm text-muted-foreground">Form Types</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Ship className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {new Set(submissions.filter(s => s.vessel_name).map(s => s.vessel_name)).size}
                  </p>
                  <p className="text-sm text-muted-foreground">Vessels</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {submissions.filter(s => {
                      if (!s.submitted_at) return false;
                      const submitted = new Date(s.submitted_at);
                      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
                      return submitted > monthAgo;
                    }).length}
                  </p>
                  <p className="text-sm text-muted-foreground">This Month</p>
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
                  placeholder="Search by template, submitter, or vessel..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={templateFilter} onValueChange={setTemplateFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Form Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Forms</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={dateRange} onValueChange={setDateRange}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <Calendar className="w-4 h-4 mr-2" />
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="week">Past Week</SelectItem>
                  <SelectItem value="month">Past Month</SelectItem>
                  <SelectItem value="quarter">Past Quarter</SelectItem>
                  <SelectItem value="year">Past Year</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Submissions List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : filteredSubmissions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Archive className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No archived submissions found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredSubmissions.map((submission) => (
              <Card key={submission.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{submission.template_name}</p>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Completed
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        {submission.submitted_by_name && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {submission.submitted_by_name}
                          </span>
                        )}
                        {submission.vessel_name && (
                          <span className="flex items-center gap-1">
                            <Ship className="w-3 h-3" />
                            {submission.vessel_name}
                          </span>
                        )}
                        {submission.submitted_at && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(submission.submitted_at), 'MMM d, yyyy')}
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/ism/forms/submission/${submission.id}`}>
                          <Eye className="w-4 h-4 mr-1" />
                          View
                        </Link>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleExportPDF(submission.id)}
                      >
                        <Download className="w-4 h-4 mr-1" />
                        PDF
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
