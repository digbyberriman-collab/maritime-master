import React from 'react';
import { Award, FileText, Loader2, Paperclip, Plane } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { HrisPageHeader } from '@/modules/hris/components/HrisPageHeader';
import { CrewPicker } from '@/modules/hris/components/CrewPicker';
import { useSelectedCrew } from '@/modules/hris/hooks/useSelectedCrew';
import { DocumentsOverview } from '@/modules/hris/components/documents/DocumentsOverview';
import { ComplianceStrip } from '@/modules/hris/components/documents/ComplianceStrip';
import { TravelDocumentsList } from '@/modules/hris/components/documents/TravelDocumentsList';
import { NoAccountNotice } from '@/modules/hris/components/documents/NoAccountNotice';
import CrewCertificates from '@/modules/crew/components/CrewCertificates';
import { CrewAttachments } from '@/modules/crew/components/CrewAttachments';

/**
 * Documents & Certificates. With no crew selected HR sees the company
 * expiry overview; with a crew member selected they see that person's
 * compliance strip and the certificate / attachment / travel-document tabs.
 * The certificate and attachment tables are keyed on the auth user id, so
 * imported crew without an account get a notice instead.
 */
const DocumentsPage: React.FC = () => {
  const { profileId, entry, setProfileId, selfOnly, access, directoryLoading } = useSelectedCrew();

  const toolbar = !selfOnly ? (
    <CrewPicker
      value={profileId}
      onChange={(id) => setProfileId(id)}
      includeInactive
      placeholder="All crew — pick someone to see their documents"
      className="md:w-[420px]"
    />
  ) : undefined;

  let body: React.ReactNode;
  if (access.loading || (profileId && !entry && directoryLoading)) {
    body = (
      <div className="flex min-h-[30vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  } else if (!profileId) {
    body = access.canView ? (
      <DocumentsOverview onSelectCrew={setProfileId} />
    ) : (
      <Skeleton className="h-32 w-full" />
    );
  } else if (!entry) {
    body = <p className="text-sm text-muted-foreground">That crew member could not be found in your company directory.</p>;
  } else {
    const userId = entry.user_id;
    body = (
      <div className="space-y-6">
        <ComplianceStrip profileId={entry.id} userId={userId} />
        {userId ? (
          <Tabs defaultValue="certificates" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 sm:inline-flex sm:w-auto">
              <TabsTrigger value="certificates" className="gap-1.5"><Award className="h-4 w-4" /> Certificates</TabsTrigger>
              <TabsTrigger value="attachments" className="gap-1.5"><Paperclip className="h-4 w-4" /> Attachments</TabsTrigger>
              <TabsTrigger value="travel" className="gap-1.5"><Plane className="h-4 w-4" /> Travel documents</TabsTrigger>
            </TabsList>
            <TabsContent value="certificates">
              <CrewCertificates crewId={userId} crewVesselId={entry.vessel_id ?? undefined} />
            </TabsContent>
            <TabsContent value="attachments">
              <CrewAttachments crewId={userId} crewVesselId={entry.vessel_id ?? undefined} />
            </TabsContent>
            <TabsContent value="travel">
              <TravelDocumentsList userId={userId} />
            </TabsContent>
          </Tabs>
        ) : (
          <NoAccountNotice crewName={entry.displayName} subject="Certificates, attachments and travel documents" />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HrisPageHeader
        icon={FileText}
        title="Documents & Certificates"
        description={entry ? `${entry.displayName}${entry.rank ? ` · ${entry.rank}` : ''}${entry.vessel_name ? ` · ${entry.vessel_name}` : ''}` : 'Certificates, attachments and travel documents with expiry tracking.'}
        toolbar={toolbar}
      />
      {body}
    </div>
  );
};

export default DocumentsPage;
