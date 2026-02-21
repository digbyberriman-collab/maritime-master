import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDrills } from '@/modules/drills/hooks/useDrills';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { 
  Plus, 
  FileText, 
  AlertTriangle, 
  Flame, 
  Waves, 
  User, 
  Ship, 
  Anchor, 
  CloudRain, 
  Shield, 
  Stethoscope,
  ChevronDown,
  ChevronRight,
  Download,
  Printer,
  Phone,
  MapPin,
  Users,
  Zap
} from 'lucide-react';
import { EMERGENCY_TYPES } from '@/modules/drills/constants';
import EmergencyContactsModal from './EmergencyContactsModal';

interface QuickActionStep {
  step: number;
  title: string;
  description: string;
}

const DEFAULT_QUICK_ACTIONS: Record<string, QuickActionStep[]> = {
  Fire: [
    { step: 1, title: 'RAISE THE ALARM', description: 'Sound general alarm, announce location on PA system' },
    { step: 2, title: 'NOTIFY BRIDGE', description: 'Report fire location, type, and severity to bridge' },
    { step: 3, title: 'CREW MUSTER', description: 'All hands to emergency stations per muster list' },
    { step: 4, title: 'ASSESS SITUATION', description: 'Determine fire size, type, potential hazards' },
    { step: 5, title: 'ISOLATE AREA', description: 'Close ventilation, doors, fuel supply to area' },
    { step: 6, title: 'FIGHT FIRE', description: 'Deploy appropriate firefighting equipment' },
  ],
  Abandon_Ship: [
    { step: 1, title: 'ABANDON SHIP ORDER', description: 'Master gives abandon ship order via PA' },
    { step: 2, title: 'GENERAL ALARM', description: 'Sound 7 short blasts + 1 long blast' },
    { step: 3, title: 'MUSTER AT STATIONS', description: 'All crew to assigned lifeboat stations' },
    { step: 4, title: 'DON LIFEJACKETS', description: 'All personnel don immersion suits if available' },
    { step: 5, title: 'PREPARE LIFEBOATS', description: 'Swing out lifeboats, check equipment' },
    { step: 6, title: 'EMBARK & LAUNCH', description: 'Orderly embarkation, lower boats to water' },
  ],
  Man_Overboard: [
    { step: 1, title: 'RAISE ALARM', description: 'Shout "Man Overboard!" + indicate side' },
    { step: 2, title: 'RELEASE EQUIPMENT', description: 'Throw life ring with light, MOB marker' },
    { step: 3, title: 'KEEP VISUAL', description: 'Designate lookout to maintain visual contact' },
    { step: 4, title: 'NOTIFY BRIDGE', description: 'Bridge initiates Williamson Turn or other maneuver' },
    { step: 5, title: 'PREPARE RESCUE', description: 'Ready rescue boat, crew with equipment' },
    { step: 6, title: 'RECOVERY', description: 'Approach casualty, recover using appropriate method' },
  ],
  Collision: [
    { step: 1, title: 'ASSESS DAMAGE', description: 'Check for flooding, structural damage, casualties' },
    { step: 2, title: 'SOUND ALARM', description: 'General alarm if flooding or serious damage' },
    { step: 3, title: 'DAMAGE CONTROL', description: 'Deploy damage control parties, shore up breaches' },
    { step: 4, title: 'PUMP WATER', description: 'Activate bilge pumps, boundary cooling if needed' },
    { step: 5, title: 'NOTIFY AUTHORITIES', description: 'Contact VTS, coastguard, company DPA' },
    { step: 6, title: 'ASSIST OTHER VESSEL', description: 'Render assistance if safely possible' },
  ],
  Flooding: [
    { step: 1, title: 'IDENTIFY SOURCE', description: 'Locate flooding source and affected compartments' },
    { step: 2, title: 'SOUND ALARM', description: 'Alert crew, muster damage control parties' },
    { step: 3, title: 'ISOLATE AREA', description: 'Close watertight doors, stop non-essential pumps' },
    { step: 4, title: 'ACTIVATE PUMPS', description: 'Start bilge pumps, deploy portable pumps if needed' },
    { step: 5, title: 'SHORE & PLUG', description: 'Use shoring materials, plugs, cement boxes' },
    { step: 6, title: 'MONITOR STABILITY', description: 'Check trim, list, freeboard continuously' },
  ],
  Grounding: [
    { step: 1, title: 'STOP ENGINES', description: 'Stop engines immediately to prevent further grounding' },
    { step: 2, title: 'SOUND TANKS', description: 'Check all tanks for ingress, assess damage' },
    { step: 3, title: 'CHECK STABILITY', description: 'Monitor draft, trim, list' },
    { step: 4, title: 'ASSESS POLLUTION', description: 'Check for fuel/cargo leakage' },
    { step: 5, title: 'NOTIFY AUTHORITIES', description: 'Contact VTS, coastguard, P&I, class' },
    { step: 6, title: 'PLAN REFLOATING', description: 'Wait for tide, arrange tugs if needed' },
  ],
  Pollution: [
    { step: 1, title: 'STOP SOURCE', description: 'Identify and stop source of pollution' },
    { step: 2, title: 'CONTAIN SPILL', description: 'Deploy booms, absorbent materials' },
    { step: 3, title: 'NOTIFY AUTHORITIES', description: 'Report to coastguard, port state, flag state' },
    { step: 4, title: 'CONTACT P&I', description: 'Immediate notification to P&I club' },
    { step: 5, title: 'DOCUMENT', description: 'Photos, quantities, times, actions taken' },
    { step: 6, title: 'CLEANUP', description: 'Recover pollutant, dispose properly' },
  ],
  Piracy: [
    { step: 1, title: 'SOUND ALARM', description: 'Activate ship security alert system (SSAS)' },
    { step: 2, title: 'NOTIFY AUTHORITIES', description: 'Contact UKMTO, naval forces, company SSO' },
    { step: 3, title: 'CITADEL', description: 'Crew retreat to citadel if safe to do so' },
    { step: 4, title: 'SECURE BRIDGE', description: 'Lock bridge, disable controls if abandoning' },
    { step: 5, title: 'AVOID CONFRONTATION', description: 'Do not resist armed attackers' },
    { step: 6, title: 'DOCUMENT', description: 'Preserve evidence, record details when safe' },
  ],
  Medical: [
    { step: 1, title: 'ASSESS PATIENT', description: 'Check airways, breathing, circulation' },
    { step: 2, title: 'FIRST AID', description: 'Provide immediate first aid treatment' },
    { step: 3, title: 'CONTACT TMAS', description: 'Radio for Telemedical Assistance Service' },
    { step: 4, title: 'FOLLOW ADVICE', description: 'Implement TMAS instructions' },
    { step: 5, title: 'PREPARE EVACUATION', description: 'If required, arrange MEDEVAC' },
    { step: 6, title: 'DOCUMENT', description: 'Complete medical log, treatment records' },
  ],
};

