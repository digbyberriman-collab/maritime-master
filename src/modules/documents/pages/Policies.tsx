import React, { useState, useMemo } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
  FileCheck, 
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
  Users,
  Ship,
  Building,
  Calendar,
  UserCheck
} from 'lucide-react';

interface Policy {
  id: string;
  title: string;
  category: 'safety' | 'environmental' | 'hr' | 'operations' | 'security' | 'quality';
  policy_number: string;
  version: string;
  status: 'active' | 'under_review' | 'draft' | 'retired';
  applicability: 'company' | 'vessel' | 'shore';
  mandatory_acknowledgment: boolean;
  acknowledgment_stats?: {
    total_required: number;
    acknowledged: number;
    pending: number;
  };
  effective_date: string;
  review_date: string;
  next_review_date: string;
  owner: string;
  approved_by?: string;
  file_size: string;
  created_at: string;
  updated_at: string;
}

// Mock data for demo purposes
const mockPolicies: Policy[] = [
  {
    id: '1',
    title: 'Drug and Alcohol Policy',
    category: 'safety',
    policy_number: 'POL-SAF-001',
    version: '3.1',
    status: 'active',
    applicability: 'company',
    mandatory_acknowledgment: true,
    acknowledgment_stats: {
      total_required: 245,
      acknowledged: 238,
      pending: 7
    },
    effective_date: '2024-01-01T00:00:00Z',
    review_date: '2023-12-15T00:00:00Z',
    next_review_date: '2025-01-01T00:00:00Z',
    owner: 'Safety Manager',
    approved_by: 'DPA',
    file_size: '450 KB',
    created_at: '2023-11-15T00:00:00Z',
    updated_at: '2023-12-20T00:00:00Z'
  },
  {
    id: '2',
    title: 'Environmental Protection Policy',
    category: 'environmental',
    policy_number: 'POL-ENV-001',
    version: '2.0',
    status: 'active',
    applicability: 'vessel',
    mandatory_acknowledgment: true,
    acknowledgment_stats: {
      total_required: 156,
      acknowledged: 151,
      pending: 5
    },
    effective_date: '2023-07-01T00:00:00Z',
    review_date: '2023-06-20T00:00:00Z',
    next_review_date: '2024-07-01T00:00:00Z',
    owner: 'Environmental Officer',
    approved_by: 'Fleet Manager',
    file_size: '680 KB',
    created_at: '2023-05-10T00:00:00Z',
    updated_at: '2023-06-25T00:00:00Z'
  },
  {
    id: '3',
    title: 'Anti-Harassment and Bullying Policy',
    category: 'hr',
    policy_number: 'POL-HR-003',
    version: '1.5',
    status: 'under_review',
    applicability: 'company',
    mandatory_acknowledgment: true,
    acknowledgment_stats: {
      total_required: 245,
      acknowledged: 201,
      pending: 44
    },
    effective_date: '2023-03-01T00:00:00Z',
    review_date: '2024-01-20T00:00:00Z',
    next_review_date: '2024-03-01T00:00:00Z',
    owner: 'HR Manager',
    file_size: '520 KB',
    created_at: '2023-01-15T00:00:00Z',
    updated_at: '2024-01-20T00:00:00Z'
  },
  {
    id: '4',
    title: 'Bridge Resource Management Policy',
    category: 'operations',
    policy_number: 'POL-OPS-012',
    version: '2.3',
    status: 'active',
    applicability: 'vessel',
    mandatory_acknowledgment: false,
    effective_date: '2023-09-15T00:00:00Z',
    review_date: '2023-09-01T00:00:00Z',
    next_review_date: '2024-09-15T00:00:00Z',
    owner: 'Fleet Operations Manager',
    approved_by: 'Master Mariner',
    file_size: '1.2 MB',
    created_at: '2023-07-20T00:00:00Z',
    updated_at: '2023-09-10T00:00:00Z'
  },
  {
    id: '5',
    title: 'Cybersecurity Policy',
    category: 'security',
    policy_number: 'POL-SEC-001',
    version: '1.0',
    status: 'draft',
    applicability: 'company',
    mandatory_acknowledgment: true,
    acknowledgment_stats: {
      total_required: 0,
      acknowledged: 0,
      pending: 0
    },
    effective_date: '2024-03-01T00:00:00Z',
    review_date: '2024-02-15T00:00:00Z',
    next_review_date: '2025-03-01T00:00:00Z',
    owner: 'IT Security Officer',
    file_size: '890 KB',
    created_at: '2024-01-10T00:00:00Z',
    updated_at: '2024-02-15T00:00:00Z'
  },
  {
    id: '6',
    title: 'Quality Management Policy',
    category: 'quality',
    policy_number: 'POL-QUA-001',
    version: '3.0',
    status: 'active',
    applicability: 'shore',
    mandatory_acknowledgment: true,
    acknowledgment_stats: {
      total_required: 89,
      acknowledged: 86,
      pending: 3
    },
    effective_date: '2023-05-01T00:00:00Z',
    review_date: '2023-04-15T00:00:00Z',
    next_review_date: '2024-05-01T00:00:00Z',
    owner: 'Quality Manager',
    approved_by: 'General Manager',
    file_size: '720 KB',
    created_at: '2023-02-01T00:00:00Z',
    updated_at: '2023-04-20T00:00:00Z'
  }
];

