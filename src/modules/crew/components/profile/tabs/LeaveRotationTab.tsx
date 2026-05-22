import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import type { CrewMember } from '@/modules/crew/hooks/useCrew';

export const LeaveRotationTab: React.FC<{ member: CrewMember }> = ({ member }) => (
  <div className="space-y-4">
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Rotation</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm space-y-1">
        <div>
          <span className="text-muted-foreground">Pattern:</span> {member.rotation ?? '—'}
        </div>
      </CardContent>
    </Card>
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">Leave</CardTitle></CardHeader>
      <CardContent className="pt-0 text-sm space-y-2 text-muted-foreground">
        Leave entries, requests and carryover balances are managed in the Leave & Rotations workspace.
        <div>
          <Button asChild variant="outline" size="sm" className="mt-1">
            <Link to="/crew/leave" className="gap-1.5 inline-flex items-center">
              Open Leave workspace <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
);
