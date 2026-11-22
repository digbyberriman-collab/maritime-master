/**
 * Whether the vessel switcher is offered (gap/10 top bar element 3: users
 * with at least two vessels; spec §6.2, fail closed). False while access or
 * the vessel list is loading, and with fewer than two vessels in reach, so
 * neither the chevron, `g v` nor `ShellActions.openVesselSwitcher` offers a
 * switcher that would open empty or on another user's list.
 */
import { useScopeAccess } from '@/app/router/useScopeAccess';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

export function useVesselSwitcherAvailable(): boolean {
  const access = useScopeAccess();
  const { vessels, loading } = useVessel();
  return access.ready && !loading && vessels.length >= 2;
}