const Policies: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const categoryLabels: Record<string, string> = {
    safety: 'Safety',
    environmental: 'Environmental',
    hr: 'Human Resources',
    operations: 'Operations',
    security: 'Security',
    quality: 'Quality',
  };

  const statusLabels: Record<string, string> = {
    active: 'Active',
    under_review: 'Under Review',
    draft: 'Draft',
    retired: 'Retired',
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800 border-green-200',
      under_review: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      draft: 'bg-blue-100 text-blue-800 border-blue-200',
      retired: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <Badge className={colors[status] || 'bg-gray-100 text-gray-800 border-gray-200'}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'under_review':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'draft':
        return <Edit className="w-4 h-4 text-blue-500" />;
      case 'retired':
        return <AlertTriangle className="w-4 h-4 text-gray-500" />;
      default:
        return <FileCheck className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getApplicabilityIcon = (applicability: string) => {
    switch (applicability) {
      case 'company':
        return <Building className="w-4 h-4 text-blue-500" />;
      case 'vessel':
        return <Ship className="w-4 h-4 text-green-500" />;
      case 'shore':
        return <Users className="w-4 h-4 text-purple-500" />;
      default:
        return <Building className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const isReviewOverdue = (nextReviewDate: string, status: string) => {
    if (status === 'retired' || status === 'draft') return false;
    return new Date(nextReviewDate) < new Date();
  };

  const filteredPolicies = useMemo(() => {
    let filtered = mockPolicies;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (policy) =>
          policy.title.toLowerCase().includes(query) ||
          policy.policy_number.toLowerCase().includes(query) ||
          categoryLabels[policy.category]?.toLowerCase().includes(query) ||
          policy.owner.toLowerCase().includes(query)
      );
    }

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter((policy) => policy.category === selectedCategory);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter((policy) => policy.status === selectedStatus);
    }

    return filtered;
  }, [mockPolicies, searchQuery, selectedCategory, selectedStatus]);

  const stats = [
    {
      title: 'Total Policies',
      value: mockPolicies.length,
      description: 'All policies in system',
      icon: FileCheck,
    },
    {
      title: 'Active Policies',
      value: mockPolicies.filter(p => p.status === 'active').length,
      description: 'Currently effective',
      icon: CheckCircle,
    },
    {
      title: 'Pending Acknowledgments',
      value: mockPolicies
        .filter(p => p.acknowledgment_stats)
        .reduce((sum, p) => sum + (p.acknowledgment_stats?.pending || 0), 0),
      description: 'Require attention',
      icon: UserCheck,
    },
  ];

  const categories = Object.keys(categoryLabels);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Policies</h1>
            <p className="text-muted-foreground">
              Company policies and guidelines with acknowledgment tracking
            </p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Policy
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
                  placeholder="Search policies by title, number, category, or owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant={selectedCategory === 'all' ? 'default' : 'outline'}
                  onClick={() => setSelectedCategory('all')}
                  size="sm"
                >
                  All Categories
                </Button>
                {categories.slice(0, 4).map(category => (
                  <Button
                    key={category}
                    variant={selectedCategory === category ? 'default' : 'outline'}
                    onClick={() => setSelectedCategory(category)}
                    size="sm"
                  >
                    {categoryLabels[category]}
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
                  variant={selectedStatus === 'active' ? 'default' : 'outline'}
                  onClick={() => setSelectedStatus('active')}
                  size="sm"
                >
                  Active
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

        {/* Policies Table */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Policies ({filteredPolicies.length})</CardTitle>
            <CardDescription>
              Company policies and guidelines with acknowledgment tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Policy</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Acknowledgments</TableHead>
                  <TableHead>Review Date</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPolicies.map((policy) => (
                  <TableRow key={policy.id}>
                    <TableCell>
                      <div className="flex items-start gap-3">
                        {getApplicabilityIcon(policy.applicability)}
                        <div>
                          <div className="font-medium flex items-center gap-2">
                            {policy.title}
                            {policy.mandatory_acknowledgment && (
                              <Badge variant="secondary" className="text-xs">Required</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                            <span>{policy.policy_number}</span>
                            <span>•</span>
                            <span>v{policy.version}</span>
                            <span>•</span>
                            <span>{policy.file_size}</span>
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {categoryLabels[policy.category]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {getStatusIcon(policy.status)}
                        {getStatusBadge(policy.status)}
                      </div>
                    </TableCell>
                    <TableCell>
                      {policy.acknowledgment_stats ? (
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span>
                              {policy.acknowledgment_stats.acknowledged}/{policy.acknowledgment_stats.total_required}
                            </span>
                            <span className="text-muted-foreground">
                              {Math.round((policy.acknowledgment_stats.acknowledged / policy.acknowledgment_stats.total_required) * 100)}%
                            </span>
                          </div>
                          <Progress 
                            value={(policy.acknowledgment_stats.acknowledged / policy.acknowledgment_stats.total_required) * 100} 
                            className="h-1"
                          />
                          {policy.acknowledgment_stats.pending > 0 && (
                            <div className="text-xs text-amber-600">
                              {policy.acknowledgment_stats.pending} pending
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">No tracking</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className={`flex items-center gap-1 ${
                          isReviewOverdue(policy.next_review_date, policy.status) ? 'text-red-600' : ''
                        }`}>
                          <Calendar className="w-3 h-3" />
                          {new Date(policy.next_review_date).toLocaleDateString()}
                          {isReviewOverdue(policy.next_review_date, policy.status) && (
                            <AlertTriangle className="w-3 h-3 text-red-500 ml-1" />
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <div className="font-medium">{policy.owner}</div>
                        {policy.approved_by && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Approved by: {policy.approved_by}
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
                            View Policy
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2">
                            <Download className="h-4 w-4" />
                            Download PDF
                          </DropdownMenuItem>
                          {policy.acknowledgment_stats && (
                            <DropdownMenuItem className="gap-2">
                              <UserCheck className="h-4 w-4" />
                              View Acknowledgments
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem className="gap-2">
                            <Edit className="h-4 w-4" />
                            Edit Policy
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="gap-2 text-destructive">
                            <Trash2 className="h-4 w-4" />
                            Retire Policy
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredPolicies.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No policies found</p>
                <p className="text-sm">Try adjusting your search criteria</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Policies;