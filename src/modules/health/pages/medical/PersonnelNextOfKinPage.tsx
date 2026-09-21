import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Mail, Phone, Siren, UserRound, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { HealthPageHeader } from '@/modules/health/components/HealthPageHeader';
import {
  HealthEmpty,
  HealthError,
  HealthLoading,
  NoSubjectRecord,
  PickPersonPrompt,
} from '@/modules/health/components/HealthStates';
import { PersonPicker } from '@/modules/health/components/PersonPicker';
import { PersonClinicalBanner } from '@/modules/health/components/medical/PersonClinicalBanner';
import { useSelectedPerson } from '@/modules/health/hooks/useSelectedPerson';
import { HRIS_PATHS } from '@/modules/hris/paths';

type NextOfKin = Tables<'crew_next_of_kin'>;

const NOK_KEY = ['health', 'next-of-kin'] as const;

/**
 * Next of kin, read from the HRIS record rather than a second copy. A medic
 * needs the number in an emergency; HR owns keeping it current, so this page
 * is deliberately read-only and links back to HRIS to change anything.
 */
function useNextOfKin(profileId: string | null | undefined) {
  return useQuery({
    queryKey: [...NOK_KEY, profileId ?? null],
    enabled: Boolean(profileId),
    staleTime: 60_000,
    queryFn: async (): Promise<NextOfKin[]> => {
      const { data, error } = await supabase
        .from('crew_next_of_kin')
        .select('*')
        .eq('profile_id', profileId as string)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const PersonnelNextOfKinPage: React.FC = () => {
  const { personId, person, setPersonId, selfOnly, myPerson, access, directoryLoading } =
    useSelectedPerson('medical');
  const contacts = useNextOfKin(person?.profile_id);

  const primary = contacts.data?.find((c) => c.is_primary) ?? null;
  const others = contacts.data?.filter((c) => !c.is_primary) ?? [];

  let body: React.ReactNode;
  if (access.loading || (personId && directoryLoading && !person)) {
    body = <HealthLoading rows={2} />;
  } else if (selfOnly && !myPerson) {
    body = <NoSubjectRecord />;
  } else if (!personId) {
    body = <PickPersonPrompt what="emergency contacts" icon={Users} />;
  } else if (person && !person.profile_id) {
    body = (
      <div className="space-y-4">
        <PersonClinicalBanner person={person} compact />
        {person.emergency_contact_name || person.emergency_contact_phone ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Emergency contact</CardTitle>
              <CardDescription>Recorded against this guest, not a crew profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="font-medium text-foreground">
                {person.emergency_contact_name ?? 'Name not recorded'}
              </p>
              {person.emergency_contact_phone && (
                <Button asChild variant="outline" size="sm" className="gap-1">
                  <a href={`tel:${person.emergency_contact_phone}`}>
                    <Phone className="h-4 w-4" /> {person.emergency_contact_phone}
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <HealthEmpty
            icon={Siren}
            title="No emergency contact recorded"
            description="Add one on the patients page so the vessel can reach someone if this person is hurt."
          />
        )}
      </div>
    );
  } else if (contacts.isError) {
    body = <HealthError error={contacts.error} title="Could not load emergency contacts" />;
  } else if (contacts.isLoading) {
    body = <HealthLoading rows={2} />;
  } else if ((contacts.data ?? []).length === 0) {
    body = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}
        <Alert>
          <Siren className="h-4 w-4" />
          <AlertTitle>Nobody recorded</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              {person?.displayName} has no next of kin on file. HR owns this record, so it is added
              there.
            </span>
            <Button asChild variant="outline" size="sm" className="sm:shrink-0">
              <Link to={`${HRIS_PATHS.nextOfKin}?crew=${person?.profile_id ?? ''}`}>
                Open in HRIS
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {person && <PersonClinicalBanner person={person} compact />}

        <section aria-labelledby="ice-primary" className="space-y-3">
          <div className="flex items-center gap-2">
            <Siren className="h-4 w-4 text-destructive" />
            <h2
              id="ice-primary"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              In an emergency, call
            </h2>
          </div>
          {primary ? (
            <ContactCard contact={primary} emphasis />
          ) : (
            <Alert>
              <AlertTitle>No primary contact set</AlertTitle>
              <AlertDescription>
                Contacts are listed below, but nobody is marked as the first to call.
              </AlertDescription>
            </Alert>
          )}
        </section>

        {others.length > 0 && (
          <section aria-labelledby="ice-others" className="space-y-3">
            <h2
              id="ice-others"
              className="text-sm font-semibold uppercase tracking-wide text-muted-foreground"
            >
              Other contacts
            </h2>
            <div className="grid gap-3 lg:grid-cols-2">
              {others.map((c) => (
                <ContactCard key={c.id} contact={c} />
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          HR owns these contacts.{' '}
          <Link
            to={`${HRIS_PATHS.nextOfKin}?crew=${person?.profile_id ?? ''}`}
            className="underline"
          >
            Change them in HRIS
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <HealthPageHeader
        icon={Siren}
        scope="medical"
        title="Next of kin and emergency contacts"
        description="Who to call, read from the HR record so there is only one version."
        toolbar={
          !selfOnly ? (
            <PersonPicker
              value={personId}
              onChange={(id) => setPersonId(id)}
              includeInactive
              placeholder="Choose whose contacts to see"
              className="md:w-[420px]"
            />
          ) : undefined
        }
      />
      {body}
    </div>
  );
};

const ContactCard: React.FC<{ contact: NextOfKin; emphasis?: boolean }> = ({
  contact,
  emphasis,
}) => (
  <Card className={emphasis ? 'border-destructive/40' : undefined}>
    <CardContent className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <UserRound className="h-4 w-4 text-muted-foreground" />
            <span className="truncate font-medium text-foreground">{contact.full_name}</span>
            {contact.is_primary && (
              <Badge variant="outline" className="text-[10px]">
                Primary
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[contact.relationship, contact.language, contact.country].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {contact.phone_primary && (
          <Button asChild variant={emphasis ? 'default' : 'outline'} size="sm" className="gap-1">
            <a href={`tel:${contact.phone_primary}`}>
              <Phone className="h-4 w-4" /> {contact.phone_primary}
            </a>
          </Button>
        )}
        {contact.phone_secondary && (
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href={`tel:${contact.phone_secondary}`}>
              <Phone className="h-4 w-4" /> {contact.phone_secondary}
            </a>
          </Button>
        )}
        {contact.email && (
          <Button asChild variant="outline" size="sm" className="gap-1">
            <a href={`mailto:${contact.email}`}>
              <Mail className="h-4 w-4" /> {contact.email}
            </a>
          </Button>
        )}
      </div>

      {(contact.address_line1 || contact.city) && (
        <p className="text-xs text-muted-foreground">
          {[contact.address_line1, contact.address_line2, contact.city, contact.postal_code, contact.country]
            .filter(Boolean)
            .join(', ')}
        </p>
      )}

      {contact.notes && <p className="text-xs text-muted-foreground">{contact.notes}</p>}
    </CardContent>
  </Card>
);

export default PersonnelNextOfKinPage;
