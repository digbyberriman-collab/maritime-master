import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Document } from '@/modules/documents/hooks/useDocuments';
import {
  useDocumentAcknowledgments,
  useUserAcknowledgment,
  useDocumentVersions,
  useAcknowledgeMutation,
  useCompanyCrew,
} from '@/modules/auth/hooks/useAcknowledgments';
import { DOCUMENT_STATUSES, ISM_SECTIONS, formatFileSize } from '@/modules/documents/constants';
import { format, formatDistanceToNow } from 'date-fns';
import {
  X,
  Download,
  Printer,
  FileText,
  User,
  Calendar,
  Tag,
  Clock,
  CheckCircle,
  AlertCircle,
  History,
  Users,
  Send,
} from 'lucide-react';
import PDFViewer from './PDFViewer';

interface DocumentViewerModalProps {
  document: Document | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  open,
  onOpenChange,
}) => {
  const [activeTab, setActiveTab] = useState('details');
  const [hasRead, setHasRead] = useState(false);
  const [ackFilter, setAckFilter] = useState<'all' | 'acknowledged' | 'pending'>('all');

  const { data: acknowledgments } = useDocumentAcknowledgments(document?.id || null);
  const { data: userAcknowledgment } = useUserAcknowledgment(document?.id || null);
  const { data: versions } = useDocumentVersions(document?.id || null);
  const { data: crew } = useCompanyCrew();
  const acknowledgeMutation = useAcknowledgeMutation();

  if (!document) return null;

  const statusConfig = DOCUMENT_STATUSES.find((s) => s.value === document.status);
  const ismSectionLabels = document.ism_sections
    .map((s) => ISM_SECTIONS.find((section) => section.value === s)?.label)
    .filter(Boolean);

  const isPdf = document.file_type === 'application/pdf';
  const needsAcknowledgment = document.is_mandatory_read && !userAcknowledgment;

  // Calculate acknowledgment stats
  const totalCrew = crew?.length || 0;
  const acknowledgedCount = acknowledgments?.length || 0;
  const pendingCount = totalCrew - acknowledgedCount;
  const percentComplete = totalCrew > 0 ? Math.round((acknowledgedCount / totalCrew) * 100) : 0;

  // Get acknowledged user IDs for filtering
  const acknowledgedUserIds = new Set(acknowledgments?.map(a => a.user_id));

  // Filter crew for acknowledgments tab
  const filteredCrewWithStatus = crew?.map(member => ({
    ...member,
    acknowledged: acknowledgedUserIds.has(member.user_id),
    acknowledgment: acknowledgments?.find(a => a.user_id === member.user_id),
  })).filter(member => {
    if (ackFilter === 'acknowledged') return member.acknowledged;
    if (ackFilter === 'pending') return !member.acknowledged;
    return true;
  });

  const handleDownload = () => {
    window.open(document.file_url, '_blank');
  };

  const handlePrint = () => {
    const printWindow = window.open(document.file_url, '_blank');
    if (printWindow) {
      printWindow.addEventListener('load', () => {
        printWindow.print();
      });
    }
  };

  const handleAcknowledge = () => {
    if (document.id) {
      acknowledgeMutation.mutate(document.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] h-[95vh] p-0 gap-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold">{document.title}</h2>
                <Badge variant="outline" className="font-mono text-xs">
                  {document.document_number}
                </Badge>
                {statusConfig && (
                  <Badge className={statusConfig.color}>{statusConfig.label}</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Acknowledgment Banner */}
        {needsAcknowledgment && (
          <div className="flex items-center justify-between px-6 py-3 bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-500" />
              <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                You must acknowledge reading this document
              </span>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={hasRead}
                  onCheckedChange={(checked) => setHasRead(!!checked)}
                />
                <span className="text-sm text-yellow-800 dark:text-yellow-200">
                  I have read and understood this document
                </span>
              </label>
              <Button
                size="sm"
                disabled={!hasRead || acknowledgeMutation.isPending}
                onClick={handleAcknowledge}
              >
                {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge'}
              </Button>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - PDF Viewer */}
          <div className="flex-1 border-r">
            {isPdf ? (
              <PDFViewer fileUrl={document.file_url} className="h-full" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <FileText className="w-16 h-16" />
                <p>Preview not available for this file type</p>
                <Button onClick={handleDownload}>
                  <Download className="w-4 h-4 mr-2" />
                  Download to view
                </Button>
              </div>
            )}
          </div>

          {/* Right Panel - Tabs */}
          <div className="w-[400px] flex flex-col">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <TabsList className="w-full justify-start rounded-none border-b px-4 pt-2 h-auto bg-transparent">
                <TabsTrigger value="details" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  Details
                </TabsTrigger>
                <TabsTrigger value="versions" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                  <History className="w-4 h-4 mr-1" />
                  Versions
                </TabsTrigger>
                {document.is_mandatory_read && (
                  <TabsTrigger value="acknowledgments" className="data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
                    <Users className="w-4 h-4 mr-1" />
                    Acknowledgments
                  </TabsTrigger>
                )}
              </TabsList>

              {/* Details Tab */}
              <TabsContent value="details" className="flex-1 m-0">
                <ScrollArea className="h-[calc(95vh-180px)]">
                  <div className="p-4 space-y-6">
                    {/* Category & Revision */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Category</p>
                        <Badge variant="outline" style={{ borderColor: document.category?.color, color: document.category?.color }}>
                          {document.category?.name}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Revision</p>
                        <Badge variant="secondary">{document.revision}</Badge>
                      </div>
                    </div>

                    {/* Language & File Info */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">Language</p>
                        <p className="text-sm font-medium">{document.language}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground mb-1">File Size</p>
                        <p className="text-sm font-medium">{formatFileSize(document.file_size)}</p>
                      </div>
                    </div>

                    {/* Author */}
                    <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                      <User className="w-5 h-5 text-muted-foreground" />
                      <div>
                        <p className="text-xs text-muted-foreground">Author</p>
                        <p className="text-sm font-medium">
                          {document.author ? `${document.author.first_name} ${document.author.last_name}` : 'Unknown'}
                        </p>
                      </div>
                    </div>

                    {/* Dates */}
                    <div className="space-y-3">
                      {document.issue_date && (
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Issue Date</p>
                            <p className="text-sm">{format(new Date(document.issue_date), 'MMM d, yyyy')}</p>
                          </div>
                        </div>
                      )}
                      {document.next_review_date && (
                        <div className="flex items-center gap-3">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Next Review</p>
                            <p className="text-sm">
                              {format(new Date(document.next_review_date), 'MMM d, yyyy')}
                              <span className="text-muted-foreground ml-2">
                                ({formatDistanceToNow(new Date(document.next_review_date), { addSuffix: true })})
                              </span>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Tags */}
                    {document.tags && document.tags.length > 0 && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Tag className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">Tags</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {document.tags.map((tag) => (
                            <Badge key={tag} variant="secondary" className="text-xs">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ISM Sections */}
                    {ismSectionLabels.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">ISM Sections</p>
                        <div className="space-y-1">
                          {ismSectionLabels.map((label) => (
                            <div key={label} className="text-sm text-muted-foreground flex items-center gap-2">
                              <CheckCircle className="w-3 h-3 text-primary" />
                              {label}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Description */}
                    {document.description && (
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Description</p>
                        <p className="text-sm">{document.description}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Versions Tab */}
              <TabsContent value="versions" className="flex-1 m-0">
                <ScrollArea className="h-[calc(95vh-180px)]">
                  <div className="p-4 space-y-3">
                    {/* Current version */}
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{document.revision}</span>
                        <Badge>Current</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(document.updated_at), 'MMM d, yyyy')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        By {document.author ? `${document.author.first_name} ${document.author.last_name}` : 'Unknown'}
                      </p>
                    </div>

                    {/* Previous versions */}
                    {versions && versions.length > 0 ? (
                      versions.map((version) => (
                        <div key={version.id} className="p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">{version.revision}</span>
                            <Button variant="ghost" size="sm" className="h-7 text-xs">
                              View
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(version.created_at), 'MMM d, yyyy')}
                          </p>
                          {version.creator && (
                            <p className="text-xs text-muted-foreground">
                              By {version.creator.first_name} {version.creator.last_name}
                            </p>
                          )}
                          {version.change_summary && (
                            <p className="text-sm mt-2 text-muted-foreground">
                              {version.change_summary}
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <History className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No previous versions</p>
                        <p className="text-sm">Version history will appear here</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Acknowledgments Tab */}
              {document.is_mandatory_read && (
                <TabsContent value="acknowledgments" className="flex-1 m-0">
                  <ScrollArea className="h-[calc(95vh-180px)]">
                    <div className="p-4 space-y-4">
                      {/* Progress */}
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            {acknowledgedCount}/{totalCrew} crew acknowledged
                          </span>
                          <span className="text-sm text-muted-foreground">{percentComplete}%</span>
                        </div>
                        <Progress value={percentComplete} className="h-2" />
                      </div>

                      {/* Send Reminder Button */}
                      {pendingCount > 0 && (
                        <Button variant="outline" className="w-full">
                          <Send className="w-4 h-4 mr-2" />
                          Send Reminder to {pendingCount} Pending
                        </Button>
                      )}

                      {/* Filter */}
                      <div className="flex gap-2">
                        <Button
                          variant={ackFilter === 'all' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAckFilter('all')}
                        >
                          All ({totalCrew})
                        </Button>
                        <Button
                          variant={ackFilter === 'acknowledged' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAckFilter('acknowledged')}
                        >
                          Acknowledged ({acknowledgedCount})
                        </Button>
                        <Button
                          variant={ackFilter === 'pending' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setAckFilter('pending')}
                        >
                          Pending ({pendingCount})
                        </Button>
                      </div>

                      {/* Crew List */}
                      <div className="space-y-2">
                        {filteredCrewWithStatus?.map((member) => (
                          <div
                            key={member.user_id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              {member.acknowledged ? (
                                <CheckCircle className="w-5 h-5 text-green-500" />
                              ) : (
                                <Clock className="w-5 h-5 text-yellow-500" />
                              )}
                              <div>
                                <p className="text-sm font-medium">
                                  {member.first_name} {member.last_name}
                                </p>
                                {member.acknowledged && member.acknowledgment && (
                                  <p className="text-xs text-muted-foreground">
                                    Read on {format(new Date(member.acknowledgment.acknowledged_at), 'MMM d, yyyy')}
                                  </p>
                                )}
                                {!member.acknowledged && (
                                  <p className="text-xs text-yellow-600">Not yet read</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              )}
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DocumentViewerModal;
