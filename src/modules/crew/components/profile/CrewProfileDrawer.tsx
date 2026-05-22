import React, { useState } from 'react';
import { Lock } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePermissionsStore } from '@/modules/auth/store/permissionsStore';
import { CrewProfileHeader } from '@/modules/crew/components/profile/CrewProfileHeader';
import { OverviewTab } from '@/modules/crew/components/profile/tabs/OverviewTab';
import { CertificatesTab } from '@/modules/crew/components/profile/tabs/CertificatesTab';
import { MedicalTab } from '@/modules/crew/components/profile/tabs/MedicalTab';
import { TravelTab } from '@/modules/crew/components/profile/tabs/TravelTab';
import { EmploymentTab } from '@/modules/crew/components/profile/tabs/EmploymentTab';
import { LeaveRotationTab } from '@/modules/crew/components/profile/tabs/LeaveRotationTab';
import { DocumentsTab } from '@/modules/crew/components/profile/tabs/DocumentsTab';
import { NotesLogsTab } from '@/modules/crew/components/profile/tabs/NotesLogsTab';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

const MEDICAL_ROLES = ['superadmin', 'dpa', 'captain', 'medical_officer'];
const EDIT_ROLES = ['superadmin', 'dpa', 'shore_management', 'captain', 'master', 'hod', 'purser'];

interface CrewProfileDrawerProps {
  member: CrewMemberWithStatus | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabValue = 'overview' | 'certificates' | 'medical' | 'travel' | 'employment' | 'leave' | 'documents' | 'notes';

export const CrewProfileDrawer: React.FC<CrewProfileDrawerProps> = ({ member, open, onOpenChange }) => {
  const hasRole = usePermissionsStore((s) => s.hasRole);
  const canViewMedical = MEDICAL_ROLES.some((r) => hasRole(r));
  const canEdit = EDIT_ROLES.some((r) => hasRole(r));
  const [active, setActive] = useState<TabValue>('overview');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-screen sm:max-w-[720px] sm:w-[720px] p-0 flex flex-col gap-0"
      >
        {member && (
          <>
            <div className="p-4 sm:p-5">
              <CrewProfileHeader member={member} onClose={() => onOpenChange(false)} />
            </div>
            <Tabs
              value={active}
              onValueChange={(v) => setActive(v as TabValue)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="border-b overflow-x-auto">
                <TabsList className="w-full justify-start rounded-none bg-transparent h-auto px-4 sm:px-5">
                  <TabsTrigger value="overview" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Overview</TabsTrigger>
                  <TabsTrigger value="certificates" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Certificates</TabsTrigger>
                  <TabsTrigger value="medical" disabled={!canViewMedical} className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary gap-1.5">
                    {!canViewMedical && <Lock className="h-3 w-3" />} Medical
                  </TabsTrigger>
                  <TabsTrigger value="travel" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Travel</TabsTrigger>
                  <TabsTrigger value="employment" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Employment</TabsTrigger>
                  <TabsTrigger value="leave" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Leave</TabsTrigger>
                  <TabsTrigger value="documents" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Documents</TabsTrigger>
                  <TabsTrigger value="notes" className="rounded-none data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary">Notes</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-5">
                {active === 'overview' && <OverviewTab member={member} canEdit={canEdit} />}
                {active === 'certificates' && <CertificatesTab member={member} />}
                {active === 'medical' && canViewMedical && <MedicalTab member={member} />}
                {active === 'travel' && <TravelTab member={member} />}
                {active === 'employment' && <EmploymentTab member={member} canEdit={canEdit} />}
                {active === 'leave' && <LeaveRotationTab member={member} />}
                {active === 'documents' && <DocumentsTab member={member} />}
                {active === 'notes' && <NotesLogsTab member={member} canEdit={canEdit} />}
              </div>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
};
