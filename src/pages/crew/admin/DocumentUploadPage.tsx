import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { 
  Upload, Check, AlertCircle, Loader2, 
  Plane, ArrowLeft, Trash2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCrewOptions } from '@/hooks/useReferenceOptions';
import {
  extractDocumentMetadata,
  extractFlightData,
  matchCrewIdFromName,
  pickBestDate,
  type DocumentMetadataExtraction,
  type FlightExtractionResult,
} from '@/lib/aiDocumentExtraction';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';

interface UploadedFile {
  id: string;
  file: File;
  documentType: string;
  status: 'uploading' | 'processing' | 'extracted' | 'error';
  progress: number;
  extractedData?: FlightExtractionResult | DocumentMetadataExtraction | null;
  error?: string;
  standardisedName?: string;
  filePath?: string;
  extractionConfidence?: number;
  detectedCrewMemberId?: string | null;
}

const documentTypes = [
  { value: 'flight_ticket', label: 'Flight Ticket' },
  { value: 'e_ticket', label: 'E-Ticket' },
  { value: 'boarding_pass', label: 'Boarding Pass' },
  { value: 'itinerary', label: 'Itinerary' },
  { value: 'visa', label: 'Visa' },
  { value: 'visa_letter', label: 'Visa Letter' },
  { value: 'travel_letter', label: 'Travel Letter' },
  { value: 'travel_insurance', label: 'Travel Insurance' },
  { value: 'covid_certificate', label: 'COVID Certificate' },
  { value: 'vaccination_record', label: 'Vaccination Record' },
  { value: 'pcr_test', label: 'PCR Test' },
  { value: 'health_declaration', label: 'Health Declaration' },
  { value: 'receipt', label: 'Receipt' },
  { value: 'other', label: 'Other' },
];

