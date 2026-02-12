import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText, Upload, Search, Filter, Loader2,
  Eye, Download, Check, AlertCircle, Calendar
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface TravelDocument {
  id: string;
  document_type: string;
  original_filename: string;
  standardised_filename: string | null;
  extraction_status: string;
  verified: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  crew_member: {
    first_name: string;
    last_name: string;
  };
}

const documentTypeLabels: Record<string, string> = {
  flight_ticket: 'Flight Ticket',
  e_ticket: 'E-Ticket',
  boarding_pass: 'Boarding Pass',
  itinerary: 'Itinerary',
  visa: 'Visa',
  visa_letter: 'Visa Letter',
  travel_letter: 'Travel Letter',
  travel_insurance: 'Travel Insurance',
  covid_certificate: 'COVID Certificate',
  vaccination_record: 'Vaccination Record',
  pcr_test: 'PCR Test',
  health_declaration: 'Health Declaration',
  receipt: 'Receipt',
  other: 'Other',
};

const extractionStatusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  processing: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  manual: 'bg-gray-100 text-gray-700',
};

export default function TravelDocumentsPage() {
  const [documents, setDocuments] = useState<TravelDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from('crew_travel_documents')
        .select(`
          *,
          crew_member:profiles(first_name, last_name)
        `)
        .order('created_at', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('document_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = documents.filter(d => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      d.crew_member?.first_name?.toLowerCase().includes(searchLower) ||
      d.crew_member?.last_name?.toLowerCase().includes(searchLower) ||
      d.original_filename.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-6 h-6" />
            Travel Documents
          </h1>
          <p className="text-muted-foreground">Manage crew travel documents</p>
        </div>
        <Button asChild>
          <Link to="/crew/admin/documents/upload">
            <Upload className="w-4 h-4 mr-2" />
            Upload Documents
          </Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or filename..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Document Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {Object.entries(documentTypeLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Documents Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredDocuments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No documents found</p>
            <Button asChild className="mt-4">
              <Link to="/crew/admin/documents/upload">Upload Documents</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Crew Member</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Validity</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium truncate max-w-[200px]">
                        {doc.standardised_filename || doc.original_filename}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.crew_member?.first_name} {doc.crew_member?.last_name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {documentTypeLabels[doc.document_type] || doc.document_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge className={extractionStatusColors[doc.extraction_status]}>
                        {doc.extraction_status}
                      </Badge>
                      {doc.verified && (
                        <Check className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {doc.valid_until ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(doc.valid_until), 'MMM d, yyyy')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(doc.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
