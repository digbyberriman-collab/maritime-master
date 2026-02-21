import { useState, useEffect } from 'react';
import { 
  FileText, Search, Filter, AlertTriangle, CheckCircle,
  Upload, FolderOpen, Loader2, Download, Eye, X
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { format, differenceInDays } from 'date-fns';

interface CrewDocument {
  id: string;
  userId: string;
  crewName: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  expiryDate?: string;
  status: 'valid' | 'expiring' | 'expired' | 'missing';
  verified: boolean;
}

// Standard document types required for crew
const REQUIRED_DOCUMENTS = [
  { type: 'passport', label: 'Passport', category: 'identity' },
  { type: 'seamans_book', label: "Seaman's Book", category: 'identity' },
  { type: 'stcw_basic', label: 'STCW Basic Safety', category: 'stcw' },
  { type: 'medical_certificate', label: 'Medical Certificate (ENG1/ML5)', category: 'medical' },
  { type: 'coc', label: 'Certificate of Competency', category: 'competency' },
  { type: 'flag_endorsement', label: 'Flag State Endorsement', category: 'competency' },
  { type: 'gmdss', label: 'GMDSS Certificate', category: 'radio' },
  { type: 'travel_insurance', label: 'Travel Insurance', category: 'insurance' },
];

const CATEGORIES = [
  { value: 'all', label: 'All Documents' },
  { value: 'identity', label: 'Identity' },
  { value: 'stcw', label: 'STCW Certificates' },
  { value: 'medical', label: 'Medical' },
  { value: 'competency', label: 'Competency' },
  { value: 'radio', label: 'Radio' },
  { value: 'insurance', label: 'Insurance' },
];

export default function CrewDocuments() {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [documents, setDocuments] = useState<CrewDocument[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [crewMembers, setCrewMembers] = useState<any[]>([]);
  const [selectedCrew, setSelectedCrew] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [profile?.company_id]);

  async function loadData() {
    if (!profile?.company_id) return;
    
    setLoading(true);
    try {
      // Load crew members
      const { data: crew } = await supabase
        .from('profiles')
        .select('user_id, first_name, last_name')
        .eq('company_id', profile.company_id)
        .order('last_name');

      setCrewMembers(crew || []);

      // Load crew certificates (used as documents) - use explicit FK hint
      const { data: certs } = await supabase
        .from('crew_certificates')
        .select(`
          id, user_id, certificate_name, certificate_type, 
          expiry_date, file_url, file_name, status, created_at
        `)
        .order('created_at', { ascending: false });

      // Load crew attachments - use explicit FK hint
      const { data: attachments } = await supabase
        .from('crew_attachments')
        .select(`
          id, user_id, attachment_type, file_name, file_url, created_at
        `)
        .order('created_at', { ascending: false });

      // Create a map of crew members for lookup
      const crewMap = new Map(crew?.map(c => [c.user_id, `${c.first_name} ${c.last_name}`]) || []);

      const allDocs: CrewDocument[] = [];
      const today = new Date();

      // Process certificates
      certs?.forEach((cert: any) => {
        const expiryDate = cert.expiry_date ? new Date(cert.expiry_date) : null;
        const daysUntil = expiryDate ? differenceInDays(expiryDate, today) : null;
        
        let status: 'valid' | 'expiring' | 'expired' | 'missing' = 'valid';
        if (daysUntil !== null) {
          if (daysUntil < 0) status = 'expired';
          else if (daysUntil <= 90) status = 'expiring';
        }

        allDocs.push({
          id: cert.id,
          userId: cert.user_id,
          crewName: crewMap.get(cert.user_id) || 'Unknown',
          documentType: cert.certificate_type,
          fileName: cert.file_name || cert.certificate_name,
          fileUrl: cert.file_url || '',
          uploadedAt: cert.created_at,
          expiryDate: cert.expiry_date || undefined,
          status,
          verified: cert.status === 'valid',
        });
      });

      // Process attachments
      attachments?.forEach((att: any) => {
        allDocs.push({
          id: att.id,
          userId: att.user_id,
          crewName: crewMap.get(att.user_id) || 'Unknown',
          documentType: att.attachment_type,
          fileName: att.file_name,
          fileUrl: att.file_url,
          uploadedAt: att.created_at,
          status: 'valid',
          verified: true,
        });
      });

      setDocuments(allDocs);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredDocuments = documents.filter(doc => {
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (
        !doc.crewName.toLowerCase().includes(query) &&
        !doc.documentType.toLowerCase().includes(query) &&
        !doc.fileName.toLowerCase().includes(query)
      ) {
        return false;
      }
    }

    // Status filter
    if (statusFilter !== 'all' && doc.status !== statusFilter) {
      return false;
    }

    // Crew filter
    if (selectedCrew !== 'all' && doc.userId !== selectedCrew) {
      return false;
    }

    return true;
  });

  const statusCounts = {
    valid: documents.filter(d => d.status === 'valid').length,
    expiring: documents.filter(d => d.status === 'expiring').length,
    expired: documents.filter(d => d.status === 'expired').length,
    total: documents.length,
  };

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
              <FolderOpen className="h-6 w-6" />
              Crew Documents
            </h1>
            <p className="text-muted-foreground">
              Fleet-wide crew document management and compliance tracking
            </p>
          </div>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Total Documents</p>
              <p className="text-2xl font-bold">{statusCounts.total}</p>
            </CardContent>
          </Card>
          <Card className="border-success/30">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Valid</p>
              <p className="text-2xl font-bold text-success">{statusCounts.valid}</p>
            </CardContent>
          </Card>
          <Card className="border-warning/30">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Expiring Soon</p>
              <p className="text-2xl font-bold text-warning">{statusCounts.expiring}</p>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardContent className="py-4">
              <p className="text-sm text-muted-foreground">Expired</p>
              <p className="text-2xl font-bold text-destructive">{statusCounts.expired}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={selectedCrew} onValueChange={setSelectedCrew}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Crew" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Crew</SelectItem>
                  {crewMembers.map(cm => (
                    <SelectItem key={cm.user_id} value={cm.user_id}>
                      {cm.last_name}, {cm.first_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="valid">Valid</SelectItem>
                  <SelectItem value="expiring">Expiring</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Documents ({filteredDocuments.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredDocuments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-2" />
                <p>No documents found</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredDocuments.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50"
                  >
                    <div className={`p-2 rounded-lg ${
                      doc.status === 'expired' 
                        ? 'bg-destructive/10 text-destructive'
                        : doc.status === 'expiring'
                        ? 'bg-warning/10 text-warning'
                        : 'bg-success/10 text-success'
                    }`}>
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{doc.fileName}</p>
                      <p className="text-sm text-muted-foreground">
                        {doc.crewName} • {doc.documentType}
                      </p>
                    </div>
                    <div className="text-right">
                      {doc.expiryDate && (
                        <p className="text-xs text-muted-foreground">
                          Expires: {format(new Date(doc.expiryDate), 'MMM d, yyyy')}
                        </p>
                      )}
                      <Badge 
                        variant="outline"
                        className={
                          doc.status === 'expired' 
                            ? 'bg-destructive/10 text-destructive'
                            : doc.status === 'expiring'
                            ? 'bg-warning/10 text-warning'
                            : 'bg-success/10 text-success'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </div>
                    <div className="flex gap-1">
                      {doc.fileUrl && (
                        <>
                          <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Download className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
