import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { notify } from '@/shared/lib/notify';
import { complianceRefusalMessage, useRequirementsConfigActions, type RequirementsSettings } from '@/modules/crew/hooks/useRequirementsConfig';
import type { VesselCrewSettingsPatch } from '@/modules/crew/types/db.pending';

const plural = (n: number, one: string, other: string) => `${n} ${n === 1 ? one : other}`;

/** One setting: its switch, name and the sentence of what it does. */
const SettingRow: React.FC<{
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled: boolean;
  pending: boolean;
  onChange: (on: boolean) => void;
}> = ({ id, label, description, checked, disabled, pending, onChange }) => (
  <div className="flex min-w-0 items-start justify-between gap-4 py-3" data-setting={id}>
    <div className="min-w-0">
      <label htmlFor={id} className="type-body font-medium text-foreground">
        {label}
      </label>
      <p id={`${id}-help`} className="type-caption text-muted-foreground">
        {description}
      </p>
    </div>
    <div className="flex shrink-0 items-center gap-2 [@media(pointer:coarse)]:min-h-11">
      {pending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
      <Switch id={id} checked={checked} disabled={disabled || pending} onCheckedChange={onChange} aria-describedby={`${id}-help`} />
    </div>
  </div>
);

/**
 * The vessel's crew settings on the configuration tab (gap/04 C13, C33):
 * "Passenger ship?" (adds the STCW passenger-ship requirements for every
 * listed position, or removes them, with a confirmation first), crew
 * uploads of their own documents and fleet approval of transfers
 * (crew_vessel_settings_save). Each switch shows the server's value and
 * changes only on a confirmed answer; read only without crew compliance
 * administration.
 */
export const PassengerShipToggle: React.FC<{
  companyId: string;
  vesselId: string;
  vesselName: string;
  settings: RequirementsSettings;
  canEdit: boolean;
}> = ({ companyId, vesselId, vesselName, settings, canEdit }) => {
  const { setPassenger, saveSettings } = useRequirementsConfigActions(companyId, vesselId);
  const [confirm, setConfirm] = React.useState<boolean | null>(null);
  const [pendingKey, setPendingKey] = React.useState<keyof VesselCrewSettingsPatch | null>(null);

  const applyPassenger = async (on: boolean) => {
    setConfirm(null);
    try {
      const row = await setPassenger.mutateAsync({ vesselId, on });
      notify.success(on ? `${vesselName} is a passenger ship` : `${vesselName} is no longer a passenger ship`, {
        description: on
          ? `${plural(row.rows_added, 'passenger-ship requirement', 'passenger-ship requirements')} added for every listed position.`
          : `${plural(row.rows_removed, 'passenger-ship requirement', 'passenger-ship requirements')} removed.`,
      });
    } catch (error) {
      notify.error(complianceRefusalMessage(error), { title: 'The passenger ship setting was not saved' });
    }
  };

  const save = async (key: keyof VesselCrewSettingsPatch, on: boolean) => {
    setPendingKey(key);
    try {
      await saveSettings.mutateAsync({ vesselId, patch: { [key]: on } });
      notify.success('Setting saved');
    } catch (error) {
      notify.error(complianceRefusalMessage(error), { title: 'The setting was not saved' });
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <Card className="min-w-0" data-crew-settings="">
      <CardHeader className="p-4 pb-0 sm:p-6 sm:pb-0">
        <CardTitle className="type-subtitle">Vessel settings</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border p-4 pt-1 sm:p-6 sm:pt-1">
        <SettingRow
          id="setting-passenger"
          label="Passenger ship"
          description="Adds the STCW passenger-ship requirements (crowd management, crisis management and passenger safety) for every listed position. Turning it off removes them and their ticks."
          checked={settings.isPassengerShip}
          disabled={!canEdit}
          pending={setPassenger.isPending}
          onChange={(on) => setConfirm(on)}
        />
        <SettingRow
          id="setting-uploads"
          label="Crew add their own documents"
          description="Crew members can add and correct their own documents from My documents. Each one then waits for verification."
          checked={settings.crewUploadsEnabled}
          disabled={!canEdit}
          pending={pendingKey === 'crew_uploads_enabled'}
          onChange={(on) => void save('crew_uploads_enabled', on)}
        />
        <SettingRow
          id="setting-transfers"
          label="Transfers need fleet approval"
          description="A transfer to another vessel waits for fleet approval before it is scheduled. Off: the vessel's officers who assign crew decide."
          checked={settings.transferRequiresFleetApproval}
          disabled={!canEdit}
          pending={pendingKey === 'transfer_requires_fleet_approval'}
          onChange={(on) => void save('transfer_requires_fleet_approval', on)}
        />
      </CardContent>
      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? `Make ${vesselName} a passenger ship?` : `${vesselName} is not a passenger ship?`}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm
                ? 'The STCW passenger-ship requirements are added and required for every listed position. You can untick positions afterwards.'
                : 'The STCW passenger-ship requirements are removed from this vessel, with their ticks. Documents already held stay on the profiles.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm !== null && void applyPassenger(confirm)}>
              {confirm ? 'Add the requirements' : 'Remove the requirements'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default PassengerShipToggle;
