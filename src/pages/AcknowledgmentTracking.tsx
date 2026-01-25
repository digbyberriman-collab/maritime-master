import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useAcknowledgmentStats, useCompanyCrew, useDocumentAcknowledgments } from '@/hooks/useAcknowledgments';
import { useVessels } from '@/hooks/useVessels';
import { useDocumentCategories } from '@/hooks/useDocuments';
import {
  FileCheck,
  Send,
  Download,
  Eye,
  Filter,
  Users,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

const AcknowledgmentTracking: React.FC = () => {
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());
  const [vesselFilter, setVesselFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [reminderModalOpen, setReminderModalOpen] = useState(false);
  const [selectedDocForReminder, setSelectedDocForReminder] = useState<string | null>(null);

  const { data: stats, isLoading } = useAcknowledgmentStats();
  const { vessels } = useVessels();
  const { data: categories } = useDocumentCategories();
  const { data: crew } = useCompanyCrew();

  // Get acknowledgments for selected document
  const { data: acknowledgments } = useDocumentAcknowledgments(selectedDocForReminder);

  // Filter stats
  const filteredStats = stats?.filter(stat => {
    if (statusFilter === 'complete' && stat.percentComplete < 100) return false;
    if (statusFilter === 'pending' && stat.percentComplete === 100) return false;
    if (statusFilter === 'overdue' && stat.percentComplete >= 50) return false;
    if (categoryFilter !== 'all' && stat.category !== categoryFilter) return false;
    return true;
  });

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocuments(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDocuments.size === filteredStats?.length) {
      setSelectedDocuments(new Set());
    } else {
      setSelectedDocuments(new Set(filteredStats?.map(s => s.documentId)));
    }
  };

  const openReminderModal = (docId: string) => {
    setSelectedDocForReminder(docId);
    setReminderModalOpen(true);
  };

  // Get pending crew for reminder modal
  const acknowledgedUserIds = new Set(acknowledgments?.map(a => a.user_id));
  const pendingCrew = crew?.filter(c => !acknowledgedUserIds.has(c.user_id));

  // Summary stats
  const totalDocs = stats?.length || 0;
  const fullyAcknowledged = stats?.filter(s => s.percentComplete === 100).length || 0;
  const partiallyAcknowledged = stats?.filter(s => s.percentComplete > 0 && s.percentComplete < 100).length || 0;
  const notStarted = stats?.filter(s => s.percentComplete === 0).length || 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileCheck className="w-6 h-6" />
              Acknowledgment Tracking
            </h1>
            <p className="text-muted-foreground">
              Monitor mandatory document acknowledgments across your fleet
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={selectedDocuments.size === 0}>
              <Send className="w-4 h-4 mr-2" />
              Send Bulk Reminder ({selectedDocuments.size})
            </Button>
            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalDocs}</p>
                  <p className="text-sm text-muted-foreground">Total Mandatory Docs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{fullyAcknowledged}</p>
                  <p className="text-sm text-muted-foreground">Fully Acknowledged</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{partiallyAcknowledged}</p>
                  <p className="text-sm text-muted-foreground">In Progress</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{notStarted}</p>
                  <p className="text-sm text-muted-foreground">Not Started</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={vesselFilter} onValueChange={setVesselFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Vessels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels?.map(vessel => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="complete">All Acknowledged</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue (&lt;50%)</SelectItem>
                </SelectContent>
              </Select>

              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories?.map(cat => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle>Mandatory Documents</CardTitle>
            <CardDescription>
              Track acknowledgment progress for all mandatory read documents
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : filteredStats && filteredStats.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedDocuments.size === filteredStats.length && filteredStats.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-center">Total Crew</TableHead>
                    <TableHead className="text-center">Acknowledged</TableHead>
                    <TableHead className="text-center">Pending</TableHead>
                    <TableHead className="w-48">Progress</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStats.map((stat) => (
                    <TableRow key={stat.documentId}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDocuments.has(stat.documentId)}
                          onCheckedChange={() => toggleDocumentSelection(stat.documentId)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{stat.documentTitle}</p>
                          <p className="text-xs text-muted-foreground">{stat.documentNumber}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{stat.category}</Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          {stat.totalCrew}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          {stat.acknowledged}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {stat.pending > 0 ? (
                          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            {stat.pending}
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            0
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={stat.percentComplete} className="flex-1 h-2" />
                          <span className="text-sm text-muted-foreground w-12 text-right">
                            {stat.percentComplete}%
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="View Details">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Send Reminder"
                            onClick={() => openReminderModal(stat.documentId)}
                            disabled={stat.pending === 0}
                          >
                            <Send className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <FileCheck className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>No mandatory documents found</p>
                <p className="text-sm">Documents marked as "Mandatory Read" will appear here</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Send Reminder Modal */}
        <Dialog open={reminderModalOpen} onOpenChange={setReminderModalOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Send Reminder</DialogTitle>
              <DialogDescription>
                Send a reminder to crew members who haven't acknowledged this document.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <Checkbox id="selectAll" defaultChecked />
                <label htmlFor="selectAll" className="text-sm font-medium">
                  Send to all pending crew ({pendingCrew?.length || 0})
                </label>
              </div>

              <ScrollArea className="h-[200px] border rounded-lg p-3">
                {pendingCrew?.map((member) => (
                  <div key={member.user_id} className="flex items-center gap-2 py-2">
                    <Checkbox id={member.user_id} defaultChecked />
                    <label htmlFor={member.user_id} className="text-sm">
                      {member.first_name} {member.last_name}
                      <span className="text-muted-foreground ml-2">({member.email})</span>
                    </label>
                  </div>
                ))}
              </ScrollArea>

              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Email Preview</p>
                <div className="text-sm text-muted-foreground space-y-1">
                  <p><strong>Subject:</strong> Action Required: Acknowledge Document</p>
                  <p><strong>Body:</strong> You have a mandatory document pending acknowledgment...</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setReminderModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => setReminderModalOpen(false)}>
                <Send className="w-4 h-4 mr-2" />
                Send Reminder
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default AcknowledgmentTracking;
