import React, { useState } from 'react';
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/shared/hooks/use-toast';
import { downloadCrewDocument, getCrewDocumentSignedUrl } from '@/lib/storage/crewDocuments';
import { payslipFileName } from '@/modules/hris/lib/payroll/payslip';

interface PayslipButtonProps {
  payslipPath: string | null;
  runNumber: string;
  crewName: string;
  /** Show "Generate" when there is no payslip yet. */
  canGenerate?: boolean;
  onGenerate?: () => void;
  busy?: boolean;
  /** "download" triggers a file download instead of opening a tab. */
  mode?: 'view' | 'download';
  size?: 'sm' | 'default';
}

/** Opens the stored payslip via a signed URL, or offers to generate one. */
export const PayslipButton: React.FC<PayslipButtonProps> = ({
  payslipPath,
  runNumber,
  crewName,
  canGenerate,
  onGenerate,
  busy,
  mode = 'view',
  size = 'sm',
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const open = async () => {
    setLoading(true);
    try {
      const name = payslipFileName(runNumber, crewName);
      if (mode === 'download') {
        await downloadCrewDocument(payslipPath, name);
      } else {
        const url = await getCrewDocumentSignedUrl(payslipPath);
        if (!url) throw new Error('Payslip has no storage path');
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      toast({ title: 'Could not open payslip', description: err instanceof Error ? err.message : 'Unexpected error', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  if (payslipPath) {
    return (
      <Button variant="outline" size={size} onClick={open} disabled={loading || busy}>
        {loading ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : mode === 'download' ? <Download className="mr-2 h-3.5 w-3.5" /> : <ExternalLink className="mr-2 h-3.5 w-3.5" />}
        Payslip
      </Button>
    );
  }
  if (canGenerate && onGenerate) {
    return (
      <Button variant="ghost" size={size} onClick={onGenerate} disabled={busy}>
        {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-2 h-3.5 w-3.5" />}
        Generate
      </Button>
    );
  }
  return <span className="text-xs text-muted-foreground">No payslip</span>;
};

export default PayslipButton;
