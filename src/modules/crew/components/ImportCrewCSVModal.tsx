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
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { toast } from '@/shared/hooks/use-toast';
import { normaliseError } from '@/shared/lib/notify';
import { Checkbox } from '@/components/ui/checkbox';
import { KpiTile } from '@/shared/components/data';
import {
  createCrewMember,
  crewImportRowResult,
  crewImportSummary,
  type CrewImportRowResult,
  type CrewImportRowStatus,
} from '@/modules/auth/services/adminActions';

interface ImportCrewCSVModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type ImportStep = 'upload' | 'validate' | 'importing' | 'complete';
type DuplicateAction = 'skip' | 'update';

interface ImportedRow {
  rowNumber: number;
  name: string;
  email: string;
  result: CrewImportRowResult;
}

interface ImportResults {
  rows: ImportedRow[];
  skipped: number;
  /** Invitations were asked for. */
  invited: boolean;
}

/** How each row's result reads (Badge tone variants). */
const ROW_STATUS: Readonly<Record<CrewImportRowStatus, { label: string; variant: 'ok' | 'warn' | 'danger' }>> = {
  invited: { label: 'Added and invited', variant: 'ok' },
  added: { label: 'Added', variant: 'ok' },
  invite_failed: { label: 'Added, not invited', variant: 'warn' },
  assignment_failed: { label: 'Added, vessel not assigned', variant: 'warn' },
  unconfirmed: { label: 'Not confirmed', variant: 'warn' },
  failed: { label: 'Not added', variant: 'danger' },
};

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
  const [sendInvites, setSendInvites] = useState(true);

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
    setSendInvites(true);
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

      // Emails this company already uses (a hint: the function checks every company when importing).
      let existing: string[] = [];
      if (emails.length > 0) {
        const { data: existingProfiles, error: existingError } = await supabase
          .from('profiles')
          .select('email')
          .in('email', emails);
        if (existingError) throw existingError;
        existing = (existingProfiles ?? []).map(p => p.email);
      }
      setExistingEmails(existing);

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
        if (existing.includes(r.data.email)) {
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
    } catch (error) {
      toast({
        title: 'Could not check the CSV',
        description: normaliseError(error).message,
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

    const results: ImportResults = { rows: [], skipped: 0, invited: sendInvites };

    const rowsToImport = validRows.filter(r => {
      // Skip duplicates if action is 'skip'
      if (duplicateAction === 'skip' && existingEmails.includes(r.data.email)) {
        results.skipped++;
        return false;
      }
      return true;
    });

    // One call per row, one after another; each row keeps the outcome the function gave (D-143).
    for (let i = 0; i < rowsToImport.length; i++) {
      const row = rowsToImport[i];
      setImportProgress(Math.round(((i + 1) / rowsToImport.length) * 100));
      const base = { rowNumber: row.rowNumber, name: `${row.data.first_name} ${row.data.last_name}`.trim(), email: row.data.email };

      const vesselId = vesselMapping.get(row.data.vessel_assignment.toLowerCase());
      if (!vesselId) {
        results.rows.push({ ...base, result: { status: 'failed', created: false, message: `Vessel not found: ${row.data.vessel_assignment}` } });
        continue;
      }
      // No password (the person sets one from the invitation) and no company (the function uses yours).
      const outcome = await createCrewMember({
        email: row.data.email,
        firstName: row.data.first_name,
        lastName: row.data.last_name,
        phone: row.data.phone_number,
        nationality: row.data.nationality,
        rank: row.data.rank,
        role: 'crew',
        vesselId,
        position: row.data.position,
        joinDate: row.data.join_date,
        sendInvite: sendInvites,
      });
      results.rows.push({ ...base, result: crewImportRowResult(outcome) });
    }

    setImportResults(results);
    setIsImporting(false);
    setStep('complete');

    if (crewImportSummary(results.rows.map((r) => r.result)).created > 0) {
      onSuccess();
    }
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

        {/* Invitations */}
        <div className="flex items-start gap-3 rounded-lg border p-3">
          <Checkbox
            id="import-send-invites"
            checked={sendInvites}
            onCheckedChange={(v) => setSendInvites(v === true)}
            className="mt-0.5"
          />
          <div className="space-y-1">
            <Label htmlFor="import-send-invites">Email each new crew member an invitation</Label>
            <p className="text-sm text-muted-foreground">
              STORM emails a link to set a password and join. Without it, send the invitations later from Users &amp; Access.
            </p>
          </div>
        </div>

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
    const summary = crewImportSummary(importResults.rows.map((r) => r.result));
    const problems = importResults.rows.filter((r) => r.result.status !== 'invited' && r.result.status !== 'added');
    const clean = problems.length === 0;

    return (
      <div className="space-y-6 py-4" data-import-summary="">
        <div className="text-center">
          {clean ? (
            <CheckCircle2 aria-hidden="true" className="w-12 h-12 mx-auto mb-3 text-success" />
          ) : (
            <AlertTriangle aria-hidden="true" className="w-12 h-12 mx-auto mb-3 text-warning" />
          )}
          <h3 className="text-xl font-medium mb-1">{clean ? 'Import complete' : 'Import finished with problems'}</h3>
          <p className="text-sm text-muted-foreground">
            {summary.created} of {importResults.rows.length} {importResults.rows.length === 1 ? 'row was' : 'rows were'} added
            {importResults.invited ? ` · ${summary.invited} invited` : ''}.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile label="Added" value={summary.created} state="ready" tone={summary.created > 0 ? 'ok' : undefined} />
          {importResults.invited ? (
            <KpiTile label="Not invited" value={summary.inviteFailed} state="ready" tone={summary.inviteFailed > 0 ? 'warn' : undefined} sub="Send from Users & Access" />
          ) : (
            <KpiTile label="Invitations" value="Not sent" textValue state="ready" sub="Send from Users & Access" />
          )}
          <KpiTile label="Not added" value={summary.failed} state="ready" tone={summary.failed > 0 ? 'danger' : undefined} />
          <KpiTile label="Skipped" value={importResults.skipped} state="ready" sub="Already in STORM" />
        </div>

        {problems.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Rows that need attention</h4>
            <div className="max-h-60 overflow-y-auto rounded-lg border">
              <ul className="divide-y" aria-label="Rows that need attention">
                {problems.map((row) => {
                  const meta = ROW_STATUS[row.result.status];
                  return (
                    <li key={row.rowNumber} className="flex flex-col gap-1 p-3 sm:flex-row sm:items-start sm:gap-3" data-import-row={row.result.status}>
                      <Badge variant={meta.variant} className="w-fit shrink-0">{meta.label}</Badge>
                      <div className="min-w-0 text-sm">
                        <p className="font-medium">
                          Row {row.rowNumber} · {row.name || row.email}
                        </p>
                        <p className="text-muted-foreground">{row.result.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleClose}>Close</Button>
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
            {step === 'complete' && 'The import has finished. Each row says what happened.'}
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
