import { useState, useEffect } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { 
  Shield, Search, Filter, Plus, FolderOpen, FileText,
  Eye, Download, Edit, Loader2, CheckCircle, Book, FileCheck
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';

interface SMSDocument {
  id: string;
  title: string;
  document_number: string | null;
  section: string;
  status: string;
  version: string | null;
  effective_date: string | null;
  last_reviewed: string | null;
}

const ismSections = [
  { id: '1', title: 'General', description: 'Definitions, application, objectives' },
  { id: '2', title: 'Safety & Environmental Protection Policy', description: 'Company policies and guidelines' },
  { id: '3', title: 'Company Responsibilities & Authority', description: 'Organizational structure and responsibilities' },
  { id: '4', title: 'Designated Person(s)', description: 'DPA responsibilities and authority' },
  { id: '5', title: 'Master\'s Responsibility & Authority', description: 'Master\'s overriding authority' },
  { id: '6', title: 'Resources & Personnel', description: 'Manning, training, familiarization' },
  { id: '7', title: 'Shipboard Operations', description: 'Key shipboard operations procedures' },
  { id: '8', title: 'Emergency Preparedness', description: 'Emergency response procedures' },
  { id: '9', title: 'Non-conformities, Accidents & Hazardous Occurrences', description: 'Reporting and analysis' },
  { id: '10', title: 'Maintenance of Ship & Equipment', description: 'Planned maintenance system' },
  { id: '11', title: 'Documentation', description: 'Document control procedures' },
  { id: '12', title: 'Company Verification, Review & Evaluation', description: 'Internal audits and management review' },
];

export default function ISM_SMS() {
  const [documents, setDocuments] = useState<SMSDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');

  useEffect(() => {
    loadDocuments();
  }, [sectionFilter]);

  async function loadDocuments() {
    setIsLoading(true);
    try {
      let query = supabase
        .from('documents')
        .select('*')
        .in('document_type', ['ism', 'sms'])
        .order('document_number', { ascending: true });

      if (sectionFilter !== 'all') {
        query = query.eq('section', sectionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDocuments((data || []) as SMSDocument[]);
    } catch (error) {
      console.error('Failed to load documents:', error);
      // Mock data
      setDocuments([
        { id: '1', title: 'Safety & Environmental Protection Policy', document_number: 'SMS-2.1', section: '2', status: 'active', version: '5.0', effective_date: '2024-01-01', last_reviewed: '2024-01-15' },
        { id: '2', title: 'Company Organization Chart', document_number: 'SMS-3.1', section: '3', status: 'active', version: '4.2', effective_date: '2023-12-01', last_reviewed: '2023-12-10' },
        { id: '3', title: 'DPA Appointment & Responsibilities', document_number: 'SMS-4.1', section: '4', status: 'active', version: '3.0', effective_date: '2024-02-01', last_reviewed: '2024-02-05' },
        { id: '4', title: 'Master\'s Standing Orders', document_number: 'SMS-5.1', section: '5', status: 'active', version: '6.1', effective_date: '2024-01-15', last_reviewed: '2024-01-20' },
        { id: '5', title: 'Crew Manning & Competence', document_number: 'SMS-6.1', section: '6', status: 'active', version: '4.0', effective_date: '2023-11-01', last_reviewed: '2023-11-15' },
        { id: '6', title: 'Navigation Procedures', document_number: 'SMS-7.1', section: '7', status: 'active', version: '5.2', effective_date: '2024-03-01', last_reviewed: '2024-03-05' },
        { id: '7', title: 'Emergency Muster List', document_number: 'SMS-8.1', section: '8', status: 'active', version: '3.5', effective_date: '2024-02-15', last_reviewed: '2024-02-20' },
        { id: '8', title: 'Incident Reporting Procedure', document_number: 'SMS-9.1', section: '9', status: 'active', version: '4.1', effective_date: '2024-01-01', last_reviewed: '2024-01-10' },
        { id: '9', title: 'Planned Maintenance System', document_number: 'SMS-10.1', section: '10', status: 'active', version: '5.0', effective_date: '2023-10-01', last_reviewed: '2023-10-15' },
        { id: '10', title: 'Document Control Procedure', document_number: 'SMS-11.1', section: '11', status: 'active', version: '3.2', effective_date: '2024-01-01', last_reviewed: '2024-01-05' },
        { id: '11', title: 'Internal Audit Procedure', document_number: 'SMS-12.1', section: '12', status: 'active', version: '4.0', effective_date: '2024-02-01', last_reviewed: '2024-02-10' },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  const filteredDocuments = documents.filter(d => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      d.title?.toLowerCase().includes(searchLower) ||
      d.document_number?.toLowerCase().includes(searchLower)
    );
  });

  // Calculate section completion
  const sectionCompleteness = ismSections.map(section => {
    const sectionDocs = documents.filter(d => d.section === section.id);
    return {
      ...section,
      documentCount: sectionDocs.length,
      hasDocuments: sectionDocs.length > 0,
    };
  });

  const completedSections = sectionCompleteness.filter(s => s.hasDocuments).length;
  const completionRate = Math.round((completedSections / ismSections.length) * 100);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Shield className="w-6 h-6" />
              ISM / SMS Documentation
            </h1>
            <p className="text-muted-foreground">ISM Code and Safety Management System documents</p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Document
          </Button>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                SMS Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="text-4xl font-bold">{completionRate}%</div>
                <div className="flex-1">
                  <Progress value={completionRate} className="h-3" />
                  <p className="text-sm text-muted-foreground mt-1">
                    {completedSections} of {ismSections.length} sections documented
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{documents.length}</p>
                  <p className="text-sm text-muted-foreground">Total Documents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {documents.filter(d => d.status === 'active').length}
                  </p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="documents">
          <TabsList>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="sections">ISM Sections</TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="mt-4 space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search documents..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={sectionFilter} onValueChange={setSectionFilter}>
                    <SelectTrigger className="w-full sm:w-[200px]">
                      <Book className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sections</SelectItem>
                      {ismSections.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.id}. {s.title.substring(0, 25)}...
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filteredDocuments.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Shield className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No documents found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredDocuments.map((doc) => (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                          <FileCheck className="w-6 h-6 text-primary" />
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium">{doc.title}</p>
                            <Badge variant="outline" className="bg-green-50 text-green-700">
                              {doc.status}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            {doc.document_number && (
                              <span className="font-mono">{doc.document_number}</span>
                            )}
                            {doc.version && (
                              <>
                                <span>•</span>
                                <span>v{doc.version}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>Section {doc.section}</span>
                          </div>
                        </div>
                        
                        <div className="flex-shrink-0 text-right text-sm text-muted-foreground">
                          {doc.last_reviewed && (
                            <p>Reviewed: {format(new Date(doc.last_reviewed), 'MMM d, yyyy')}</p>
                          )}
                        </div>
                        
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm">
                            <Edit className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sections" className="mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sectionCompleteness.map((section) => (
                <Card key={section.id} className={section.hasDocuments ? '' : 'opacity-60'}>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${
                        section.hasDocuments ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {section.id}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{section.title}</p>
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                        <p className="text-xs mt-2">
                          {section.documentCount} document(s)
                        </p>
                      </div>
                      {section.hasDocuments && (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
