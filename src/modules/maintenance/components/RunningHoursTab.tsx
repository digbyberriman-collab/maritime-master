import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMaintenance } from '@/modules/maintenance/hooks/useMaintenance';
import { getCriticalityConfig } from '@/modules/maintenance/constants';
import { Clock, Plus, History } from 'lucide-react';
import { format } from 'date-fns';

const RunningHoursTab: React.FC = () => {
  const { equipment, logRunningHours } = useMaintenance();
  const [showLogModal, setShowLogModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<string | null>(null);
  const [newHours, setNewHours] = useState('');
  const [notes, setNotes] = useState('');

  // Filter equipment that tracks running hours
  const runningHoursEquipment = equipment.filter(e => e.running_hours_total > 0 || e.running_hours_last_updated);

  const handleLogHours = async () => {
    if (!selectedEquipment || !newHours) return;

    await logRunningHours.mutateAsync({
      equipment_id: selectedEquipment,
      running_hours: parseInt(newHours, 10),
      notes: notes || undefined,
    });

    setShowLogModal(false);
    setSelectedEquipment(null);
    setNewHours('');
    setNotes('');
  };

  const openLogModal = (equipmentId: string) => {
    setSelectedEquipment(equipmentId);
    const equip = equipment.find(e => e.id === equipmentId);
    if (equip) {
      setNewHours(equip.running_hours_total.toString());
    }
    setShowLogModal(true);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Running Hours Log</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {runningHoursEquipment.length === 0 ? (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No equipment tracking running hours</p>
              <p className="text-sm text-muted-foreground">
                Add equipment with running hours tracking enabled
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Equipment Code</TableHead>
                  <TableHead>Equipment Name</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Criticality</TableHead>
                  <TableHead>Current Hours</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runningHoursEquipment.map((equip) => {
                  const criticalityConfig = getCriticalityConfig(equip.criticality);

                  return (
                    <TableRow key={equip.id}>
                      <TableCell className="font-mono font-medium">
                        {equip.equipment_code}
                      </TableCell>
                      <TableCell>{equip.equipment_name}</TableCell>
                      <TableCell>{equip.category?.category_name || '—'}</TableCell>
                      <TableCell>
                        <Badge className={criticalityConfig?.color || ''}>
                          {criticalityConfig?.label || equip.criticality}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-lg font-semibold">
                          {equip.running_hours_total.toLocaleString()}
                        </span>
                        <span className="text-muted-foreground ml-1">hrs</span>
                      </TableCell>
                      <TableCell>
                        {equip.running_hours_last_updated ? (
                          format(new Date(equip.running_hours_last_updated), 'MMM d, yyyy HH:mm')
                        ) : (
                          <span className="text-muted-foreground">Never</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => openLogModal(equip.id)}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Update
                          </Button>
                          <Button variant="ghost" size="sm" title="View History">
                            <History className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Log Running Hours Modal */}
      <Dialog open={showLogModal} onOpenChange={setShowLogModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Running Hours</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Equipment</Label>
              <p className="text-sm font-medium">
                {equipment.find(e => e.id === selectedEquipment)?.equipment_code} - {' '}
                {equipment.find(e => e.id === selectedEquipment)?.equipment_name}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Current Running Hours</Label>
              <Input
                id="hours"
                type="number"
                value={newHours}
                onChange={(e) => setNewHours(e.target.value)}
                placeholder="Enter current running hours"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any observations or comments..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLogModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleLogHours} disabled={!newHours || logRunningHours.isPending}>
              {logRunningHours.isPending ? 'Updating...' : 'Update Hours'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default RunningHoursTab;
