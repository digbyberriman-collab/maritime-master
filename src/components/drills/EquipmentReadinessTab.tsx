import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDrills, useDrillDetails } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { CheckCircle, XCircle, AlertCircle, LifeBuoy, Flame, ShieldAlert, Plus } from 'lucide-react';

const EquipmentReadinessTab: React.FC = () => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  
  const { completedDrills } = useDrills();
  const { vessels } = useVessels();

  // Get recent drills for equipment status
  const recentDrills = completedDrills
    .filter(d => selectedVessel === 'all' || d.vessel_id === selectedVessel)
    .slice(0, 10);

  // Equipment categories for display
  const equipmentCategories = [
    {
      name: 'Life Saving Equipment',
      icon: <LifeBuoy className="h-5 w-5 text-blue-500" />,
      items: [
        { name: 'Lifeboats', status: 'satisfactory', lastChecked: '2025-01-15' },
        { name: 'Life Rafts', status: 'satisfactory', lastChecked: '2025-01-15' },
        { name: 'Life Jackets', status: 'satisfactory', lastChecked: '2025-01-20' },
        { name: 'Immersion Suits', status: 'minor_issue', lastChecked: '2025-01-10' },
        { name: 'EPIRB', status: 'satisfactory', lastChecked: '2025-01-15' },
        { name: 'SART', status: 'satisfactory', lastChecked: '2025-01-15' },
      ],
    },
    {
      name: 'Fire Fighting Equipment',
      icon: <Flame className="h-5 w-5 text-red-500" />,
      items: [
        { name: 'Fire Extinguishers', status: 'satisfactory', lastChecked: '2025-01-20' },
        { name: 'SCBA Sets', status: 'satisfactory', lastChecked: '2025-01-18' },
        { name: 'Fire Hoses', status: 'satisfactory', lastChecked: '2025-01-15' },
        { name: 'Fire Pumps', status: 'satisfactory', lastChecked: '2025-01-12' },
        { name: 'Fire Blankets', status: 'satisfactory', lastChecked: '2025-01-10' },
        { name: 'Fireman Outfit', status: 'defective', lastChecked: '2025-01-05' },
      ],
    },
    {
      name: 'Emergency Equipment',
      icon: <ShieldAlert className="h-5 w-5 text-orange-500" />,
      items: [
        { name: 'Emergency Steering', status: 'satisfactory', lastChecked: '2025-01-10' },
        { name: 'Emergency Generator', status: 'satisfactory', lastChecked: '2025-01-08' },
        { name: 'MOB Equipment', status: 'satisfactory', lastChecked: '2025-01-15' },
        { name: 'Medical Kit', status: 'minor_issue', lastChecked: '2025-01-05' },
        { name: 'SOPEP Equipment', status: 'satisfactory', lastChecked: '2025-01-12' },
      ],
    },
  ];

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'satisfactory':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'minor_issue':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'defective':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'satisfactory':
        return <Badge className="bg-green-100 text-green-800">Satisfactory</Badge>;
      case 'minor_issue':
        return <Badge className="bg-yellow-100 text-yellow-800">Minor Issue</Badge>;
      case 'defective':
        return <Badge className="bg-red-100 text-red-800">Defective</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  // Calculate overall readiness
  const allItems = equipmentCategories.flatMap(c => c.items);
  const satisfactoryCount = allItems.filter(i => i.status === 'satisfactory').length;
  const readinessPercentage = Math.round((satisfactoryCount / allItems.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Vessels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {vessels.map(vessel => (
                <SelectItem key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          Add Equipment Check
        </Button>
      </div>

      {/* Overall Readiness */}
      <Card>
        <CardHeader>
          <CardTitle>Overall Equipment Readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Progress value={readinessPercentage} className="h-3" />
            </div>
            <span className="text-2xl font-bold">{readinessPercentage}%</span>
          </div>
          <div className="flex gap-6 mt-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm">
                {allItems.filter(i => i.status === 'satisfactory').length} Satisfactory
              </span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">
                {allItems.filter(i => i.status === 'minor_issue').length} Minor Issues
              </span>
            </div>
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-500" />
              <span className="text-sm">
                {allItems.filter(i => i.status === 'defective').length} Defective
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Equipment Categories */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {equipmentCategories.map(category => {
          const catSatisfactory = category.items.filter(i => i.status === 'satisfactory').length;
          const catPercentage = Math.round((catSatisfactory / category.items.length) * 100);

          return (
            <Card key={category.name}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {category.icon}
                  {category.name}
                </CardTitle>
                <div className="flex items-center gap-2 mt-2">
                  <Progress value={catPercentage} className="h-2 flex-1" />
                  <span className="text-sm font-medium">{catPercentage}%</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {category.items.map(item => (
                    <div 
                      key={item.name} 
                      className="flex items-center justify-between p-2 rounded-lg border"
                    >
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.status)}
                        <span className="text-sm">{item.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {item.lastChecked}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent Equipment Checks from Drills */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Equipment Checks from Drills</CardTitle>
        </CardHeader>
        <CardContent>
          {recentDrills.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Drill</TableHead>
                  <TableHead>Vessel</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Equipment Checked</TableHead>
                  <TableHead>Issues Found</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentDrills.map(drill => (
                  <TableRow key={drill.id}>
                    <TableCell className="font-medium">{drill.drill_number}</TableCell>
                    <TableCell>{drill.vessel?.name}</TableCell>
                    <TableCell>
                      {drill.drill_date_actual 
                        ? new Date(drill.drill_date_actual).toLocaleDateString()
                        : new Date(drill.drill_date_scheduled).toLocaleDateString()
                      }
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">View Equipment</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">0 issues</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No completed drills with equipment checks found
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EquipmentReadinessTab;
