import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookUser, CheckCircle2, CircleDashed, HeartPulse, Stamp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { expiryLabel, expiryTone, formatDate, humanise, toneClass, type ExpiryTone } from '@/modules/hris/lib/format';
import { resolveRequiredDocuments, type CertificateLike } from './requiredDocuments';

interface ComplianceStripProps {
  profileId: string;
  /** Auth user id when the crew member has an account; certificates are keyed on it. */
  userId: string | null;
}

interface ProfileDocumentFields {
  passport_number: string | null;
  passport_expiry: string | null;
  medical_expiry: string | null;
  visa_status: string | null;
  nationality: string | null;
}

const StatCard: React.FC<{ icon: React.ElementType; title: string; primary: string; secondary?: string; tone: ExpiryTone; loading: boolean }> = ({
  icon: Icon,
  title,
  primary,
  secondary,
  tone,
  loading,
}) => (
  <Card className={cn('border', toneClass[tone])}>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1">
      <CardTitle className="text-xs font-medium uppercase tracking-wide">{title}</CardTitle>
      <Icon className="h-4 w-4 opacity-70" />
    </CardHeader>
    <CardContent>
      {loading ? (
        <Skeleton className="h-6 w-28" />
      ) : (
        <>
          <div className="text-lg font-semibold leading-tight">{primary}</div>
          {secondary && <p className="text-xs opacity-80">{secondary}</p>}
        </>
      )}
    </CardContent>
  </Card>
);

/**
 * Compliance summary for the selected crew member: passport / medical /
 * visa from the profile row, plus a required-document checklist resolved
 * against their certificates.
 */
export const ComplianceStrip: React.FC<ComplianceStripProps> = ({ profileId, userId }) => {
  const profileQuery = useQuery({
    queryKey: ['hris', 'profile-documents', profileId],
    staleTime: 30_000,
    queryFn: async (): Promise<ProfileDocumentFields | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('passport_number, passport_expiry, medical_expiry, visa_status, nationality')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const certificatesQuery = useQuery({
    queryKey: ['hris', 'profile-certificate-types', userId],
    enabled: Boolean(userId),
    staleTime: 30_000,
    queryFn: async (): Promise<CertificateLike[]> => {
      const { data, error } = await supabase
        .from('crew_certificates')
        .select('certificate_type, certificate_name, expiry_date')
        .eq('user_id', userId as string);
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = profileQuery.isLoading || (Boolean(userId) && certificatesQuery.isLoading);
  const p = profileQuery.data;

  const checklist = useMemo(
    () =>
      resolveRequiredDocuments(
        {
          passport_number: p?.passport_number ?? null,
          passport_expiry: p?.passport_expiry ?? null,
          medical_expiry: p?.medical_expiry ?? null,
          certificates: certificatesQuery.data ?? [],
        },
        expiryTone,
      ),
    [p, certificatesQuery.data],
  );

  const complete = checklist.filter((c) => c.present).length;
  const visaTone: ExpiryTone = !p?.visa_status ? 'none' : /expired|denied|refused|invalid/i.test(p.visa_status) ? 'expired' : /pending|applied|processing/i.test(p.visa_status) ? 'warning' : 'ok';

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={BookUser}
          title="Passport"
          primary={p?.passport_expiry ? formatDate(p.passport_expiry) : p?.passport_number ? 'No expiry recorded' : 'Not recorded'}
          secondary={p?.passport_expiry ? expiryLabel(p.passport_expiry) : p?.nationality ? `Nationality: ${p.nationality}` : undefined}
          tone={expiryTone(p?.passport_expiry)}
          loading={loading}
        />
        <StatCard
          icon={HeartPulse}
          title="Medical"
          primary={p?.medical_expiry ? formatDate(p.medical_expiry) : 'Not recorded'}
          secondary={p?.medical_expiry ? expiryLabel(p.medical_expiry) : 'ENG1 / ML5 expiry'}
          tone={expiryTone(p?.medical_expiry)}
          loading={loading}
        />
        <StatCard
          icon={Stamp}
          title="Visa"
          primary={p?.visa_status ? humanise(p.visa_status) : 'Not recorded'}
          secondary="From personal details"
          tone={visaTone}
          loading={loading}
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span>Required documents</span>
            <span className="text-xs font-normal text-muted-foreground">{loading ? '…' : `${complete} of ${checklist.length} on file`}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {loading
            ? Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-7 w-32" />)
            : checklist.map((item) => (
                <Badge
                  key={item.key}
                  variant="outline"
                  title={item.expiry ? `${item.label}: expires ${formatDate(item.expiry)}` : item.present ? `${item.label}: on file` : `${item.label}: missing`}
                  className={cn('gap-1.5 py-1 font-normal', item.present ? toneClass[item.tone === 'none' ? 'ok' : item.tone] : 'border-dashed text-muted-foreground')}
                >
                  {item.present ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleDashed className="h-3.5 w-3.5" />}
                  {item.label}
                  {item.expiry && <span className="opacity-70">· {formatDate(item.expiry, 'MMM yy')}</span>}
                </Badge>
              ))}
          {!loading && !userId && (
            <p className="w-full text-xs text-muted-foreground">Certificate-based items cannot be checked until this crew member has an account.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ComplianceStrip;
