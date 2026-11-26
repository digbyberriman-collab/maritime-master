import React from 'react';
import { Link } from 'react-router-dom';
import { PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageError } from '@/shared/components/states';
import { formatDay, useProfileSignature } from '@/modules/crew/hooks/useCrewProfile';

/** Where a person keeps their stored signature (gap/08 SIG1, personal area). */
export const MY_SIGNATURE_PATH = '/me/signature';

interface SignatureCardProps {
  companyId: string;
  profileId: string;
}

/**
 * The person's stored signature (gap/04 C19; gap/08 SIG1): whether one is
 * on file, with a link to /me/signature to draw or replace it. Shown on the
 * person's own profile. The store is the platform signature engine
 * (PR-X1-I): while user_signature_images does not exist the card is not
 * shown at all (D-01), rather than promising something that cannot work.
 */
export const SignatureCard: React.FC<SignatureCardProps> = ({ companyId, profileId }) => {
  const state = useProfileSignature(companyId, profileId);
  if (state.status === 'missing' || state.status === 'idle') return null;
  return (
    <Card data-profile-card="signature">
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <PenLine aria-hidden="true" className="size-4 text-muted-foreground" />
        <CardTitle className="type-subtitle">Signature</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.status === 'loading' ? (
          <Skeleton className="h-4 w-48" aria-label="Loading signature" />
        ) : state.status === 'error' ? (
          <PageError variant="inline" error={state.error} onRetry={state.retry} title="Your signature could not load" treatMissingAsOff={false} />
        ) : state.signature ? (
          <>
            <p className="type-body text-foreground">Your signature is on file since {formatDay(state.signature.created_at) ?? 'earlier'}. STORM uses it when you sign records.</p>
            <Button asChild variant="outline" size="sm">
              <Link to={MY_SIGNATURE_PATH}>Replace signature</Link>
            </Button>
          </>
        ) : (
          <>
            <p className="type-body text-muted-foreground">No signature set up yet. STORM asks for it the first time you sign a record.</p>
            <Button asChild variant="outline" size="sm">
              <Link to={MY_SIGNATURE_PATH}>Set up signature</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SignatureCard;
