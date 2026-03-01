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

// Mock data for demo purposes
const mockProcedures: Procedure[] = [
  {
    id: '1',
    title: 'Bridge Watchkeeping Procedure',
    type: 'bridge_operations',
    document_number: 'SOP-BRG-001',
    version: '4.1',
    status: 'current',
    vessel_applicability: 'all',
    file_size: '2.4 MB',
    pages: 42,
    last_review_date: '2024-03-10T00:00:00Z',
    next_review_date: '2025-03-10T00:00:00Z',
    reviewed_by: 'Captain Sarah Johnson',
    approval_date: '2024-03-15T00:00:00Z',
    approved_by: 'Fleet Manager',
    linked_checklists: 5,
    amendment_count: 3,
    amendment_history: [
      { version: '4.1', date: '2024-03-15', description: 'Updated ECDIS cross-check requirements' },
      { version: '4.0', date: '2023-09-01', description: 'Added COLREG compliance section' },
      { version: '3.2', date: '2023-03-20', description: 'Revised night watch protocols' },
    ],
    created_at: '2022-06-01T00:00:00Z',
    updated_at: '2024-03-15T00:00:00Z',
  },
  {
    id: '2',
    title: 'Engine Room Daily Rounds',
    type: 'engine_room',
    document_number: 'SOP-ENG-003',
    version: '2.5',
    status: 'current',
    vessel_applicability: 'specific',
    vessels: ['MV Atlantic Pioneer', 'MV Pacific Voyager'],
    file_size: '3.1 MB',
    pages: 58,
    last_review_date: '2024-01-20T00:00:00Z',
    next_review_date: '2025-01-20T00:00:00Z',
    reviewed_by: 'Chief Engineer Robert Chen',
    approval_date: '2024-01-25T00:00:00Z',
    approved_by: 'Technical Superintendent',
    linked_checklists: 8,
    amendment_count: 4,
    amendment_history: [
      { version: '2.5', date: '2024-01-25', description: 'Added bilge monitoring frequency' },
      { version: '2.4', date: '2023-07-10', description: 'Updated fuel system checks' },
      { version: '2.3', date: '2023-01-15', description: 'Revised alarm response procedures' },
      { version: '2.2', date: '2022-08-20', description: 'Added turbocharger inspection steps' },
    ],
    created_at: '2022-03-15T00:00:00Z',
    updated_at: '2024-01-25T00:00:00Z',
  },
  {
    id: '3',
    title: 'Mooring Operations Procedure',
    type: 'deck_operations',
    document_number: 'SOP-DK-002',
    version: '3.0',
    status: 'under_review',
    vessel_applicability: 'all',
    file_size: '1.8 MB',
    pages: 34,
    last_review_date: '2024-02-05T00:00:00Z',
    next_review_date: '2025-02-05T00:00:00Z',
    reviewed_by: 'Chief Officer Mike Wilson',
    created_at: '2022-08-10T00:00:00Z',
    updated_at: '2024-02-05T00:00:00Z',
    linked_checklists: 3,
    amendment_count: 2,
    amendment_history: [
      { version: '3.0', date: '2024-02-05', description: 'Revised snap-back zone markings' },
      { version: '2.1', date: '2023-04-12', description: 'Updated PPE requirements for mooring' },
    ],
  },
  {
    id: '4',
    title: 'Enclosed Space Entry Procedure',
    type: 'safety',
    document_number: 'SOP-SAF-001',
    version: '5.2',
    status: 'current',
    vessel_applicability: 'all',
    file_size: '2.9 MB',
    pages: 48,
    last_review_date: '2024-04-01T00:00:00Z',
    next_review_date: '2025-04-01T00:00:00Z',
    reviewed_by: 'Safety Officer Elena Rossi',
    approval_date: '2024-04-05T00:00:00Z',
    approved_by: 'DPA Manager',
    linked_checklists: 6,
    amendment_count: 5,
    amendment_history: [
      { version: '5.2', date: '2024-04-05', description: 'Added gas monitoring calibration checks' },
      { version: '5.1', date: '2023-10-15', description: 'Updated rescue team requirements' },
      { version: '5.0', date: '2023-04-01', description: 'Full revision per IMO Res. A.1050(27)' },
      { version: '4.3', date: '2022-11-20', description: 'Added ventilation duration requirements' },
      { version: '4.2', date: '2022-06-10', description: 'Revised permit-to-work form' },
    ],
    created_at: '2021-01-15T00:00:00Z',
    updated_at: '2024-04-05T00:00:00Z',
  },
  {
    id: '5',
    title: 'Fire and Abandon Ship Drill Procedure',
    type: 'emergency',
    document_number: 'SOP-EMR-001',
    version: '3.4',
    status: 'current',
    vessel_applicability: 'all',
    file_size: '3.6 MB',
    pages: 72,
    last_review_date: '2023-12-10T00:00:00Z',
    next_review_date: '2024-12-10T00:00:00Z',
    reviewed_by: 'Captain David Martinez',
    approval_date: '2023-12-15T00:00:00Z',
    approved_by: 'Fleet Manager',
    linked_checklists: 7,
    amendment_count: 3,
    amendment_history: [
      { version: '3.4', date: '2023-12-15', description: 'Updated muster station assignments' },
      { version: '3.3', date: '2023-06-01', description: 'Added helicopter evacuation procedures' },
      { version: '3.2', date: '2022-12-20', description: 'Revised fire boundary cooling protocols' },
    ],
    created_at: '2021-06-01T00:00:00Z',
    updated_at: '2023-12-15T00:00:00Z',
  },
  {
    id: '6',
    title: 'Cargo Loading and Discharge Plan',
    type: 'cargo',
    document_number: 'SOP-CRG-002',
    version: '2.0',
    status: 'draft',
    vessel_applicability: 'specific',
    vessels: ['MV Ocean Explorer'],
    file_size: '1.5 MB',
    pages: 38,
    next_review_date: '2025-06-01T00:00:00Z',
    linked_checklists: 4,
    amendment_count: 1,
    amendment_history: [
      { version: '2.0', date: '2024-02-10', description: 'Draft for containerized cargo operations' },
    ],
    created_at: '2024-01-05T00:00:00Z',
    updated_at: '2024-02-10T00:00:00Z',
  },
  {
    id: '7',
    title: 'Ballast Water Management Procedure',
    type: 'environmental',
    document_number: 'SOP-ENV-001',
    version: '3.1',
    status: 'current',
    vessel_applicability: 'all',
    file_size: '2.2 MB',
    pages: 45,
    last_review_date: '2024-02-20T00:00:00Z',
    next_review_date: '2025-02-20T00:00:00Z',
    reviewed_by: 'Environmental Officer Anna Berg',
    approval_date: '2024-02-25T00:00:00Z',
    approved_by: 'DPA Manager',
    linked_checklists: 3,
    amendment_count: 2,
    amendment_history: [
      { version: '3.1', date: '2024-02-25', description: 'Updated for BWM Convention D-2 standard' },
      { version: '3.0', date: '2023-08-10', description: 'Added treatment system maintenance steps' },
    ],
    created_at: '2022-02-01T00:00:00Z',
    updated_at: '2024-02-25T00:00:00Z',
  },
  {
    id: '8',
    title: 'ISPS Code Ship Security Procedure',
    type: 'security',
    document_number: 'SOP-SEC-001',
    version: '2.3',
    status: 'archived',
    vessel_applicability: 'specific',
    vessels: ['MV Atlantic Pioneer', 'MV Pacific Voyager', 'MV Ocean Explorer'],
    file_size: '1.9 MB',
    pages: 52,
    last_review_date: '2022-09-15T00:00:00Z',
    next_review_date: '2023-09-15T00:00:00Z',
    reviewed_by: 'Ship Security Officer James Park',
    approval_date: '2022-09-20T00:00:00Z',
    approved_by: 'Company Security Officer',
    linked_checklists: 2,
    amendment_count: 2,
    amendment_history: [
      { version: '2.3', date: '2022-09-20', description: 'Updated security level change protocols' },
      { version: '2.2', date: '2022-03-05', description: 'Revised access control procedures' },
    ],
    created_at: '2021-09-01T00:00:00Z',
    updated_at: '2022-09-20T00:00:00Z',
  },
];

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
            <h1 className="text-3xl font-bold tracking-tight">Procedures & SOPs</h1>
            <p className="text-muted-foreground">
              Standard operating procedures, work instructions, and linked checklists
            </p>
          </div>
          <Button className="gap-2" onClick={() => toast.info('Upload procedure feature coming soon')}>
            <Plus className="w-4 h-4" />
            Upload Procedure
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
                  placeholder="Search procedures by title, document number, or type..."
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
            <CardTitle>Procedures ({filteredProcedures.length})</CardTitle>
            <CardDescription>
              Standard operating procedures and work instructions with linked checklists
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Procedure</TableHead>
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
                <p>No procedures found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Procedures;
