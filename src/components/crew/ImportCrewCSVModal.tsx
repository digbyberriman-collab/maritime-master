import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  X,
  FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  parseCrewCSV, 
  downloadCSVTemplate, 
  exportErrorRowsCSV,
  type ParseResult, 
  type ValidationResult 
} from '@/lib/csvParser';
import { useVessels } from '@/hooks/useVessels';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';

interface ImportCrewCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = 'upload' | 'validate' | 'importing' | 'complete';
type DuplicateAction = 'skip' | 'update';

interface ImportResults {
  created: number;
  skipped: number;
  errors: string[];
}

const ImportCrewCSVModal: React.FC<ImportCrewCSVModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { profile } = useAuth();
  const { vessels } = useVessels();
  const [step, setStep] = useState<ImportStep>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<DuplicateAction>('skip');
  const [existingEmails, setExistingEmails] = useState<string[]>([]);
  const [vesselMapping, setVesselMapping] = useState<Map<string, string>>(new Map());
  const [isValidating, setIsValidating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState<ImportResults | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024, // 5MB
  });

  const resetModal = () => {
    setStep('upload');
    setFile(null);
    setParseResult(null);
    setDuplicateAction('skip');
    setExistingEmails([]);
    setVesselMapping(new Map());
    setIsValidating(false);
    setIsImporting(false);
    setImportProgress(0);
    setImportResults(null);
  };

  const handleClose = () => {
    resetModal();
    onClose();
  };

  const handleValidate = async () => {
    if (!file) return;

    setIsValidating(true);
    try {
      // Parse CSV
      const result = await parseCrewCSV(file);
      setParseResult(result);

      // Check for duplicate emails in database
      const emails = result.results
        .filter(r => r.data.email)
        .map(r => r.data.email);

      if (emails.length > 0) {
        const { data: existingProfiles } = await supabase
          .from('profiles')
          .select('email')
          .in('email', emails);

        if (existingProfiles) {
          setExistingEmails(existingProfiles.map(p => p.email));
        }
      }

      // Build vessel mapping
      const vesselNames = [...new Set(result.results.map(r => r.data.vessel_assignment))];
      const mapping = new Map<string, string>();

      for (const name of vesselNames) {
        // Try to find vessel by name or IMO
        const vessel = vessels.find(
          v => 
            v.name.toLowerCase() === name.toLowerCase() ||
            v.imo_number === name
        );
        if (vessel) {
          mapping.set(name.toLowerCase(), vessel.id);
        }
      }
      setVesselMapping(mapping);

      // Update validation results with additional checks
      result.results.forEach(r => {
        // Check for duplicate emails
        if (existingEmails.includes(r.data.email)) {
          r.warnings.push('Email already exists in system');
        }

        // Check vessel mapping
        const vesselId = mapping.get(r.data.vessel_assignment.toLowerCase());
        if (!vesselId) {
          r.errors.push(`Vessel not found: ${r.data.vessel_assignment}`);
          r.valid = false;
        }
      });

      // Recalculate counts
      result.validRows = result.results.filter(r => r.valid).length;
      result.errorRows = result.results.filter(r => !r.valid).length;
      result.warningRows = result.results.filter(r => r.warnings.length > 0).length;

      setParseResult({ ...result });
      setStep('validate');
    } catch (error: any) {
      toast({
        title: 'Error parsing CSV',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  const handleImport = async () => {
    if (!parseResult || !profile?.company_id) return;

    const validRows = parseResult.results.filter(r => r.valid);
    if (validRows.length === 0) {
      toast({
        title: 'No valid rows',
        description: 'Please fix the errors and try again.',
        variant: 'destructive',
      });
      return;
    }

    setStep('importing');
    setIsImporting(true);
    setImportProgress(0);

    const results: ImportResults = {
      created: 0,
      skipped: 0,
      errors: [],
    };

    const rowsToImport = validRows.filter(r => {
      // Skip duplicates if action is 'skip'
      if (duplicateAction === 'skip' && existingEmails.includes(r.data.email)) {
        results.skipped++;
        return false;
      }
      return true;
    });

    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      const progress = Math.round(((i + 1) / rowsToImport.length) * 100);
      setImportProgress(progress);

      try {
        const vesselId = vesselMapping.get(row.data.vessel_assignment.toLowerCase());
        if (!vesselId) {
          results.errors.push(`Row ${row.rowNumber}: Vessel not found`);
          continue;
        }

        // Generate password
        const password = generatePassword();

        // Call edge function to create crew member
        const { data, error } = await supabase.functions.invoke('create-crew-member', {
          body: {
            email: row.data.email,
            password,
            firstName: row.data.first_name,
            lastName: row.data.last_name,
            phone: row.data.phone_number,
            nationality: row.data.nationality,
            rank: row.data.rank,
            role: 'crew',
            companyId: profile.company_id,
            vesselId,
            position: row.data.position,
            joinDate: row.data.join_date,
          },
        });

        if (error) {
          results.errors.push(`Row ${row.rowNumber}: ${error.message}`);
        } else if (data?.error) {
          results.errors.push(`Row ${row.rowNumber}: ${data.error}`);
        } else {
          results.created++;
        }
      } catch (error: any) {
        results.errors.push(`Row ${row.rowNumber}: ${error.message}`);
      }
    }

    setImportResults(results);
    setIsImporting(false);
    setStep('complete');

    if (results.created > 0) {
      onSuccess();
    }
  };

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const renderUploadStep = () => (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={downloadCSVTemplate}
          className="gap-2"
        >
          <Download className="w-4 h-4" />
          Download Template
        </Button>
      </div>

      <div
        {...getRootProps()}
        className={cn(
          'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
          isDragActive
            ? 'border-primary bg-primary/5'
            : 'border-muted-foreground/25 hover:border-primary/50'
        )}
      >
        <input {...getInputProps()} />
        <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        {isDragActive ? (
          <p className="text-primary font-medium">Drop the CSV file here...</p>
        ) : (
          <>
            <p className="font-medium mb-1">Drag & drop a CSV file here</p>
            <p className="text-sm text-muted-foreground">or click to browse files</p>
          </>
        )}
        <p className="text-xs text-muted-foreground mt-2">Maximum file size: 5MB</p>
      </div>

      {file && (
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            <div>
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setFile(null)}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={handleClose}>
          Cancel
        </Button>
        <Button
          onClick={handleValidate}
          disabled={!file || isValidating}
        >
          {isValidating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Validating...
            </>
          ) : (
            <>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </>
          )}
        </Button>
      </div>
    </div>
  );

  const renderValidateStep = () => {
    if (!parseResult) return null;

    return (
      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-muted rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{parseResult.totalRows}</p>
            <p className="text-sm text-muted-foreground">Total Rows</p>
          </div>
          <div className="bg-primary/10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-primary">{parseResult.validRows}</p>
            <p className="text-sm text-primary">Valid</p>
          </div>
          <div className="bg-destructive/10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-destructive">{parseResult.errorRows}</p>
            <p className="text-sm text-destructive">Errors</p>
          </div>
          <div className="bg-warning/10 rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-warning">{parseResult.warningRows}</p>
            <p className="text-sm text-warning">Warnings</p>
          </div>
        </div>

        {/* Duplicate Handling */}
        {existingEmails.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Duplicate Emails Detected</AlertTitle>
            <AlertDescription>
              <p className="mb-3">
                {existingEmails.length} email(s) already exist in the system.
              </p>
              <RadioGroup
                value={duplicateAction}
                onValueChange={(v) => setDuplicateAction(v as DuplicateAction)}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="skip" id="skip" />
                  <Label htmlFor="skip">Skip duplicate rows</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update" id="update" disabled />
                  <Label htmlFor="update" className="text-muted-foreground">
                    Update existing records (coming soon)
                  </Label>
                </div>
              </RadioGroup>
            </AlertDescription>
          </Alert>
        )}

        {/* Preview Table */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium">Preview</h4>
            {parseResult.errorRows > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportErrorRowsCSV(parseResult.results)}
              >
                <FileDown className="w-4 h-4 mr-2" />
                Download Error Rows
              </Button>
            )}
          </div>
          <ScrollArea className="h-[300px] border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Rank/Position</TableHead>
                  <TableHead>Issues</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parseResult.results.map((result, index) => (
                  <TableRow
                    key={index}
                    className={cn(
                      !result.valid && 'bg-destructive/5',
                      result.valid && result.warnings.length > 0 && 'bg-warning/5'
                    )}
                  >
                    <TableCell>
                      {result.valid ? (
                        result.warnings.length > 0 ? (
                          <AlertTriangle className="w-4 h-4 text-warning" />
                        ) : (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )
                      ) : (
                        <XCircle className="w-4 h-4 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {result.data.first_name} {result.data.last_name}
                    </TableCell>
                    <TableCell>{result.data.email}</TableCell>
                    <TableCell>{result.data.vessel_assignment}</TableCell>
                    <TableCell>{result.data.rank || result.data.position}</TableCell>
                    <TableCell className="max-w-[200px]">
                      {result.errors.length > 0 && (
                        <span className="text-destructive text-xs">
                          {result.errors.join(', ')}
                        </span>
                      )}
                      {result.warnings.length > 0 && (
                        <span className="text-warning text-xs">
                          {result.warnings.join(', ')}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => {
              setStep('upload');
              setFile(null);
              setParseResult(null);
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex gap-3">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={parseResult.validRows === 0}
            >
              Import {parseResult.validRows} Crew Members
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderImportingStep = () => (
    <div className="space-y-6 py-8">
      <div className="text-center">
        <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-primary" />
        <h3 className="text-lg font-medium mb-2">Importing Crew Members...</h3>
        <p className="text-muted-foreground">Please don't close this window.</p>
      </div>
      <Progress value={importProgress} className="h-2" />
      <p className="text-center text-sm text-muted-foreground">
        {importProgress}% complete
      </p>
    </div>
  );

  const renderCompleteStep = () => {
    if (!importResults) return null;

    return (
      <div className="space-y-6 py-4">
      <div className="text-center">
        <CheckCircle2 className="w-16 h-16 mx-auto mb-4 text-primary" />
        <h3 className="text-xl font-medium mb-2">Import Complete!</h3>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-primary/10 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-primary">{importResults.created}</p>
          <p className="text-sm text-primary">Created</p>
        </div>
        <div className="bg-muted rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{importResults.skipped}</p>
          <p className="text-sm text-muted-foreground">Skipped</p>
        </div>
        <div className="bg-destructive/10 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-destructive">{importResults.errors.length}</p>
          <p className="text-sm text-destructive">Errors</p>
        </div>
      </div>

        {importResults.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Some rows failed to import</AlertTitle>
            <AlertDescription>
              <ScrollArea className="h-[100px] mt-2">
                <ul className="text-sm space-y-1">
                  {importResults.errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </ScrollArea>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button onClick={handleClose}>
            Close
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Import Crew Members
          </DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV file to bulk import crew members.'}
            {step === 'validate' && 'Review and validate the imported data.'}
            {step === 'importing' && 'Importing crew members...'}
            {step === 'complete' && 'Import completed successfully.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && renderUploadStep()}
        {step === 'validate' && renderValidateStep()}
        {step === 'importing' && renderImportingStep()}
        {step === 'complete' && renderCompleteStep()}
      </DialogContent>
    </Dialog>
  );
};

export default ImportCrewCSVModal;
