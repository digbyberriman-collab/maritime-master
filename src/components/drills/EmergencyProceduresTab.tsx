import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDrills } from '@/hooks/useDrills';
import { useVessels } from '@/hooks/useVessels';
import { Plus, FileText, AlertTriangle, Flame, Waves, User, Ship, Anchor, CloudRain, Shield, Stethoscope } from 'lucide-react';
import { EMERGENCY_TYPES } from '@/lib/drillConstants';

const EmergencyProceduresTab: React.FC = () => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  
  const { emergencyProcedures } = useDrills();
  const { vessels } = useVessels();

  // Filter procedures by vessel
  const filteredProcedures = selectedVessel === 'all' 
    ? emergencyProcedures 
    : emergencyProcedures.filter(p => p.vessel_id === selectedVessel);

  // Group procedures by emergency type
  const groupedProcedures = EMERGENCY_TYPES.reduce((acc, type) => {
    acc[type.value] = filteredProcedures.filter(p => p.emergency_type === type.value);
    return acc;
  }, {} as Record<string, typeof emergencyProcedures>);

  const getEmergencyIcon = (type: string) => {
    switch (type) {
      case 'Fire': return <Flame className="h-5 w-5 text-red-500" />;
      case 'Flooding': return <Waves className="h-5 w-5 text-blue-500" />;
      case 'Man_Overboard': return <User className="h-5 w-5 text-blue-600" />;
      case 'Abandon_Ship': return <Ship className="h-5 w-5 text-orange-500" />;
      case 'Collision': return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'Grounding': return <Anchor className="h-5 w-5 text-amber-600" />;
      case 'Pollution': return <CloudRain className="h-5 w-5 text-green-500" />;
      case 'Piracy': return <Shield className="h-5 w-5 text-purple-500" />;
      case 'Medical': return <Stethoscope className="h-5 w-5 text-pink-500" />;
      default: return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getEmergencyColor = (type: string) => {
    switch (type) {
      case 'Fire': return 'border-red-200 bg-red-50';
      case 'Flooding': return 'border-blue-200 bg-blue-50';
      case 'Man_Overboard': return 'border-blue-200 bg-blue-50';
      case 'Abandon_Ship': return 'border-orange-200 bg-orange-50';
      case 'Collision': return 'border-yellow-200 bg-yellow-50';
      case 'Grounding': return 'border-amber-200 bg-amber-50';
      case 'Pollution': return 'border-green-200 bg-green-50';
      case 'Piracy': return 'border-purple-200 bg-purple-50';
      case 'Medical': return 'border-pink-200 bg-pink-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

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
          Add Procedure
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {EMERGENCY_TYPES.map(type => {
          const procedures = groupedProcedures[type.value] || [];
          
          return (
            <Card 
              key={type.value} 
              className={`${getEmergencyColor(type.value)} border-2`}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  {getEmergencyIcon(type.value)}
                  {type.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {procedures.length > 0 ? (
                  <div className="space-y-3">
                    {procedures.map(proc => (
                      <div key={proc.id} className="bg-white rounded-lg p-3 border">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-medium text-sm">
                              {proc.muster_station || 'Muster Station TBD'}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {proc.responsible_officer || 'Officer TBD'}
                            </p>
                          </div>
                          {proc.procedure_document_id && (
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        
                        {proc.key_actions && proc.key_actions.length > 0 && (
                          <ul className="text-xs space-y-1">
                            {proc.key_actions.slice(0, 3).map((action, idx) => (
                              <li key={idx} className="flex items-start gap-1">
                                <span className="text-muted-foreground">•</span>
                                <span>{action}</span>
                              </li>
                            ))}
                            {proc.key_actions.length > 3 && (
                              <li className="text-muted-foreground">
                                +{proc.key_actions.length - 3} more actions...
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground mb-2">
                      No procedures configured
                    </p>
                    <Button variant="outline" size="sm">
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default EmergencyProceduresTab;
