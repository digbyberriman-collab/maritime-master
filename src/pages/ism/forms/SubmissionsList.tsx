import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  MoreHorizontal,
  Eye,
  Edit,
  Download,
  Loader2,
  Filter,
  PenTool,
  Archive,
} from 'lucide-react';
import { useFormSubmissions } from '@/hooks/useFormSubmissions';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { format } from 'date-fns';

const STATUS_CONFIG: Record<string, { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  DRAFT: { label: 'Draft', icon: <Clock className="h-3 w-3" />, variant: 'secondary' },
  IN_PROGRESS: { label: 'In Progress', icon: <Edit className="h-3 w-3" />, variant: 'secondary' },
  PENDING_SIGNATURE: { label: 'Pending Signatures', icon: <PenTool className="h-3 w-3" />, variant: 'outline' },
  SIGNED: { label: 'Completed', icon: <CheckCircle className="h-3 w-3" />, variant: 'default' },
  ARCHIVED: { label: 'Archived', icon: <Archive className="h-3 w-3" />, variant: 'secondary' },
  AMENDED: { label: 'Amended', icon: <AlertCircle className="h-3 w-3" />, variant: 'outline' },
};

const SubmissionsList: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTemplateId, setFilterTemplateId] = useState<string>('all');

  const { data: submissions = [], isLoading } = useFormSubmissions({
    status: filterStatus === 'all' ? undefined : filterStatus,
    templateId: filterTemplateId === 'all' ? undefined : filterTemplateId,
  });

  const { data: templates = [] } = useFormTemplates({ status: 'PUBLISHED' });

  const filteredSubmissions = submissions.filter(s =>
    s.submission_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.template?.template_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate stats
  const stats = {
    drafts: submissions.filter(s => s.status === 'DRAFT' || s.status === 'IN_PROGRESS').length,
    pending: submissions.filter(s => s.status === 'PENDING_SIGNATURE').length,
    completed: submissions.filter(s => s.status === 'SIGNED').length,
    total: submissions.length,
  };

  const getStatusBadge = (status: string) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.DRAFT;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        {config.icon}
        {config.label}
      </Badge>
    );
  };

  const getSignatureProgress = (submission: any) => {
    const signatures = submission.signatures || [];
    const requiredSigners = (submission.template?.required_signers as any[]) || [];
    const required = requiredSigners.filter((r: any) => r.is_mandatory !== false).length;
    return { collected: signatures.length, required };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Form Submissions</h1>
            <p className="text-muted-foreground">View and manage all form submissions</p>
          </div>
          <Button onClick={() => navigate('/ism/forms/templates')}>
            <Plus className="h-4 w-4 mr-2" />
            New Submission
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('all')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('DRAFT')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.drafts}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('PENDING_SIGNATURE')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{stats.pending}</div>
            </CardContent>
          </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setFilterStatus('SIGNED')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{stats.completed}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by number or form name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={filterTemplateId} onValueChange={setFilterTemplateId}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Forms" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Forms</SelectItem>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="PENDING_SIGNATURE">Pending Signatures</SelectItem>
                  <SelectItem value="SIGNED">Completed</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Submissions Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : filteredSubmissions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Submissions Found</h3>
                <p className="text-muted-foreground text-sm mt-1">
                  {filterStatus !== 'all' ? 'Try changing your filters' : 'Start by filling out a form template'}
                </p>
                <Button className="mt-4" onClick={() => navigate('/ism/forms/templates')}>
                  Browse Templates
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Submission #</TableHead>
                    <TableHead>Form</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Signatures</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSubmissions.map(submission => {
                    const sigProgress = getSignatureProgress(submission);
                    const isEditable = ['DRAFT', 'IN_PROGRESS'].includes(submission.status);

                    return (
                      <TableRow key={submission.id} className="cursor-pointer hover:bg-muted/50">
                        <TableCell 
                          className="font-mono text-sm"
                          onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}
                        >
                          {submission.submission_number}
                        </TableCell>
                        <TableCell onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                          <div>
                            <div className="font-medium">{submission.template?.template_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {submission.template?.template_code}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                          {submission.vessel?.name || '—'}
                        </TableCell>
                        <TableCell onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                          {getStatusBadge(submission.status)}
                        </TableCell>
                        <TableCell onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                          {sigProgress.required > 0 && (
                            <span className="text-sm">
                              {sigProgress.collected} / {sigProgress.required}
                            </span>
                          )}
                        </TableCell>
                        <TableCell onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                          <div className="text-sm">
                            {submission.created_at ? format(new Date(submission.created_at), 'dd MMM yyyy') : '—'}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {submission.creator ? [submission.creator.first_name, submission.creator.last_name].filter(Boolean).join(' ') : 'Unknown'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              {isEditable && (
                                <DropdownMenuItem onClick={() => navigate(`/ism/forms/submission/${submission.id}`)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                              )}
                              {submission.status === 'SIGNED' && (
                                <DropdownMenuItem>
                                  <Download className="h-4 w-4 mr-2" />
                                  Export PDF
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SubmissionsList;
