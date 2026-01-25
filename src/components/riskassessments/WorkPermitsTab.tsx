import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Trash2, Search, ClipboardList, Plus, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useWorkPermits, useDeleteWorkPermit, useUpdateWorkPermit, type WorkPermit } from '@/hooks/useRiskAssessments';
import { PERMIT_STATUS_OPTIONS, PERMIT_TYPE_OPTIONS } from '@/lib/riskAssessmentConstants';
import CreateWorkPermitModal from './CreateWorkPermitModal';
import WorkPermitDetailModal from './WorkPermitDetailModal';
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

const WorkPermitsTab = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPermit, setSelectedPermit] = useState<WorkPermit | null>(null);
  const [deletePermit, setDeletePermit] = useState<WorkPermit | null>(null);

  const { data: permits, isLoading } = useWorkPermits();
  const deleteMutation = useDeleteWorkPermit();
  const updateMutation = useUpdateWorkPermit();

  const getFullName = (profile?: { first_name: string; last_name: string }) => {
    if (!profile) return 'Unknown';
    return `${profile.first_name} ${profile.last_name}`;
  };

  const filteredPermits = permits?.filter(wp => {
    const matchesSearch = searchQuery === '' ||
      wp.work_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wp.permit_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      wp.work_location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'all' || wp.status === statusFilter;
    const matchesType = typeFilter === 'all' || wp.permit_type === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  }) || [];

  const handleDelete = () => {
    if (deletePermit) {
      deleteMutation.mutate(deletePermit.id, {
        onSuccess: () => setDeletePermit(null),
      });
    }
  };

  const handleApprove = (permit: WorkPermit) => {
    updateMutation.mutate({
      id: permit.id,
      status: 'Approved',
      approved_by_id: permit.requested_by_id, // In real app, use current user
    });
  };

  const handleActivate = (permit: WorkPermit) => {
    updateMutation.mutate({
      id: permit.id,
      status: 'Active',
      actual_start: new Date().toISOString(),
    });
  };

  const handleComplete = (permit: WorkPermit) => {
    updateMutation.mutate({
      id: permit.id,
      status: 'Completed',
      actual_end: new Date().toISOString(),
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return <Badge className="bg-yellow-100 text-yellow-700">Pending</Badge>;
      case 'Approved':
        return <Badge className="bg-blue-100 text-blue-700">Approved</Badge>;
      case 'Active':
        return <Badge className="bg-green-100 text-green-700">Active</Badge>;
      case 'Completed':
        return <Badge className="bg-gray-100 text-gray-700">Completed</Badge>;
      case 'Expired':
        return <Badge className="bg-red-100 text-red-700">Expired</Badge>;
      case 'Cancelled':
        return <Badge className="bg-red-100 text-red-700">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPermitTypeLabel = (type: string) => {
    const option = PERMIT_TYPE_OPTIONS.find(o => o.value === type);
    return option?.label || type;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Work Permits
          </CardTitle>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Work Permit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by description, permit number, or location..."
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
              {PERMIT_STATUS_OPTIONS.map(status => (
                <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Permit Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {PERMIT_TYPE_OPTIONS.map(type => (
                <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : filteredPermits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No work permits found. Create your first one to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Permit #</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Start</TableHead>
                <TableHead>End</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPermits.map((wp) => (
                <TableRow key={wp.id}>
                  <TableCell className="font-mono text-sm">
                    <button
                      onClick={() => setSelectedPermit(wp)}
                      className="text-primary hover:underline"
                    >
                      {wp.permit_number}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{getPermitTypeLabel(wp.permit_type)}</Badge>
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate">
                    {wp.work_description}
                  </TableCell>
                  <TableCell>{wp.work_location}</TableCell>
                  <TableCell>{format(new Date(wp.start_datetime), 'dd MMM HH:mm')}</TableCell>
                  <TableCell>{format(new Date(wp.end_datetime), 'dd MMM HH:mm')}</TableCell>
                  <TableCell>{getStatusBadge(wp.status)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {wp.status === 'Pending' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleApprove(wp)}
                          title="Approve"
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      {wp.status === 'Approved' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleActivate(wp)}
                          title="Start Work"
                        >
                          <Clock className="h-4 w-4 text-blue-600" />
                        </Button>
                      )}
                      {wp.status === 'Active' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleComplete(wp)}
                          title="Complete"
                        >
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedPermit(wp)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletePermit(wp)}
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

      <CreateWorkPermitModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
      />

      {selectedPermit && (
        <WorkPermitDetailModal
          permit={selectedPermit}
          open={!!selectedPermit}
          onOpenChange={(open) => !open && setSelectedPermit(null)}
        />
      )}

      <AlertDialog open={!!deletePermit} onOpenChange={(open) => !open && setDeletePermit(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Work Permit?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the work permit "{deletePermit?.permit_number}".
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

export default WorkPermitsTab;
