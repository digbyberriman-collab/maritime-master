import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

export const TravelTab: React.FC<{ member: CrewMember }> = ({ member }) => (
  <div className="space-y-4">
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Passport</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Number:</span>{' '}
          <span className="font-mono">{member.passport_number ?? '—'}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Expires:</span> {member.passport_expiry ?? '—'}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Visa</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Status:</span>{' '}
          {member.visa_status ? <Badge variant="outline">{member.visa_status}</Badge> : '—'}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Flights & travel records</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground">
        Linked travel records appear in the Crew → Travel & Visa workspace.
      </CardContent>
    </Card>
  </div>
);