export default function DocumentUploadPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { data: crewMembers = [] } = useCrewOptions();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [selectedCrewMember, setSelectedCrewMember] = useState('');
  const [documentType, setDocumentType] = useState('flight_ticket');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map(file => ({
      id: crypto.randomUUID(),
      file,
      documentType,
      status: 'uploading' as const,
      progress: 0,
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
    
    for (const uploadedFile of newFiles) {
      await processFile(uploadedFile);
    }
  }, [documentType, crewMembers, selectedCrewMember]);

  async function processFile(uploadedFile: UploadedFile) {
    try {
      updateFileStatus(uploadedFile.id, { status: 'uploading', progress: 30 });

      // Upload to Supabase Storage
      const filePath = `temp/${uploadedFile.id}/${uploadedFile.file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('crew-travel-documents')
        .upload(filePath, uploadedFile.file);

      if (uploadError) throw uploadError;

      updateFileStatus(uploadedFile.id, { status: 'processing', progress: 60, filePath });

      const isFlightDocument = ['flight_ticket', 'e_ticket', 'boarding_pass', 'itinerary'].includes(
        uploadedFile.documentType,
      );

      if (isFlightDocument) {
        const extractionResult = await extractFlightData({
          filePath,
          documentType: uploadedFile.documentType,
        });

        if (extractionResult) {
          const detectedCrewMemberId = matchCrewIdFromName(
            extractionResult.passengerName,
            crewMembers.map((crew) => ({
              id: crew.id,
              first_name: crew.first_name,
              last_name: crew.last_name,
            })),
          );
          if (!selectedCrewMember && detectedCrewMemberId) {
            setSelectedCrewMember(detectedCrewMemberId);
          }

          const standardisedName = generateStandardisedName(
            extractionResult,
            uploadedFile.documentType,
            uploadedFile.file.name,
          );

          updateFileStatus(uploadedFile.id, {
            status: 'extracted',
            progress: 100,
            extractedData: extractionResult,
            standardisedName,
            extractionConfidence: extractionResult.confidence,
            detectedCrewMemberId,
          });
          return;
        }
      } else {
        const metadata = await extractDocumentMetadata({
          file: uploadedFile.file,
          documentType: uploadedFile.documentType,
          hintTitle: uploadedFile.file.name.replace(/\.[^/.]+$/, ''),
        });

        if (metadata) {
          const detectedCrewMemberId = matchCrewIdFromName(
            metadata.entities?.crew_name,
            crewMembers.map((crew) => ({
              id: crew.id,
              first_name: crew.first_name,
              last_name: crew.last_name,
            })),
          );
          if (!selectedCrewMember && detectedCrewMemberId) {
            setSelectedCrewMember(detectedCrewMemberId);
          }

          updateFileStatus(uploadedFile.id, {
            status: 'extracted',
            progress: 100,
            extractedData: metadata,
            extractionConfidence: metadata.confidence,
            detectedCrewMemberId,
          });
          return;
        }
      }

      // Mark as complete without extraction
      updateFileStatus(uploadedFile.id, { 
        status: 'extracted', 
        progress: 100,
      });

    } catch (error) {
      updateFileStatus(uploadedFile.id, { 
        status: 'error', 
        error: error instanceof Error ? error.message : 'Processing failed'
      });
    }
  }

  function updateFileStatus(fileId: string, updates: Partial<UploadedFile>) {
    setFiles(prev => prev.map(f => f.id === fileId ? { ...f, ...updates } : f));
  }

  function generateStandardisedName(
    extractedData: FlightExtractionResult,
    docType: string,
    originalName: string,
  ): string {
    if (!extractedData?.flights?.length) return originalName;

    const flight = extractedData.flights[0];
    const date = flight.departureDateTime?.split('T')[0] || 'unknown';
    const name = extractedData.passengerName?.replace(/\s+/g, '') || 'Unknown';
    const route = `${flight.departureAirport}-${flight.arrivalAirport}`;

    const typeLabels: Record<string, string> = {
      flight_ticket: 'FlightTicket',
      e_ticket: 'ETicket',
      boarding_pass: 'BoardingPass',
      itinerary: 'Itinerary',
    };

    const ext = originalName.split('.').pop() || 'pdf';
    return `${name}_${date}_${route}_${typeLabels[docType] || docType}.${ext}`;
  }

  async function saveDocuments() {
    const successfulFiles = files.filter(f => f.status === 'extracted' && f.filePath);

    const missingCrewSelection = successfulFiles.find(
      (file) => !(selectedCrewMember || file.detectedCrewMemberId),
    );
    if (missingCrewSelection) {
      toast({
        title: 'Crew member required',
        description: 'Select a crew member or upload files with detectable crew names.',
        variant: 'destructive',
      });
      return;
    }
    
    for (const file of successfulFiles) {
      try {
        const flight = isFlightExtraction(file.extractedData) ? file.extractedData.flights?.[0] : undefined;
        const metadata = isMetadataExtraction(file.extractedData) ? file.extractedData : undefined;
        const travelDate = pickBestDate([
          metadata?.dates?.travel_date,
          flight?.departureDateTime,
          flight?.arrivalDateTime,
          metadata?.dates?.valid_from,
        ]);
        const validFrom = pickBestDate([metadata?.dates?.valid_from, travelDate]);
        const validUntil = pickBestDate([metadata?.dates?.valid_until, metadata?.dates?.next_review_date]);
        const originLocation = metadata?.entities?.origin_location || flight?.departureCity || flight?.departureAirport || null;
        const destinationLocation =
          metadata?.entities?.destination_location || flight?.arrivalCity || flight?.arrivalAirport || null;

        await supabase.from('crew_travel_documents').insert({
          crew_member_id: selectedCrewMember || file.detectedCrewMemberId!,
          company_id: profile?.company_id,
          document_type: file.documentType,
          original_filename: file.file.name,
          original_file_path: file.filePath!,
          file_size_bytes: file.file.size,
          mime_type: file.file.type,
          standardised_filename: file.standardisedName,
          extracted_data: file.extractedData || {},
          extraction_status: file.extractedData ? 'completed' : 'manual',
          origin_location: originLocation,
          destination_location: destinationLocation,
          travel_date: travelDate,
          valid_from: validFrom,
          valid_until: validUntil,
          uploaded_by: profile?.user_id,
        });
      } catch (error) {
        console.error('Failed to save document:', error);
      }
    }

    toast({
      title: 'Success',
      description: `${successfulFiles.length} document(s) saved successfully`,
    });

    navigate('/crew/admin/documents');
  }

  function removeFile(fileId: string) {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 
      'application/pdf': ['.pdf'], 
      'image/*': ['.png', '.jpg', '.jpeg'] 
    },
    multiple: true,
  });

  const hasSuccessfulUploads = files.some(f => f.status === 'extracted');
  const allReadyFilesHaveCrew = files
    .filter((f) => f.status === 'extracted' && f.filePath)
    .every((f) => Boolean(selectedCrewMember || f.detectedCrewMemberId));

  function isFlightExtraction(
    data: UploadedFile['extractedData'],
  ): data is FlightExtractionResult {
    return !!data && typeof data === 'object' && Array.isArray((data as FlightExtractionResult).flights);
  }

  function isMetadataExtraction(
    data: UploadedFile['extractedData'],
  ): data is DocumentMetadataExtraction {
    return !!data && typeof data === 'object' && ('entities' in data || 'dates' in data || 'title' in data);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Upload Travel Documents
          </h1>
          <p className="text-muted-foreground">
            Upload travel documents. AI will extract names, routes, dates, and key metadata automatically.
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Crew Member *</Label>
              <Select value={selectedCrewMember} onValueChange={setSelectedCrewMember}>
                <SelectTrigger>
                  <SelectValue placeholder="Select crew member" />
                </SelectTrigger>
                <SelectContent>
                  {crewMembers.map((cm) => (
                    <SelectItem key={cm.id} value={cm.id}>
                      {cm.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                AI will auto-suggest crew names from uploaded documents when possible.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Document Type</Label>
              <Select value={documentType} onValueChange={setDocumentType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {documentTypes.map((dt) => (
                    <SelectItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-lg font-medium">
          {isDragActive ? 'Drop files here...' : 'Drag & drop files here'}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to select files (PDF, PNG, JPG)
        </p>
      </div>

      {/* File List */}
      {files.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Uploaded Files ({files.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="border rounded-lg p-4 space-y-3"
              >
                <div className="flex items-start gap-4">
                  <div className={`p-2 rounded-full ${
                    file.status === 'extracted' ? 'bg-green-100 text-green-600' : 
                    file.status === 'error' ? 'bg-red-100 text-red-600' : 
                    'bg-blue-100 text-blue-600'
                  }`}>
                    {file.status === 'extracted' ? <Check className="w-5 h-5" /> : 
                     file.status === 'error' ? <AlertCircle className="w-5 h-5" /> : 
                     <Loader2 className="w-5 h-5 animate-spin" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium truncate">{file.file.name}</p>
                      <Badge variant={
                        file.status === 'uploading' ? 'secondary' : 
                        file.status === 'processing' ? 'outline' : 
                        file.status === 'extracted' ? 'default' : 
                        'destructive'
                      }>
                        {file.status === 'uploading' ? 'Uploading...' : 
                         file.status === 'processing' ? 'Extracting...' : 
                         file.status === 'extracted' ? 'Ready' : 
                         'Error'}
                      </Badge>
                    </div>

                    {(file.status === 'uploading' || file.status === 'processing') && (
                      <Progress value={file.progress} className="h-2" />
                    )}

                    {file.status === 'extracted' && file.extractedData && (
                      <div className="mt-2 p-3 bg-muted/50 rounded-lg text-sm space-y-1">
                        <p className="font-medium text-green-700">
                          Extracted Data
                          {typeof file.extractionConfidence === 'number'
                            ? ` (${Math.round(file.extractionConfidence * 100)}% confidence)`
                            : ''}
                          :
                        </p>
                        {isFlightExtraction(file.extractedData) ? (
                          <>
                            <p>Passenger: {file.extractedData.passengerName || 'Not detected'}</p>
                            {file.extractedData.flights?.map((flight, i) => (
                              <div key={i} className="flex items-center gap-2 text-muted-foreground">
                                <Plane className="w-3 h-3" />
                                <span>{flight.flightNumber}</span>
                                <span>{flight.departureAirport} → {flight.arrivalAirport}</span>
                              </div>
                            ))}
                          </>
                        ) : isMetadataExtraction(file.extractedData) ? (
                          <>
                            {file.extractedData.title && <p>Title: {file.extractedData.title}</p>}
                            {file.extractedData.entities?.crew_name && (
                              <p>Crew: {file.extractedData.entities.crew_name}</p>
                            )}
                            {(file.extractedData.entities?.origin_location ||
                              file.extractedData.entities?.destination_location) && (
                              <p>
                                Route: {file.extractedData.entities?.origin_location || 'Unknown'} →{' '}
                                {file.extractedData.entities?.destination_location || 'Unknown'}
                              </p>
                            )}
                          </>
                        ) : null}
                        {file.standardisedName && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Saved as: {file.standardisedName}
                          </p>
                        )}
                      </div>
                    )}

                    {file.status === 'error' && file.error && (
                      <p className="text-sm text-destructive mt-1">{file.error}</p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeFile(file.id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {files.length > 0 && (
        <div className="flex justify-end gap-4">
          <Button variant="outline" onClick={() => setFiles([])}>
            Clear All
          </Button>
          <Button onClick={saveDocuments} disabled={!hasSuccessfulUploads || !allReadyFilesHaveCrew}>
            Save {files.filter(f => f.status === 'extracted').length} Document(s)
          </Button>
        </div>
      )}
    </div>
  );
}
