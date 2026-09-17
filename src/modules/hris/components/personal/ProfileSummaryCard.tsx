import React from 'react';
import { Anchor, Mail, Phone, Ship } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { HrCrewDirectoryEntry } from '@/modules/hris/hooks/useHrCrewDirectory';
import type { HrProfile } from '@/modules/hris/hooks/useHrProfile';
import { formatDateTime, humanise } from '@/modules/hris/lib/format';
import { AvatarUploader } from './AvatarUploader';

interface ProfileSummaryCardProps {
  profile: HrProfile;
  /** Directory entry (vessel assignment lives here), may be null while loading. */
  entry: HrCrewDirectoryEntry | null;
  canUploadAvatar: boolean;
}

const ACCOUNT_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  invited: 'secondary',
  not_invited: 'outline',
  disabled: 'destructive',
  deactivated: 'destructive',
};

export const ProfileSummaryCard: React.FC<ProfileSummaryCardProps> = ({ profile, entry, canUploadAvatar }) => {
  const displayName = profile.preferred_name
    ? `${profile.preferred_name} ${profile.last_name}`
    : `${profile.first_name} ${profile.last_name}`;
  const roleLine = [profile.rank ?? profile.position, profile.department].filter(Boolean).join(' · ');
  const accountStatus = profile.account_status ?? (profile.user_id ? 'active' : 'not_invited');

  return (
    <Card className="bg-card">
      <CardContent className="flex flex-col items-center gap-4 p-6 text-center">
        <AvatarUploader
          profileId={profile.id}
          avatarUrl={profile.avatar_url}
          firstName={profile.first_name}
          lastName={profile.last_name}
          canUpload={canUploadAvatar}
        />
        <div className="min-w-0 space-y-1">
          <h2 className="truncate text-lg font-semibold text-foreground">{displayName}</h2>
          {profile.preferred_name && (
            <p className="truncate text-xs text-muted-foreground">
              {profile.first_name} {profile.last_name}
            </p>
          )}
          {roleLine && <p className="text-sm text-muted-foreground">{roleLine}</p>}
        </div>

        <div className="flex flex-wrap justify-center gap-1.5">
          {profile.status && (
            <Badge variant="outline" className="text-[10px]">
              {profile.status}
            </Badge>
          )}
          <Badge variant={ACCOUNT_VARIANT[accountStatus] ?? 'outline'} className="text-[10px]">
            {humanise(accountStatus)}
          </Badge>
          {profile.is_imported && (
            <Badge variant="outline" className="text-[10px]">
              Imported
            </Badge>
          )}
        </div>

        <Separator />

        <dl className="w-full space-y-2 text-left text-sm">
          <div className="flex items-start gap-2">
            <Ship className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="sr-only">Vessel</dt>
              <dd className="truncate text-foreground">{entry?.vessel_name ?? 'No current vessel'}</dd>
              {entry?.assignment_position && (
                <dd className="truncate text-xs text-muted-foreground">{entry.assignment_position}</dd>
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="sr-only">Email</dt>
              <dd className="truncate">
                <a href={`mailto:${profile.email}`} className="text-foreground hover:underline">
                  {profile.email}
                </a>
              </dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="sr-only">Phone</dt>
              <dd className="truncate text-foreground">{profile.phone || '—'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Anchor className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <dt className="sr-only">Last login</dt>
              <dd className="truncate text-xs text-muted-foreground">
                {profile.user_id
                  ? profile.last_login_at
                    ? `Last login ${formatDateTime(profile.last_login_at)}`
                    : 'Never logged in'
                  : 'No login account yet'}
              </dd>
            </div>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
};

export default ProfileSummaryCard;
