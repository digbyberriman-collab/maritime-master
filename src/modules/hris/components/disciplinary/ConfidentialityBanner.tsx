import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/** Always-visible reminder that disciplinary files are restricted and every view is audited. */
export const ConfidentialityBanner: React.FC = () => (
  <Alert className="border-destructive/40 bg-destructive/5 text-foreground">
    <ShieldAlert className="h-4 w-4 text-destructive" />
    <AlertTitle className="text-destructive">Restricted: HR editors only. Every view is audited.</AlertTitle>
    <AlertDescription className="text-muted-foreground">
      Disciplinary files contain sensitive personal data. Opening a case writes an entry to the audit log with your name. Do not share screenshots or
      export contents outside HR. Crew members see only the outcome of their own closed matters, never the investigation file.
    </AlertDescription>
  </Alert>
);

export default ConfidentialityBanner;
