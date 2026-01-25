import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Pencil, Trash2, Search, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { useRiskAssessments, useDeleteRiskAssessment, type RiskAssessment } from '@/hooks/useRiskAssessments';
import { getRiskLevel, RA_STATUS_OPTIONS } from '@/lib/riskAssessmentConstants';
import RiskAssessmentDetailModal from './RiskAssessmentDetailModal';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const RiskAssessmentsTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [selectedAssessment, setSelectedAssessment] = useState<RiskAssessment | null>(null);
  const [deleteAssessment, setDeleteAssessment] = useState<RiskAssessment | null>(null);

  const { data: assessments, isLoading } = useRiskAssessments();
  const deleteMutation = useDeleteRiskAssessment();

  const getFullName = (profile?: { first_name: string; last_name: string }) => {
    if (!profile) return 'Unknown';
    return `${profile.first_name} ${profile.last_name}`;
  };

  const filteredAssessments = assessments?.filter(ra => {
    const matchesSearch = searchQuery === '' ||
      ra.task_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ra.assessment_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ra.task_location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || ra.status === statusFilter;

    const riskScore = ra.risk_score_residual || 0;
    const matchesRisk = riskFilter === 'all' ||
      (riskFilter === 'low' && riskScore <= 6) ||
      (riskFilter === 'medium' && riskScore > 6 && riskScore <= 12) ||
      (riskFilter === 'high' && riskScore > 12);

    return matchesSearch && matchesStatus && matchesRisk;
  }) || [];

  const handleDelete = () => {
    if (deleteAssessment) {
      deleteMutation.mutate(deleteAssessment.id, {
        onSuccess: () => setDeleteAssessment(null),
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Approved':
        return <Badge className="bg-green-100 text-green-700">Approved</Badge>;
      case 'Draft':
        return <Badge className="bg-gray-100 text-gray-700">Draft</Badge>;
      case 'Under_Review':
        return <Badge className="bg-yellow-100 text-yellow-700">Under Review</Badge>;
      case 'Expired':
        return <Badge className="bg-red-100 text-red-700">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRiskBadge = (score: number | null) => {
    if (!score) return <Badge variant="outline">N/A</Badge>;
    const { level, bgColor, color } = getRiskLevel(score);
    return <Badge className={`${bgColor} ${color}`}>{level} ({score})</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Risk Assessments
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by task name, RA number, or location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {RA_STATUS_OPTIONS.map(status => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Risk Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Risks</SelectItem>
              <SelectItem value="low">Low (1-6)</SelectItem>
              <SelectItem value="medium">Medium (7-12)</SelectItem>
              <SelectItem value="high">High (13-25)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredAssessments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No risk assessments found. Create your first one to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RA #</TableHead>
                <TableHead>Task Name</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Assessment Date</TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead>Review Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssessments.map((ra) => (
                <TableRow key={ra.id}>
                  <TableCell className="font-mono text-sm">
                    <button
                      onClick={() => setSelectedAssessment(ra)}
                      className="text-primary hover:underline"
                    >
                      {ra.assessment_number}
                    </button>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {ra.task_name}
                  </TableCell>
                  <TableCell>{ra.task_location}</TableCell>
                  <TableCell>{format(new Date(ra.assessment_date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>{getRiskBadge(ra.risk_score_residual)}</TableCell>
                  <TableCell>
                    {format(new Date(ra.review_date), 'dd MMM yyyy')}
                  </TableCell>
                  <TableCell>{getStatusBadge(ra.status)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedAssessment(ra)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteAssessment(ra)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {selectedAssessment && (
        <RiskAssessmentDetailModal
          assessment={selectedAssessment}
          open={!!selectedAssessment}
          onOpenChange={(open) => !open && setSelectedAssessment(null)}
        />
      )}

      <AlertDialog open={!!deleteAssessment} onOpenChange={(open) => !open && setDeleteAssessment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Risk Assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the risk assessment "{deleteAssessment?.assessment_number}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default RiskAssessmentsTab;
