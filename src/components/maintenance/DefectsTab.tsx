import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMaintenance } from '@/hooks/useMaintenance';
import { getDefectPriorityConfig, getDefectStatusConfig, getOperationalImpactConfig } from '@/lib/maintenanceConstants';
import { Plus, Eye, Edit, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface DefectsTabProps {
  onLogDefect: () => void;
}

const DefectsTab: React.FC<DefectsTabProps> = ({ onLogDefect }) => {
  const { defects, updateDefect } = useMaintenance();
  const [statusFilter, setStatusFilter] = useState<string>('Open');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');

  const filteredDefects = defects.filter(defect => {
    const matchesStatus = statusFilter === 'all' || defect.status === statusFilter;
    const matchesPriority = priorityFilter === 'all' || defect.priority === priorityFilter;
    return matchesStatus && matchesPriority;
  });

  const handleCloseDefect = async (defectId: string) => {
    await updateDefect.mutateAsync({
      id: defectId,
      status: 'Closed',
      actual_completion_date: new Date().toISOString().split('T')[0],
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Defects Register</CardTitle>
          <Button size="sm" onClick={onLogDefect}>
            <Plus className="h-4 w-4 mr-2" />
            Log Defect
          </Button>
        </div>
        <div className="flex gap-2 mt-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Open">Open</SelectItem>
              <SelectItem value="In_Progress">In Progress</SelectItem>
              <SelectItem value="Awaiting_Parts">Awaiting Parts</SelectItem>
              <SelectItem value="Closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="P1_Critical">P1 - Critical</SelectItem>
              <SelectItem value="P2_Serious">P2 - Serious</SelectItem>
              <SelectItem value="P3_Normal">P3 - Normal</SelectItem>
              <SelectItem value="P4_Minor">P4 - Minor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Defect #</TableHead>
              <TableHead>Equipment</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Reported</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDefects.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  No defects found
                </TableCell>
              </TableRow>
            ) : (
              filteredDefects.map((defect) => {
                const priorityConfig = getDefectPriorityConfig(defect.priority);
                const statusConfig = getDefectStatusConfig(defect.status);
                const impactConfig = getOperationalImpactConfig(defect.operational_impact);

                return (
                  <TableRow key={defect.id}>
                    <TableCell className="font-mono font-medium">
                      {defect.defect_number}
                    </TableCell>
                    <TableCell>
                      {defect.equipment ? (
                        <div>
                          <p className="font-medium">{defect.equipment.equipment_code}</p>
                          <p className="text-xs text-muted-foreground">
                            {defect.equipment.equipment_name}
                          </p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">General</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="max-w-[300px] truncate">{defect.defect_description}</p>
                    </TableCell>
                    <TableCell>
                      <Badge className={priorityConfig?.color || ''}>
                        {priorityConfig?.label || defect.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={impactConfig?.color || ''}>
                        {impactConfig?.label || defect.operational_impact}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusConfig?.color || ''}>
                        {statusConfig?.label || defect.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(defect.reported_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title="View">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" title="Edit">
                          <Edit className="h-4 w-4" />
                        </Button>
                        {defect.status !== 'Closed' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Close Defect"
                            onClick={() => handleCloseDefect(defect.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};

export default DefectsTab;
