import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from './EmptyState';

export interface ModuleOffProps {
  /** As the nav shows it, after label overrides ("Charter", "Trips"). */
  moduleName: string;
  vesselName?: string;
  /** The viewer may switch modules on (owner / admin with the vessel-settings capability). */
  canEnable?: boolean;
  /** Where to switch it on; shown only with `canEnable`. */
  settingsHref?: string;
  /** Who to ask, for everyone else. */
  whoCanEnable?: string;
  headingLevel?: 1 | 2 | 3 | 4;
  className?: string;
}

/**
 * A module switched off for this vessel or account (gap/10 §A.12, IA9;
 * DECISIONS C13, G3). Admins get the way to switch it on; everyone else is
 * told who can. Also the state for a feature whose tables are not live yet.
 */
export function ModuleOff({
  moduleName,
  vesselName,
  canEnable = false,
  settingsHref,
  whoCanEnable = 'an account admin',
  headingLevel = 1,
  className,
}: ModuleOffProps) {
  const title = vesselName ? `${moduleName} is switched off for ${vesselName}` : `${moduleName} is switched off`;
  const body = canEnable
    ? 'You can switch it on in Vessel Settings.'
    : `Ask ${whoCanEnable} to switch it on if this vessel needs it.`;
  const action =
    canEnable && settingsHref ? (
      <Button asChild size="sm">
        <Link to={settingsHref}>
          <Settings aria-hidden="true" />
          Open Vessel Settings
        </Link>
      </Button>
    ) : undefined;
  return (
    <EmptyState
      kind="not-enabled"
      title={title}
      body={body}
      action={action}
      headingLevel={headingLevel}
      className={className}
    />
  );
}
