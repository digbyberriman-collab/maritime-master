/**
 * Mounts the shell's single-key shortcuts (`g v`, `g f`, `?`; see
 * useShellShortcuts) inside AppShell. It reads what is available from the
 * shell's own actions, so a key acts exactly when its surface is offered, and
 * `g f` only with fleet reach (D-26). Renders nothing.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useShellActions } from '@/app/shell/shellActions';
import { useNavAccess } from '@/app/nav/navAccess';
import { useShellShortcuts } from './useShellShortcuts';
import { useFleetTarget } from './useFleetTarget';

const ShellShortcuts: React.FC = () => {
  const { openVesselSwitcher, openKeyboardShortcuts } = useShellActions();
  const { fleetReach } = useNavAccess();
  const fleetTarget = useFleetTarget();
  const navigate = useNavigate();
  const handlers = React.useMemo(
    () => ({
      openVesselSwitcher,
      openKeyboardShortcuts,
      goFleet: fleetReach ? () => navigate(fleetTarget) : undefined,
    }),
    [openVesselSwitcher, openKeyboardShortcuts, fleetReach, fleetTarget, navigate],
  );
  useShellShortcuts(handlers);
  return null;
};

export default ShellShortcuts;
