import React from 'react';
import { FileText, Info } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import FamiliarizationTab from '@/modules/training/components/FamiliarizationTab';
import FamiliarizationTemplatesModal from '@/modules/training/components/FamiliarizationTemplatesModal';

/**
 * The D-01 fallback of the familiarisation page (X1-10): while
 * 20261124061000 is not applied, the legacy list (filtered to the route
 * vessel, the C63 template fix applied client-side) and its templates
 * dialog, under a strip that says the per-vessel, per-position version
 * comes with the crew update.
 */
const LegacyFamiliarisation: React.FC<{ vesselId: string; notice: string }> = ({ vesselId, notice }) => {
  const [templatesOpen, setTemplatesOpen] = React.useState(false);
  return (
    <div className="min-w-0 space-y-4">
      <Alert variant="info" data-familiarisation-notice="">
        <Info aria-hidden="true" className="size-4" />
        <AlertDescription className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="min-w-0">{notice}</span>
          <Button variant="outline" size="sm" className="[@media(pointer:coarse)]:h-11" onClick={() => setTemplatesOpen(true)}>
            <FileText aria-hidden="true" className="mr-2 h-4 w-4" />
            Templates
          </Button>
        </AlertDescription>
      </Alert>
      <FamiliarizationTab vesselId={vesselId} />
      <FamiliarizationTemplatesModal open={templatesOpen} onOpenChange={setTemplatesOpen} />
    </div>
  );
};

export default LegacyFamiliarisation;
