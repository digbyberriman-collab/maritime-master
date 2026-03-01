import React, { useState } from 'react';
import { toast } from 'sonner';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import {
  useDocumentReviews,
  useOverdueReviewCount,
  useUpcomingReviewCount,
  useMarkAsReviewed,
  ReviewDocument,
} from '@/modules/documents/hooks/useDocumentReviews';
import { format, addYears } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Calendar as CalendarIcon,
  Clock,
  AlertTriangle,
  CheckCircle,
  FileCheck,
  RefreshCw,
  Eye,
} from 'lucide-react';

const ReviewDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState('overdue');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ReviewDocument | null>(null);
  const [nextReviewDate, setNextReviewDate] = useState<Date | undefined>(undefined);
  const [comments, setComments] = useState('');

  const { data: reviews = [], isLoading } = useDocumentReviews();
  const { data: overdueCount = 0 } = useOverdueReviewCount();
  const { data: upcomingCount = 0 } = useUpcomingReviewCount();
  const markAsReviewedMutation = useMarkAsReviewed();

  const overdueReviews = reviews.filter(r => r.urgencyLevel === 'overdue');
  const urgentReviews = reviews.filter(r => r.urgencyLevel === 'urgent');
  const warningReviews = reviews.filter(r => r.urgencyLevel === 'warning');
  const normalReviews = reviews.filter(r => r.urgencyLevel === 'normal');

  const openReviewModal = (doc: ReviewDocument) => {
    setSelectedDocument(doc);
    setNextReviewDate(addYears(new Date(), 1));
    setComments('');
    setReviewModalOpen(true);
  };

  const handleMarkAsReviewed = () => {
    if (selectedDocument && nextReviewDate) {
      markAsReviewedMutation.mutate({
        documentId: selectedDocument.id,
        nextReviewDate: format(nextReviewDate, 'yyyy-MM-dd'),
        comments,
      });
      setReviewModalOpen(false);
    }
  };

  const getUrgencyBadge = (urgency: ReviewDocument['urgencyLevel']) => {
    switch (urgency) {
      case 'overdue':
        return <Badge variant="destructive">Overdue</Badge>;
      case 'urgent':
        return <Badge className="bg-orange-500 hover:bg-orange-600">Due &lt;30 days</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Due &lt;60 days</Badge>;
      default:
        return <Badge variant="secondary">Upcoming</Badge>;
    }
  };

  const DocumentTable = ({ documents }: { documents: ReviewDocument[] }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Document</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Next Review</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
              No documents in this category
            </TableCell>
          </TableRow>
        ) : (
          documents.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell>
                <div>
                  <p className="font-medium">{doc.title}</p>
                  <p className="text-xs text-muted-foreground font-mono">{doc.document_number}</p>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  style={{ borderColor: doc.category?.color, color: doc.category?.color }}
                >
                  {doc.category?.name}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'font-medium',
                    doc.isOverdue && 'text-destructive'
                  )}>
                    {doc.next_review_date
                      ? format(new Date(doc.next_review_date), 'MMM d, yyyy')
                      : '-'}
                  </span>
                  {doc.isOverdue ? (
                    <span className="text-xs text-destructive">
                      ({Math.abs(doc.daysUntilDue)} days overdue)
                    </span>
                  ) : doc.daysUntilDue <= 90 && (
                    <span className="text-xs text-muted-foreground">
                      ({doc.daysUntilDue} days)
                    </span>
                  )}
                </div>
              </TableCell>
              <TableCell>{getUrgencyBadge(doc.urgencyLevel)}</TableCell>
              <TableCell>
                {doc.author
                  ? `${doc.author.first_name} ${doc.author.last_name}`
                  : '-'}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing document: ${doc.title}`)}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="sm" onClick={() => openReviewModal(doc)}>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Mark Reviewed
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <RefreshCw className="w-6 h-6" />
            Document Reviews
          </h1>
          <p className="text-muted-foreground">
            Manage document review schedules and track overdue reviews
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              activeTab === 'overdue' && 'ring-2 ring-destructive'
            )}
            onClick={() => setActiveTab('overdue')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-destructive" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{overdueReviews.length}</p>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              activeTab === 'urgent' && 'ring-2 ring-orange-500'
            )}
            onClick={() => setActiveTab('urgent')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{urgentReviews.length}</p>
                  <p className="text-sm text-muted-foreground">Due in 30 days</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              activeTab === 'warning' && 'ring-2 ring-yellow-500'
            )}
            onClick={() => setActiveTab('warning')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6 text-yellow-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{warningReviews.length}</p>
                  <p className="text-sm text-muted-foreground">Due in 60 days</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              activeTab === 'upcoming' && 'ring-2 ring-primary'
            )}
            onClick={() => setActiveTab('upcoming')}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileCheck className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{normalReviews.length}</p>
                  <p className="text-sm text-muted-foreground">Upcoming (90+ days)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Card>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="overdue" className="gap-2">
                  Overdue
                  {overdueReviews.length > 0 && (
                    <Badge variant="destructive" className="ml-1">{overdueReviews.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="urgent">Due in 30 days</TabsTrigger>
                <TabsTrigger value="warning">Due in 60 days</TabsTrigger>
                <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                <TabsTrigger value="all">All Reviews</TabsTrigger>
              </TabsList>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                </div>
              ) : (
                <>
                  <TabsContent value="overdue" className="mt-4">
                    <DocumentTable documents={overdueReviews} />
                  </TabsContent>
                  <TabsContent value="urgent" className="mt-4">
                    <DocumentTable documents={urgentReviews} />
                  </TabsContent>
                  <TabsContent value="warning" className="mt-4">
                    <DocumentTable documents={warningReviews} />
                  </TabsContent>
                  <TabsContent value="upcoming" className="mt-4">
                    <DocumentTable documents={normalReviews} />
                  </TabsContent>
                  <TabsContent value="all" className="mt-4">
                    <DocumentTable documents={reviews} />
                  </TabsContent>
                </>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Mark as Reviewed Modal */}
        <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark Document as Reviewed</DialogTitle>
              <DialogDescription>
                Confirm that you have reviewed this document and set the next review date.
              </DialogDescription>
            </DialogHeader>

            {selectedDocument && (
              <div className="space-y-4 py-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="font-medium">{selectedDocument.title}</p>
                  <p className="text-sm text-muted-foreground font-mono">
                    {selectedDocument.document_number}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Next Review Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !nextReviewDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {nextReviewDate ? format(nextReviewDate, 'PPP') : 'Select date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={nextReviewDate}
                        onSelect={setNextReviewDate}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">Review Comments (Optional)</Label>
                  <Textarea
                    id="comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder="Any notes about this review..."
                    rows={3}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleMarkAsReviewed}
                disabled={!nextReviewDate || markAsReviewedMutation.isPending}
              >
                {markAsReviewedMutation.isPending ? 'Saving...' : 'Confirm Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default ReviewDashboard;