const EmergencyProceduresTab: React.FC = () => {
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [showContactsModal, setShowContactsModal] = useState(false);
  const [showMusterModal, setShowMusterModal] = useState(false);
  const [selectedEmergencyType, setSelectedEmergencyType] = useState<string | null>(null);
  
  const { emergencyProcedures, emergencyContacts } = useDrills();
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
      case 'Fire': return <Flame className="h-5 w-5 text-critical" />;
      case 'Flooding': return <Waves className="h-5 w-5 text-info" />;
      case 'Man_Overboard': return <User className="h-5 w-5 text-info" />;
      case 'Abandon_Ship': return <Ship className="h-5 w-5 text-orange" />;
      case 'Collision': return <AlertTriangle className="h-5 w-5 text-warning" />;
      case 'Grounding': return <Anchor className="h-5 w-5 text-amber" />;
      case 'Pollution': return <CloudRain className="h-5 w-5 text-success" />;
      case 'Piracy': return <Shield className="h-5 w-5 text-purple" />;
      case 'Medical': return <Stethoscope className="h-5 w-5 text-pink" />;
      default: return <AlertTriangle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getEmergencyColor = (type: string) => {
    switch (type) {
      case 'Fire': return 'border-critical/20 bg-critical-muted';
      case 'Flooding': return 'border-info/20 bg-info-muted';
      case 'Man_Overboard': return 'border-info/20 bg-info-muted';
      case 'Abandon_Ship': return 'border-orange/20 bg-orange-muted';
      case 'Collision': return 'border-warning/20 bg-warning-muted';
      case 'Grounding': return 'border-amber/20 bg-amber-muted';
      case 'Pollution': return 'border-success/20 bg-success-muted';
      case 'Piracy': return 'border-purple/20 bg-purple-muted';
      case 'Medical': return 'border-pink/20 bg-pink-muted';
      default: return 'border-border bg-muted';
    }
  };

  const handleExpandType = (type: string) => {
    setExpandedType(expandedType === type ? null : type);
  };

  const handleViewMuster = (type: string) => {
    setSelectedEmergencyType(type);
    setShowMusterModal(true);
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowContactsModal(true)}>
            <Phone className="h-4 w-4 mr-2" />
            Emergency Contacts
          </Button>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Procedure
          </Button>
        </div>
      </div>

      {/* Quick Access Emergency Contacts Panel */}
      <Card className="border-red-200 bg-red-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-red-700">
            <Phone className="h-5 w-5" />
            Quick Access Contacts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {emergencyContacts.slice(0, 6).map(contact => (
              <div key={contact.id} className="bg-white rounded-lg p-3 border">
                <p className="font-medium text-sm truncate">{contact.organization_name}</p>
                <p className="text-xs text-muted-foreground">{contact.contact_category.replace('_', ' ')}</p>
                <a 
                  href={`tel:${contact.phone_primary}`}
                  className="text-sm text-primary font-medium hover:underline"
                >
                  {contact.phone_primary}
                </a>
                {contact.available_24_7 && (
                  <Badge variant="outline" className="text-xs mt-1">24/7</Badge>
                )}
              </div>
            ))}
            {emergencyContacts.length === 0 && (
              <div className="col-span-full text-center py-4 text-muted-foreground">
                No emergency contacts configured
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Emergency Procedure Cards */}
      <div className="space-y-4">
        {EMERGENCY_TYPES.map(type => {
          const procedures = groupedProcedures[type.value] || [];
          const quickActions = DEFAULT_QUICK_ACTIONS[type.value] || [];
          const isExpanded = expandedType === type.value;
          
          return (
            <Card 
              key={type.value} 
              className={`${getEmergencyColor(type.value)} border-2 transition-all`}
            >
              <CardHeader 
                className="pb-2 cursor-pointer" 
                onClick={() => handleExpandType(type.value)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-base">
                    {getEmergencyIcon(type.value)}
                    {type.label}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {procedures.length > 0 && (
                      <Badge variant="outline">{procedures.length} procedures</Badge>
                    )}
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5" />
                    ) : (
                      <ChevronRight className="h-5 w-5" />
                    )}
                  </div>
                </div>
              </CardHeader>
              
              {isExpanded && (
                <CardContent className="space-y-4">
                  {/* Quick Action Cards */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-sm">Quick Action Steps</h4>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">
                          <Printer className="h-3 w-3 mr-1" />
                          Print
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-3 w-3 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {quickActions.map((action, idx) => (
                        <div 
                          key={idx}
                          className="bg-white rounded-lg p-4 border relative"
                        >
                          <div className="absolute -top-2 -left-2 w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                            {action.step}
                          </div>
                          <h5 className="font-bold text-sm mb-1 ml-4">{action.title}</h5>
                          <p className="text-xs text-muted-foreground">{action.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Muster Station Info */}
                  {procedures.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                      {procedures.map(proc => (
                        <div key={proc.id} className="bg-white rounded-lg p-4 border">
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="font-medium text-sm">
                                  {proc.muster_station || 'Muster Station'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  Responsible: {proc.responsible_officer || 'TBD'}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              {proc.procedure_document_id && (
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <FileText className="h-4 w-4" />
                                </Button>
                              )}
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7"
                                onClick={() => handleViewMuster(type.value)}
                              >
                                <Users className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          {proc.key_actions && proc.key_actions.length > 0 && (
                            <ul className="text-xs space-y-1 mt-2 border-t pt-2">
                              {proc.key_actions.map((action, idx) => (
                                <li key={idx} className="flex items-start gap-1">
                                  <Zap className="h-3 w-3 text-primary mt-0.5 flex-shrink-0" />
                                  <span>{action}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {procedures.length === 0 && (
                    <div className="text-center py-4 bg-white rounded-lg border">
                      <p className="text-sm text-muted-foreground mb-2">
                        No vessel-specific procedures configured
                      </p>
                      <Button variant="outline" size="sm">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Procedure
                      </Button>
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>

      {/* Emergency Contacts Modal */}
      <EmergencyContactsModal 
        open={showContactsModal}
        onOpenChange={setShowContactsModal}
      />

      {/* Muster List Modal */}
      <Dialog open={showMusterModal} onOpenChange={setShowMusterModal}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Muster List - {selectedEmergencyType?.replace('_', ' ')}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Station</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Assigned</TableHead>
                  <TableHead>Backup</TableHead>
                  <TableHead>Equipment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Lifeboat 1</TableCell>
                  <TableCell>Coxswain</TableCell>
                  <TableCell>Chief Officer</TableCell>
                  <TableCell>2nd Officer</TableCell>
                  <TableCell>Radio, First Aid Kit</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Lifeboat 1</TableCell>
                  <TableCell>Bowman</TableCell>
                  <TableCell>Bosun</TableCell>
                  <TableCell>AB1</TableCell>
                  <TableCell>Painter Line, Hook</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Lifeboat 2</TableCell>
                  <TableCell>Coxswain</TableCell>
                  <TableCell>2nd Engineer</TableCell>
                  <TableCell>3rd Engineer</TableCell>
                  <TableCell>Radio, First Aid Kit</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-4">
                    Muster list data loaded from crew assignments
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ScrollArea>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline">
              <Printer className="h-4 w-4 mr-2" />
              Print Muster List
            </Button>
            <Button variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmergencyProceduresTab;
