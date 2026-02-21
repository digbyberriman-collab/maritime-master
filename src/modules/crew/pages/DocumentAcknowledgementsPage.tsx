import { useState, useEffect, useMemo } from 'react';
import { 
  FileCheck, CheckCircle, Clock, AlertTriangle, Search, 
  Filter, FileText, User, Calendar, Loader2, Eye
} from 'lucide-react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';

interface Document {
  id: string;
  title: string;
  category_id: string | null;
  category_name?: string;
  document_number: string | null;
  is_mandatory_read: boolean | null;
  revision: number | null;
  created_at: string;
  file_url: string | null;
}

interface Acknowledgement {
  id: string;
  document_id: string;
  user_id: string;
  acknowledged_at: string;
  document?: Document;
}

interface PendingDocument extends Document {
  isAcknowledged: boolean;
}

export default function DocumentAcknowledgementsPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<PendingDocument[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<Acknowledgement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'acknowledged'>('pending');
  
  // Acknowledge modal
  const [selectedDoc, setSelectedDoc] = useState<PendingDocument | null>(null);
  const [hasRead, setHasRead] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [user?.id]);

  async function loadData() {
    if (!user?.id || !profile?.company_id) return;
    
    setLoading(true);
    try {
      // Load documents requiring acknowledgment
      const { data: docs } = await supabase
        .from('documents')
        .select(`
          id, title, category_id, document_number, is_mandatory_read, 
          revision, created_at, file_url,
          category:document_categories(name)
        `)
        .eq('company_id', profile.company_id)
        .eq('is_mandatory_read', true)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      // Load user's acknowledgements
      const { data: acks } = await supabase
        .from('document_acknowledgments')
        .select('id, document_id, user_id, acknowledged_at')
        .eq('user_id', user.id);

      const ackDocIds = new Set(acks?.map(a => a.document_id) || []);
      
      const processedDocs: PendingDocument[] = (docs || []).map((doc: any) => ({
        id: doc.id,
        title: doc.title,
        category_id: doc.category_id,
        category_name: doc.category?.name || 'Uncategorized',
        document_number: doc.document_number,
        is_mandatory_read: doc.is_mandatory_read,
        revision: doc.revision,
        created_at: doc.created_at,
        file_url: doc.file_url,
        isAcknowledged: ackDocIds.has(doc.id),
      }));

      setDocuments(processedDocs);
      setAcknowledgements(acks || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleAcknowledge() {
    if (!selectedDoc || !user?.id) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('document_acknowledgments')
        .insert({
          document_id: selectedDoc.id,
          user_id: user.id,
          acknowledged_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document acknowledged successfully',
      });

      setSelectedDoc(null);
      setHasRead(false);
      loadData();
    } catch (error) {
      console.error('Failed to acknowledge:', error);
      toast({
        title: 'Error',
        description: 'Failed to acknowledge document',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  const filteredDocs = useMemo(() => {
    let filtered = documents;
    
    if (activeTab === 'pending') {
      filtered = filtered.filter(d => !d.isAcknowledged);
    } else {
      filtered = filtered.filter(d => d.isAcknowledged);
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d => 
        d.title.toLowerCase().includes(query) ||
        d.category_name?.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [documents, activeTab, searchQuery]);

  const counts = useMemo(() => ({
    pending: documents.filter(d => !d.isAcknowledged).length,
    acknowledged: documents.filter(d => d.isAcknowledged).length,
  }), [documents]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FileCheck className="h-6 w-6" />
              Document Acknowledgements
            </h1>
            <p className="text-muted-foreground">
              Review and acknowledge required documents
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4">
          <Card className={counts.pending > 0 ? 'border-warning' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold">{counts.pending}</p>
                </div>
                <div className="p-2 rounded-lg bg-warning/10 text-warning">
                  <Clock className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Acknowledged</p>
                  <p className="text-2xl font-bold">{counts.acknowledged}</p>
                </div>
                <div className="p-2 rounded-lg bg-success/10 text-success">
                  <CheckCircle className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs & Search */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList>
              <TabsTrigger value="pending">
                Pending
                {counts.pending > 0 && (
                  <Badge variant="destructive" className="ml-2">{counts.pending}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="acknowledged">
                Acknowledged
              </TabsTrigger>
            </TabsList>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 max-w-xs"
              />
            </div>
          </div>

          <TabsContent value="pending" className="mt-4">
            {filteredDocs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 text-success" />
                  <h3 className="font-medium">All caught up!</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    No documents pending acknowledgement
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map((doc) => (
                  <DocumentCard 
                    key={doc.id} 
                    document={doc} 
                    onAcknowledge={() => setSelectedDoc(doc)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="acknowledged" className="mt-4">
            {filteredDocs.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  No acknowledged documents found
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredDocs.map((doc) => {
                  const ack = acknowledgements.find(a => a.document_id === doc.id);
                  return (
                    <DocumentCard 
                      key={doc.id} 
                      document={doc} 
                      acknowledgedAt={ack?.acknowledged_at}
                    />
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Acknowledge Modal */}
      <Dialog open={!!selectedDoc} onOpenChange={() => { setSelectedDoc(null); setHasRead(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acknowledge Document</DialogTitle>
          </DialogHeader>
          
          {selectedDoc && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-start gap-3">
                  <FileText className="h-10 w-10 text-primary" />
                  <div>
                    <h3 className="font-medium">{selectedDoc.title}</h3>
                    <p className="text-sm text-muted-foreground">{selectedDoc.category_name}</p>
                    {selectedDoc.document_number && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Doc #{selectedDoc.document_number} • Rev. {selectedDoc.revision || 1}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {selectedDoc.file_url && (
                <Button variant="outline" className="w-full" asChild>
                  <a href={selectedDoc.file_url} target="_blank" rel="noopener noreferrer">
                    <Eye className="h-4 w-4 mr-2" />
                    View Document
                  </a>
                </Button>
              )}

              <div className="flex items-start gap-2 p-4 border rounded-lg">
                <Checkbox 
                  id="hasRead" 
                  checked={hasRead}
                  onCheckedChange={(checked) => setHasRead(checked === true)}
                />
                <Label htmlFor="hasRead" className="text-sm leading-relaxed cursor-pointer">
                  I confirm that I have read and understood this document. 
                  I acknowledge that I am responsible for complying with its contents.
                </Label>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedDoc(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAcknowledge} 
              disabled={!hasRead || submitting}
            >
              {submitting ? 'Acknowledging...' : 'Acknowledge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

function DocumentCard({ 
  document, 
  acknowledgedAt,
  onAcknowledge 
}: { 
  document: PendingDocument;
  acknowledgedAt?: string;
  onAcknowledge?: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-medium">{document.title}</h3>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Badge variant="outline">{document.category_name}</Badge>
                {document.document_number && (
                  <span>#{document.document_number}</span>
                )}
                <span>Rev. {document.revision || 1}</span>
              </div>
              
              {acknowledgedAt ? (
                <p className="text-xs text-success mt-2 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  Acknowledged {format(new Date(acknowledgedAt), 'MMM d, yyyy')}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  <Calendar className="h-3 w-3 inline mr-1" />
                  Published {format(new Date(document.created_at), 'MMM d, yyyy')}
                </p>
              )}
            </div>
          </div>

          {onAcknowledge && !document.isAcknowledged && (
            <Button size="sm" onClick={onAcknowledge}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Acknowledge
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
