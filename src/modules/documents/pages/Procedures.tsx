import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ClipboardList,
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Download,
  Eye,
  CheckCircle,
  AlertTriangle,
  Clock,
  FileText,
  Ship,
  Shield,
  Calendar,
  Anchor,
  Flame,
  Package,
  Leaf,
  Lock,
  Briefcase,
  ListChecks,
} from 'lucide-react';

interface Procedure {
  id: string;
  title: string;
  type: 'bridge_operations' | 'engine_room' | 'deck_operations' | 'safety' | 'emergency' | 'cargo' | 'environmental' | 'security' | 'administrative';
  document_number: string;
  version: string;
  status: 'current' | 'under_review' | 'draft' | 'archived';
  vessel_applicability: 'all' | 'specific';
  vessels?: string[];
  file_size: string;
  pages: number;
  last_review_date?: string;
  next_review_date: string;
  reviewed_by?: string;
  approval_date?: string;
  approved_by?: string;
  linked_checklists: number;
  amendment_count: number;
  amendment_history: { version: string; date: string; description: string }[];
  created_at: string;
  updated_at: string;
}

// SOPs start empty; upload to populate.
const mockProcedures: Procedure[] = [];

const Procedures: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const typeLabels: Record<string, string> = {
    bridge_operations: 'Bridge Operations',
    engine_room: 'Engine Room',
    deck_operations: 'Deck Operations',
    safety: 'Safety',
    emergency: 'Emergency',
    cargo: 'Cargo',
    environmental: 'Environmental',
    security: 'Security',
    administrative: 'Administrative',
  };

  const statusLabels: Record<string, string> = {
    current: 'Current',
    under_review: 'Under Review',
    draft: 'Draft',
    archived: 'Archived',
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      current: 'bg-green-100 text-green-800 border-green-200',
      under_review: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      draft: 'bg-blue-100 text-blue-800 border-blue-200',
      archived: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'current':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'under_review':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'draft':
        return <Edit className="w-4 h-4 text-blue-500" />;
      case 'archived':
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'bridge_operations':
        return <Ship className="w-4 h-4 text-blue-500" />;
      case 'engine_room':
        return <Flame className="w-4 h-4 text-orange-500" />;
      case 'deck_operations':
        return <Anchor className="w-4 h-4 text-cyan-500" />;
      case 'safety':
        return <Shield className="w-4 h-4 text-green-500" />;
      case 'emergency':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'cargo':
        return <Package className="w-4 h-4 text-amber-500" />;
      case 'environmental':
        return <Leaf className="w-4 h-4 text-emerald-500" />;
      case 'security':
        return <Lock className="w-4 h-4 text-purple-500" />;
      case 'administrative':
        return <Briefcase className="w-4 h-4 text-slate-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const isReviewOverdue = (nextReviewDate: string, status: string) => {
    if (status === 'archived' || status === 'draft') return false;
    return new Date(nextReviewDate) < new Date();
  };

  const filteredProcedures = useMemo(() => {
    let filtered = mockProcedures;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (procedure) =>
          procedure.title.toLowerCase().includes(query) ||
          procedure.document_number.toLowerCase().includes(query) ||
          typeLabels[procedure.type]?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((procedure) => procedure.type === selectedType);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((procedure) => procedure.status === selectedStatus);
    }

    return filtered;
  }, [mockProcedures, searchQuery, selectedType, selectedStatus]);

  const totalLinkedChecklists = mockProcedures.reduce((sum, p) => sum + p.linked_checklists, 0);

  const stats = [
    {
      title: 'Total Procedures',
      value: mockProcedures.length,
      description: 'All procedures in system',
      icon: ClipboardList,
    },
    {
      title: 'Current',
      value: mockProcedures.filter(p => p.status === 'current').length,
      description: 'Active and approved',
      icon: CheckCircle,
    },
    {
      title: 'Review Overdue',
      value: mockProcedures.filter(p => isReviewOverdue(p.next_review_date, p.status)).length,
      description: 'Need attention',
      icon: AlertTriangle,
    },
    {
      title: 'Linked Checklists',
      value: totalLinkedChecklists,
      description: 'Across all procedures',
      icon: ListChecks,
    },
  ];

  const types = Object.keys(typeLabels);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">SOPs</h1>
            <p className="text-muted-foreground">
              Standard operating procedures and linked checklists
            </p>
          </div>
          <Button className="gap-2" onClick={() => toast.info('Upload SOP feature coming soon')}>
            <Plus className="w-4 h-4" />
            Upload SOP
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="shadow-card">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <stat.icon className="w-5 h-5 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card className="shadow-card">
          <CardContent className="pt-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search SOPs by title, document number, or type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedType === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedType('all')}
                  size="sm"
                >
                  All Types
                </Button>
                {types.map(type => (
                  <Button
                    key={type}
                    variant={selectedType === type ? 'default' : 'outline'}
                    onClick={() => setSelectedType(type)}
                    size="sm"
                  >
                    {typeLabels[type]}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant={selectedStatus === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('all')}
                  size="sm"
                >
                  All Status
                </Button>
                <Button
                  variant={selectedStatus === 'current' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('current')}
                  size="sm"
                >
                  Current
                </Button>
                <Button
                  variant={selectedStatus === 'under_review' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('under_review')}
                  size="sm"
                >
                  Review
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Procedures Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>SOPs ({filteredProcedures.length})</CardTitle>
            <CardDescription>
              Standard operating procedures with linked checklists
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SOP</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Date</TableHead>
                  <TableHead>Checklists</TableHead>
                  <TableHead>Vessels</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProcedures.map((procedure) => (
                  <TableRow key={procedure.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        {getTypeIcon(procedure.type)}
                        <div>
                          <div className="font-medium">{procedure.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                            <span>{procedure.document_number}</span>
                            <span>&bull;</span>
                            <span>{procedure.pages} pages</span>
                            <span>&bull;</span>
                            <span>{procedure.file_size}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {typeLabels[procedure.type]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{procedure.version}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(procedure.status)}
                        {getStatusBadge(procedure.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className={`flex items-center gap-1 ${
                          isReviewOverdue(procedure.next_review_date, procedure.status) ? 'text-red-600' : ''
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(procedure.next_review_date).toLocaleDateString()}
                          {isReviewOverdue(procedure.next_review_date, procedure.status) && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                        {procedure.reviewed_by && (
                          <div className="text-xs text-muted-foreground mt-1">
                            By: {procedure.reviewed_by}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <ListChecks className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">{procedure.linked_checklists}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {procedure.vessel_applicability === 'all' ? (
                          <Badge variant="secondary" className="text-xs">
                            All Vessels
                          </Badge>
                        ) : (
                          <div>
                            <div className="font-medium">{procedure.vessels?.length || 0} vessels</div>
                            {procedure.vessels && procedure.vessels.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {procedure.vessels.slice(0, 2).join(', ')}
                                {procedure.vessels.length > 2 && ` +${procedure.vessels.length - 2} more`}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem className="gap-2">
                            <Eye className="h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Download className="h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Edit className="h-4 w-4" />
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <ListChecks className="h-4 w-4" />
                            Manage Checklists
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredProcedures.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No SOPs yet</p>
                <p className="text-sm">Upload your first SOP to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Procedures;
