import React from 'react';
import { Languages, Mail, MapPin, MoreHorizontal, Pencil, Phone, ShieldCheck, ShieldOff, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDate } from '@/modules/hris/lib/format';
import type { NextOfKin } from '@/modules/hris/hooks/useCrewNextOfKin';

interface NextOfKinCardProps {
  contact: NextOfKin;
  /** Primary contacts render larger with call/email as the main actions. */
  emphasis?: 'primary' | 'secondary';
  canEdit: boolean;
  busy?: boolean;
  onEdit: (contact: NextOfKin) => void;
  onDelete: (contact: NextOfKin) => void;
  onSetPrimary: (contact: NextOfKin) => void;
}

const telHref = (phone: string) => `tel:${phone.replace(/[^+\d]/g, '')}`;

const addressLines = (c: NextOfKin): string[] =>
  [c.address_line1, c.address_line2, [c.postal_code, c.city].filter(Boolean).join(' '), c.country].filter((s): s is string => Boolean(s && s.trim()));

/** One next-of-kin contact, optimised for reading in an emergency. */
export const NextOfKinCard: React.FC<NextOfKinCardProps> = ({ contact, emphasis = 'secondary', canEdit, busy, onEdit, onDelete, onSetPrimary }) => {
  const isPrimary = emphasis === 'primary';
  const address = addressLines(contact);

  return (
    <Card className={cn(isPrimary && 'border-primary/40 bg-primary/5')}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className={cn('truncate font-semibold leading-tight', isPrimary ? 'text-xl' : 'text-base')}>{contact.full_name}</h3>
            {contact.is_primary && (
              <Badge className="gap-1 text-[10px] uppercase tracking-wide"><Star className="h-3 w-3" /> Primary</Badge>
            )}
            {contact.is_emergency_contact ? (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide">Emergency contact</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground">Next of kin only</Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{contact.relationship}</p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" disabled={busy} aria-label={`Actions for ${contact.full_name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onEdit(contact)}><Pencil className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
              {!contact.is_primary && (
                <DropdownMenuItem onClick={() => onSetPrimary(contact)}><Star className="mr-2 h-4 w-4" /> Set as primary</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(contact)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className={cn('flex flex-wrap gap-2', isPrimary && 'gap-3')}>
          {contact.phone_primary && (
            <Button asChild variant={isPrimary ? 'default' : 'outline'} size={isPrimary ? 'lg' : 'sm'} className="gap-2">
              <a href={telHref(contact.phone_primary)}><Phone className="h-4 w-4" />{contact.phone_primary}</a>
            </Button>
          )}
          {contact.phone_secondary && (
            <Button asChild variant="outline" size={isPrimary ? 'lg' : 'sm'} className="gap-2">
              <a href={telHref(contact.phone_secondary)}><Phone className="h-4 w-4" />{contact.phone_secondary}</a>
            </Button>
          )}
          {contact.email && (
            <Button asChild variant="outline" size={isPrimary ? 'lg' : 'sm'} className="gap-2">
              <a href={`mailto:${contact.email}`}><Mail className="h-4 w-4" />{contact.email}</a>
            </Button>
          )}
          {!contact.phone_primary && !contact.phone_secondary && !contact.email && (
            <span className="text-sm text-destructive">No phone or email on record.</span>
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {address.length > 0 && (
            <div className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="sr-only">Address</dt>
                <dd>{address.map((line, i) => <div key={i}>{line}</div>)}</dd>
              </div>
            </div>
          )}
          {contact.language && (
            <div className="flex items-start gap-2">
              <Languages className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <dt className="sr-only">Language</dt>
                <dd>Speaks {contact.language}</dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            {contact.consent_obtained_at ? (
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
            )}
            <div>
              <dt className="sr-only">Consent</dt>
              <dd className="text-muted-foreground">
                {contact.consent_obtained_at ? `Consent recorded ${formatDate(contact.consent_obtained_at)}` : 'Consent not recorded'}
              </dd>
            </div>
          </div>
        </dl>

        {contact.notes && <p className="whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm">{contact.notes}</p>}
      </CardContent>
    </Card>
  );
};

export default NextOfKinCard;
