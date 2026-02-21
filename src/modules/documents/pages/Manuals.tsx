import React, { useState, useMemo } from 'react';
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
  BookOpen, 
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
  Users,
  Calendar
} from 'lucide-react';

interface Manual {
  id: string;
  title: string;
  type: 'safety_management' | 'operations' | 'emergency' | 'technical' | 'training';
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
  created_at: string;
  updated_at: string;
}

// Mock data for demo purposes
const mockManuals: Manual[] = [
  {
    id: '1',
    title: 'Safety Management Manual',
    type: 'safety_management',
    document_number: 'SMS-001',
    version: '3.2',
    status: 'current',
    vessel_applicability: 'all',
    file_size: '4.2 MB',
    pages: 156,
    last_review_date: '2024-01-15T00:00:00Z',
    next_review_date: '2025-01-15T00:00:00Z',
    reviewed_by: 'Captain Sarah Johnson',
    approval_date: '2024-01-20T00:00:00Z',
    approved_by: 'DPA Manager',
    created_at: '2023-01-15T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z'
  },
  {
    id: '2',
    title: 'Bridge Operations Manual',
    type: 'operations',
    document_number: 'OPS-003',
    version: '2.1',
    status: 'current',
    vessel_applicability: 'specific',
    vessels: ['MV Atlantic Pioneer', 'MV Ocean Explorer'],
    file_size: '2.8 MB',
    pages: 89,
    last_review_date: '2023-11-10T00:00:00Z',
    next_review_date: '2024-11-10T00:00:00Z',
    reviewed_by: 'Chief Officer Mike Wilson',
    approval_date: '2023-11-15T00:00:00Z',
    approved_by: 'Fleet Manager',
    created_at: '2023-05-10T00:00:00Z',
    updated_at: '2023-11-15T00:00:00Z'
  },
  {
    id: '3',
    title: 'Emergency Response Manual',
    type: 'emergency',
    document_number: 'ERM-001',
    version: '4.0',
    status: 'under_review',
    vessel_applicability: 'all',
    file_size: '3.5 MB',
    pages: 124,
    last_review_date: '2024-01-25T00:00:00Z',
    next_review_date: '2025-01-25T00:00:00Z',
    reviewed_by: 'Safety Officer Elena Rossi',
    created_at: '2023-01-25T00:00:00Z',
    updated_at: '2024-01-25T00:00:00Z'
  },
  {
    id: '4',
    title: 'Engine Room Operations Manual',
    type: 'technical',
    document_number: 'TEC-002',
    version: '1.8',
    status: 'current',
    vessel_applicability: 'specific',
    vessels: ['MV Pacific Voyager'],
    file_size: '5.1 MB',
    pages: 203,
    last_review_date: '2023-09-20T00:00:00Z',
    next_review_date: '2024-09-20T00:00:00Z',
    reviewed_by: 'Chief Engineer Robert Chen',
    approval_date: '2023-09-25T00:00:00Z',
    approved_by: 'Technical Manager',
    created_at: '2023-03-20T00:00:00Z',
    updated_at: '2023-09-25T00:00:00Z'
  },
  {
    id: '5',
    title: 'Crew Training Manual',
    type: 'training',
    document_number: 'TRN-001',
    version: '2.3',
    status: 'draft',
    vessel_applicability: 'all',
    file_size: '1.9 MB',
    pages: 67,
    next_review_date: '2024-12-01T00:00:00Z',
    created_at: '2023-12-01T00:00:00Z',
    updated_at: '2024-01-28T00:00:00Z'
  },
  {
    id: '6',
    title: 'Port State Control Manual',
    type: 'operations',
    document_number: 'OPS-007',
    version: '1.2',
    status: 'archived',
    vessel_applicability: 'all',
    file_size: '1.4 MB',
    pages: 45,
    last_review_date: '2022-06-15T00:00:00Z',
    next_review_date: '2023-06-15T00:00:00Z',
    reviewed_by: 'Port Captain David Martinez',
    approval_date: '2022-06-20T00:00:00Z',
    approved_by: 'Operations Manager',
    created_at: '2022-01-15T00:00:00Z',
    updated_at: '2022-06-20T00:00:00Z'
  }
];

