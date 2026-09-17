import React from 'react';
import { UserRoundX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface NoAccountNoticeProps {
  crewName?: string;
  /** What is unavailable, e.g. "Certificates and attachments". */
  subject?: string;
}

/**
 * Shown when a profile has no auth user (imported crew not yet invited).
 * The certificate / attachment / travel-document tables are keyed on
 * `profiles.user_id`, so nothing can be attached until the account exists.
 */
export const NoAccountNotice: React.FC<NoAccountNoticeProps> = ({ crewName, subject = 'Documents' }) => (
  <Alert className="border-dashed">
    <UserRoundX className="h-4 w-4" />
    <AlertTitle>{crewName ? `${crewName} has not been invited yet` : 'This crew member has not been invited yet'}</AlertTitle>
    <AlertDescription>
      {subject} can be attached once their account exists. Invite them from the crew directory to create a login, then return
      here to upload certificates, attachments and travel documents.
    </AlertDescription>
  </Alert>
);

export default NoAccountNotice;
