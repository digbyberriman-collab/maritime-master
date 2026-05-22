import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck } from 'lucide-react';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

export const MedicalTab: React.FC<{ member: CrewMember }> = ({ member }) => (
  <div className="space-y-4">
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-success" />
        <CardTitle className="text-sm">Medical Certificate</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Expires:</span>{' '}
          {member.medical_expiry ? <Badge variant="outline">{member.medical_expiry}</Badge> : '—'}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Medical reports</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        Incident-linked medical reports for this crew member appear in the Compliance → Incidents workspace.
        Detailed medical history fields (blood group, allergies, dietary, injury history) are not tracked in this release.
      </CardContent>
    </Card>
  </div>
);
