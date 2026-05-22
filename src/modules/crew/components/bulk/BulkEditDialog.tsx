import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBulkUpdateProfile } from '@/modules/crew/hooks/useBulkCrewMutations';

interface BulkEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userIds: string[];
}

const KEEP = '__keep__';

export const BulkEditDialog: React.FC<BulkEditDialogProps> = ({ open, onOpenChange, userIds }) => {
  const [department, setDepartment] = useState('');
  const [rotation, setRotation] = useState('');
  const [accountStatus, setAccountStatus] = useState<string>(KEEP);
  const mutation = useBulkUpdateProfile();

  const submit = async () => {
    const patch: Record<string, string | null | undefined> = {};
    if (department) patch.department = department;
    if (rotation) patch.rotation = rotation;
    if (accountStatus !== KEEP) patch.account_status = accountStatus;
    if (Object.keys(patch).length === 0) return;
    await mutation.mutateAsync({ userIds, patch });
    onOpenChange(false);
    setDepartment('');
    setRotation('');
    setAccountStatus(KEEP);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bulk edit {userIds.length} crew</DialogTitle>
          <DialogDescription>
            Only the fields you fill in will be updated. Leave a field blank to keep it unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-dept">Department</Label>
            <Input id="bulk-dept" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="e.g. Interior" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bulk-rot">Rotation</Label>
            <Input id="bulk-rot" value={rotation} onChange={(e) => setRotation(e.target.value)} placeholder="e.g. 2:2" />
          </div>
          <div className="space-y-1.5">
            <Label>Account Status</Label>
            <Select value={accountStatus} onValueChange={setAccountStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP}>Keep unchanged</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="on_leave">On Leave</SelectItem>
                <SelectItem value="disabled">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={mutation.isPending}>
            {mutation.isPending ? 'Updating…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
