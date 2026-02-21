import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Shield, Search, Users, RotateCcw, Copy, Check, X,
} from 'lucide-react';
import { CREW_DRAAK, CREW_LEVIATHAN, CREW_ROCINANTE, CREW_XIPHIAS } from '@/data/seedData';
import { cn } from '@/lib/utils';

const ALL_CREW = [...CREW_DRAAK, ...CREW_LEVIATHAN, ...CREW_ROCINANTE, ...CREW_XIPHIAS];

const MODULES = [
  'Fleet Dashboard', 'Vessel Dashboard', 'Crew Module', 'Crew List (MLC)',
  'Compliance (ISM/ISPS/MLC)', 'Certificates', 'Incident Reporting',
  'Audit & Compliance', 'Checklists', 'Maintenance / PMS',
  'Refit & Projects', 'Leave Planner', 'Itinerary',
  'Flights & Travel', 'Crew Development', 'Emergency Response', 'Settings',
];

const PERMISSION_LEVELS = ['VIEW', 'CREATE', 'EDIT', 'DELETE', 'ADMIN'] as const;

// Default permissions by role
const ROLE_DEFAULTS: Record<string, Record<string, boolean[]>> = {
  captain: Object.fromEntries(MODULES.map(m => [m, [true, true, true, false, m === 'Crew Module' || m === 'Compliance (ISM/ISPS/MLC)' || m === 'Checklists']])),
  chief_officer: Object.fromEntries(MODULES.map(m => [m, [true, m !== 'Settings', m !== 'Settings', false, false]])),
  chief_engineer: Object.fromEntries(MODULES.map(m => [m, [true, m.includes('Maintenance') || m.includes('Checklist'), m.includes('Maintenance') || m.includes('Checklist'), false, false]])),
  super_admin: Object.fromEntries(MODULES.map(m => [m, [true, true, true, true, true]])),
  shore_manager: Object.fromEntries(MODULES.map(m => [m, [true, true, true, true, true]])),
  crew: Object.fromEntries(MODULES.map(m => [m, [m === 'Vessel Dashboard' || m === 'Checklists', false, false, false, false]])),
};

interface UserPermissions {
  role: string;
  vessel: string;
  permissions: Record<string, boolean[]>;
}

const PermissionsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [vesselFilter, setVesselFilter] = useState('all');
  const [selectedUser, setSelectedUser] = useState<string | null>('Phillip Carter');
  const [showConfirmDialog, setShowConfirmDialog] = useState<string | null>(null);

  const [userPerms, setUserPerms] = useState<Record<string, UserPermissions>>(() => {
    const initial: Record<string, UserPermissions> = {};
    ALL_CREW.forEach(crew => {
      const role = crew.level.includes('Captain') ? 'captain'
        : crew.level.includes('Chief Officer') ? 'chief_officer'
        : crew.level.includes('Chief Engineer') ? 'chief_engineer'
        : 'crew';
      initial[crew.name] = {
        role,
        vessel: crew.vessel,
        permissions: ROLE_DEFAULTS[role] ? { ...ROLE_DEFAULTS[role] } : { ...ROLE_DEFAULTS.crew },
      };
    });
    return initial;
  });

  const filteredCrew = ALL_CREW.filter(c => {
    if (searchQuery && !c.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (roleFilter !== 'all') {
      const role = c.level.includes('Captain') ? 'captain'
        : c.level.includes('Chief') ? 'chief_officer'
        : c.level.includes('Engineer') ? 'chief_engineer'
        : 'crew';
      if (role !== roleFilter) return false;
    }
    if (vesselFilter !== 'all' && c.vessel !== vesselFilter) return false;
    return true;
  });

  const selectedPerms = selectedUser ? userPerms[selectedUser] : null;

  const togglePermission = (module: string, levelIdx: number) => {
    if (!selectedUser || !selectedPerms) return;
    const current = selectedPerms.permissions[module] || [false, false, false, false, false];
    const updated = [...current];
    updated[levelIdx] = !updated[levelIdx];
    setUserPerms(prev => ({
      ...prev,
      [selectedUser]: {
        ...prev[selectedUser],
        permissions: {
          ...prev[selectedUser].permissions,
          [module]: updated,
        },
      },
    }));
  };

  const setAllOn = () => {
    if (!selectedUser) return;
    setShowConfirmDialog('all_on');
  };

  const setAllOff = () => {
    if (!selectedUser) return;
    setShowConfirmDialog('all_off');
  };

  const confirmAction = () => {
    if (!selectedUser) return;
    if (showConfirmDialog === 'all_on') {
      const newPerms: Record<string, boolean[]> = {};
      MODULES.forEach(m => { newPerms[m] = [true, true, true, true, true]; });
      setUserPerms(prev => ({
        ...prev,
        [selectedUser]: { ...prev[selectedUser], permissions: newPerms },
      }));
    } else if (showConfirmDialog === 'all_off') {
      const newPerms: Record<string, boolean[]> = {};
      MODULES.forEach(m => { newPerms[m] = [false, false, false, false, false]; });
      setUserPerms(prev => ({
        ...prev,
        [selectedUser]: { ...prev[selectedUser], permissions: newPerms },
      }));
    } else if (showConfirmDialog === 'reset') {
      const role = selectedPerms?.role || 'crew';
      setUserPerms(prev => ({
        ...prev,
        [selectedUser]: { ...prev[selectedUser], permissions: { ...(ROLE_DEFAULTS[role] || ROLE_DEFAULTS.crew) } },
      }));
    }
    setShowConfirmDialog(null);
  };

  const selectedCrewData = ALL_CREW.find(c => c.name === selectedUser);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-6 h-6" />
            Permissions
          </h1>
          <p className="text-muted-foreground">Select a user and configure their module access</p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* User List */}
          <Card className="col-span-12 lg:col-span-4 bg-[#111D33] border-[#1A2740]">
            <CardHeader className="pb-3">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Users className="w-4 h-4" /> Select User
              </CardTitle>
              <div className="space-y-2 mt-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-8 bg-[#1A2740] border-[#1A2740] text-white"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white text-xs h-8">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111D33] border-[#1A2740]">
                      <SelectItem value="all">All Roles</SelectItem>
                      <SelectItem value="captain">Captain</SelectItem>
                      <SelectItem value="chief_officer">Chief Officer</SelectItem>
                      <SelectItem value="chief_engineer">Chief Engineer</SelectItem>
                      <SelectItem value="crew">Crew</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={vesselFilter} onValueChange={setVesselFilter}>
                    <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white text-xs h-8">
                      <SelectValue placeholder="Vessel" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#111D33] border-[#1A2740]">
                      <SelectItem value="all">All Vessels</SelectItem>
                      <SelectItem value="DRAAK">DRAAK</SelectItem>
                      <SelectItem value="LEVIATHAN">LEVIATHAN</SelectItem>
                      <SelectItem value="ROCINANTE">ROCINANTE</SelectItem>
                      <SelectItem value="XIPHIAS">XIPHIAS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-y-auto">
                {filteredCrew.map((crew, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedUser(crew.name)}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 border-b border-[#1A2740] text-left transition-colors',
                      selectedUser === crew.name
                        ? 'bg-[#3B82F6]/10 border-l-2 border-l-[#3B82F6]'
                        : 'hover:bg-[#1A2740]/50'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="text-white text-sm font-medium truncate">{crew.name}</p>
                      <p className="text-[#94A3B8] text-xs">{crew.level} · {crew.vessel}</p>
                    </div>
                    <Badge className="bg-[#22C55E] text-white text-xs shrink-0 ml-2">Active</Badge>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Permission Matrix */}
          <Card className="col-span-12 lg:col-span-8 bg-[#111D33] border-[#1A2740]">
            {selectedUser && selectedPerms ? (
              <>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-white text-base">
                        Permissions: {selectedUser}
                      </CardTitle>
                      <p className="text-[#94A3B8] text-sm mt-1">
                        {selectedCrewData?.level}, {selectedCrewData?.vessel}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={selectedPerms.role} onValueChange={(v) => {
                        setUserPerms(prev => ({
                          ...prev,
                          [selectedUser]: { ...prev[selectedUser], role: v },
                        }));
                      }}>
                        <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[#111D33] border-[#1A2740]">
                          <SelectItem value="super_admin">Super Admin</SelectItem>
                          <SelectItem value="shore_manager">Shore Manager</SelectItem>
                          <SelectItem value="captain">Captain</SelectItem>
                          <SelectItem value="chief_officer">Chief Officer</SelectItem>
                          <SelectItem value="chief_engineer">Chief Engineer</SelectItem>
                          <SelectItem value="crew">Crew</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="outline" className="border-[#1A2740] text-[#94A3B8]" onClick={setAllOn}>
                      All On
                    </Button>
                    <Button size="sm" variant="outline" className="border-[#1A2740] text-[#94A3B8]" onClick={setAllOff}>
                      All Off
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]" onClick={() => setShowConfirmDialog('reset')}>
                      <RotateCcw className="w-3 h-3" /> Reset to Default
                    </Button>
                    <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
                      <Copy className="w-3 h-3" /> Copy From User
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[#1A2740]">
                          <th className="text-left text-[#94A3B8] text-xs font-medium py-2 px-3 w-[250px]">MODULE</th>
                          {PERMISSION_LEVELS.map(level => (
                            <th key={level} className="text-center text-[#94A3B8] text-xs font-medium py-2 px-2 w-[80px]">{level}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {MODULES.map((module) => {
                          const perms = selectedPerms.permissions[module] || [false, false, false, false, false];
                          const isNA = module === 'Fleet Dashboard' || module === 'Vessel Dashboard';
                          return (
                            <tr key={module} className="border-b border-[#1A2740]/50 hover:bg-[#1A2740]/30">
                              <td className="text-white text-sm py-2.5 px-3">{module}</td>
                              {PERMISSION_LEVELS.map((level, idx) => {
                                // Some modules don't have CREATE/DELETE/ADMIN
                                const isNACell = isNA && idx > 0;
                                return (
                                  <td key={level} className="text-center py-2.5 px-2">
                                    {isNACell ? (
                                      <span className="text-[#94A3B8] text-xs">—</span>
                                    ) : (
                                      <Switch
                                        checked={perms[idx]}
                                        onCheckedChange={() => togglePermission(module, idx)}
                                        className={cn(
                                          'data-[state=checked]:bg-[#22C55E]',
                                        )}
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#1A2740]">
                    <div className="flex items-center gap-4 text-xs text-[#94A3B8]">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#22C55E]" /> ON</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#1A2740]" /> OFF</span>
                      <span>— N/A</span>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="border-[#1A2740] text-[#94A3B8]">Cancel</Button>
                      <Button className="bg-[#3B82F6]">Save Permissions</Button>
                    </div>
                  </div>
                </CardContent>
              </>
            ) : (
              <CardContent className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                  <Shield className="w-12 h-12 text-[#94A3B8]/30 mx-auto mb-3" />
                  <p className="text-[#94A3B8]">Select a user to view their permissions</p>
                </div>
              </CardContent>
            )}
          </Card>
        </div>

        {/* Confirm Dialog */}
        <Dialog open={!!showConfirmDialog} onOpenChange={() => setShowConfirmDialog(null)}>
          <DialogContent className="bg-[#111D33] border-[#1A2740]">
            <DialogHeader>
              <DialogTitle className="text-white">Confirm Action</DialogTitle>
            </DialogHeader>
            <p className="text-[#94A3B8]">
              {showConfirmDialog === 'all_on' && 'This will enable ALL permissions for this user. Continue?'}
              {showConfirmDialog === 'all_off' && 'This will remove ALL access for this user. Continue?'}
              {showConfirmDialog === 'reset' && 'This will reset permissions to the default for this role. Any custom overrides will be lost.'}
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmDialog(null)} className="border-[#1A2740] text-[#94A3B8]">Cancel</Button>
              <Button className="bg-[#3B82F6]" onClick={confirmAction}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
};

export default PermissionsPage;