const Manuals: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const typeLabels: Record<string, string> = {
    safety_management: 'Safety Management',
    operations: 'Operations',
    emergency: 'Emergency',
    technical: 'Technical',
    training: 'Training',
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
      case 'safety_management':
        return <Shield className="w-4 h-4 text-blue-500" />;
      case 'operations':
        return <Ship className="w-4 h-4 text-green-500" />;
      case 'emergency':
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case 'technical':
        return <BookOpen className="w-4 h-4 text-purple-500" />;
      case 'training':
        return <Users className="w-4 h-4 text-orange-500" />;
      default:
        return <FileText className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const isReviewOverdue = (nextReviewDate: string, status: string) => {
    if (status === 'archived' || status === 'draft') return false;
    return new Date(nextReviewDate) < new Date();
  };

  const filteredManuals = useMemo(() => {
    let filtered = mockManuals;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (manual) =>
          manual.title.toLowerCase().includes(query) ||
          manual.document_number.toLowerCase().includes(query) ||
          typeLabels[manual.type]?.toLowerCase().includes(query)
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter((manual) => manual.type === selectedType);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((manual) => manual.status === selectedStatus);
    }

    return filtered;
  }, [mockManuals, searchQuery, selectedType, selectedStatus]);

  const stats = [
    {
      title: 'Total Manuals',
      value: mockManuals.length,
      description: 'All manuals in system',
      icon: BookOpen,
    },
    {
      title: 'Current Manuals',
      value: mockManuals.filter(m => m.status === 'current').length,
      description: 'Active and approved',
      icon: CheckCircle,
    },
    {
      title: 'Review Overdue',
      value: mockManuals.filter(m => isReviewOverdue(m.next_review_date, m.status)).length,
      description: 'Need attention',
      icon: AlertTriangle,
    },
  ];

  const types = Object.keys(typeLabels);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manuals</h1>
            <p className="text-muted-foreground">
              Operational and safety manuals with version control and distribution tracking
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Upload Manual
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
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
                  placeholder="Search manuals by title, document number, or type..."
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

        {/* Manuals Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Manuals ({filteredManuals.length})</CardTitle>
            <CardDescription>
              Operational and safety manuals with version control
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Manual</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Review Date</TableHead>
                  <TableHead>Vessels</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredManuals.map((manual) => (
                  <TableRow key={manual.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        {getTypeIcon(manual.type)}
                        <div>
                          <div className="font-medium">{manual.title}</div>
                          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                            <span>{manual.document_number}</span>
                            <span>•</span>
                            <span>{manual.pages} pages</span>
                            <span>•</span>
                            <span>{manual.file_size}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {typeLabels[manual.type]}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">{manual.version}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(manual.status)}
                        {getStatusBadge(manual.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className={`flex items-center gap-1 ${
                          isReviewOverdue(manual.next_review_date, manual.status) ? 'text-red-600' : ''
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(manual.next_review_date).toLocaleDateString()}
                          {isReviewOverdue(manual.next_review_date, manual.status) && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                        {manual.reviewed_by && (
                          <div className="text-xs text-muted-foreground mt-1">
                            By: {manual.reviewed_by}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {manual.vessel_applicability === 'all' ? (
                          <Badge variant="secondary" className="text-xs">
                            All Vessels
                          </Badge>
                        ) : (
                          <div>
                            <div className="font-medium">{manual.vessels?.length || 0} vessels</div>
                            {manual.vessels && manual.vessels.length > 0 && (
                              <div className="text-xs text-muted-foreground mt-1">
                                {manual.vessels.slice(0, 2).join(', ')}
                                {manual.vessels.length > 2 && ` +${manual.vessels.length - 2} more`}
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
                            View Manual
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
                            <Ship className="h-4 w-4" />
                            Manage Distribution
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Archive Manual
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredManuals.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No manuals found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Manuals;