import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Shield, FileCheck, MapPin, Anchor, Plus, Download, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { DRAAK_PORTS_OF_CALL, PORT_DIRECTORY } from '@/data/seedData';

function securityLevelBadge(level: number) {
  if (level === 1) return <Badge className="bg-[#22C55E] text-white">Level 1</Badge>;
  if (level === 2) return <Badge className="bg-[#F59E0B] text-black">Level 2</Badge>;
  return <Badge className="bg-[#EF4444] text-white">Level 3</Badge>;
}

function securityLevelColor(level: number): string {
  if (level === 1) return '#22C55E';
  if (level === 2) return '#F59E0B';
  return '#EF4444';
}

const ISPSTab: React.FC = () => {
  const [currentSecLevel, setCurrentSecLevel] = useState(1);
  const [showSecLevelModal, setShowSecLevelModal] = useState(false);
  const [showAddPortModal, setShowAddPortModal] = useState(false);
  const [ports] = useState(DRAAK_PORTS_OF_CALL);

  return (
    <div className="space-y-6">
      {/* Section A - Security Level */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-5 h-5" style={{ color: securityLevelColor(currentSecLevel) }} />
            Security Level
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div
                className="w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white border-4"
                style={{ borderColor: securityLevelColor(currentSecLevel), backgroundColor: `${securityLevelColor(currentSecLevel)}20` }}
              >
                {currentSecLevel}
              </div>
              <p className="text-[#94A3B8] text-sm mt-2">Current MARSEC Level</p>
            </div>
            <div className="flex-1 space-y-2">
              <p className="text-white">
                {currentSecLevel === 1 && 'Normal operations. Minimum security measures maintained.'}
                {currentSecLevel === 2 && 'Heightened security. Additional protective measures in effect.'}
                {currentSecLevel === 3 && 'Exceptional security. Full protective measures in effect.'}
              </p>
              <Button onClick={() => setShowSecLevelModal(true)} className="bg-[#3B82F6]">
                Change Security Level
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B - SSP */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#3B82F6]" />
            Ship Security Plan (SSP)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Version</p>
              <p className="text-white font-bold">Rev 5.1</p>
            </div>
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Approval Status</p>
              <Badge className="bg-[#22C55E] text-white mt-1">Approved</Badge>
            </div>
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Approval Date</p>
              <p className="text-white font-bold">10 Jan 2026</p>
            </div>
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Next Review</p>
              <p className="text-white font-bold">10 Jan 2027</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section C - ISSC */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#22C55E]" />
            International Ship Security Certificate (ISSC)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {[
              { label: 'Number', value: 'CISR-ISSC-2025-0189' },
              { label: 'Issue Date', value: '01 May 2025' },
              { label: 'Expiry Date', value: '01 May 2030' },
              { label: 'Authority', value: 'CISR / Lloyd\'s Register' },
              { label: 'Status', value: 'valid' },
            ].map((field, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#1A2740]">
                <p className="text-xs text-[#94A3B8]">{field.label}</p>
                {field.value === 'valid' ? (
                  <Badge className="bg-[#22C55E] text-white mt-1">Valid</Badge>
                ) : (
                  <p className="text-white font-bold text-sm">{field.value}</p>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Section D - Last 10 Ports of Call — CRITICAL */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#3B82F6]" />
            Last 10 Ports of Call
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
              <Download className="w-4 h-4" /> Export PDF
            </Button>
            <Button size="sm" className="gap-1 bg-[#3B82F6]" onClick={() => setShowAddPortModal(true)}>
              <Plus className="w-4 h-4" /> Add Port of Call
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1A2740]">
                  <TableHead className="text-[#94A3B8]">Port</TableHead>
                  <TableHead className="text-[#94A3B8]">Country</TableHead>
                  <TableHead className="text-[#94A3B8]">UNLOCODE</TableHead>
                  <TableHead className="text-[#94A3B8]">Arrival</TableHead>
                  <TableHead className="text-[#94A3B8]">Departure</TableHead>
                  <TableHead className="text-[#94A3B8]">Sec Level</TableHead>
                  <TableHead className="text-[#94A3B8]">DoS Required</TableHead>
                  <TableHead className="text-[#94A3B8]">DoS Done</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ports.map((port, i) => (
                  <TableRow key={i} className={`border-[#1A2740] ${i === 0 ? 'bg-[#1A2740]/50' : ''}`}>
                    <TableCell className="text-white font-medium">
                      {port.portName}
                      {i === 0 && !port.departure && (
                        <Badge className="bg-[#3B82F6] text-white ml-2 text-xs">IN PORT</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-white">{port.country}</TableCell>
                    <TableCell className="text-white font-mono text-sm">{port.unlocode}</TableCell>
                    <TableCell className="text-white">{format(new Date(port.arrival), 'dd MMM HH:mm')}</TableCell>
                    <TableCell className="text-white">
                      {port.departure ? format(new Date(port.departure), 'dd MMM HH:mm') : '—'}
                    </TableCell>
                    <TableCell>{securityLevelBadge(port.securityLevel)}</TableCell>
                    <TableCell className="text-white">{port.dosRequired ? 'Yes' : 'No'}</TableCell>
                    <TableCell className="text-white">
                      {port.dosRequired ? (port.dosCompleted ? 'Yes' : 'No') : 'N/A'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section E - Security Drills */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
            Security Drills
          </CardTitle>
          <Button size="sm" className="gap-1 bg-[#3B82F6]">
            <Plus className="w-4 h-4" /> Log Drill
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2740]">
                <TableHead className="text-[#94A3B8]">Date</TableHead>
                <TableHead className="text-[#94A3B8]">Type</TableHead>
                <TableHead className="text-[#94A3B8]">Conducted By</TableHead>
                <TableHead className="text-[#94A3B8]">Participants</TableHead>
                <TableHead className="text-[#94A3B8]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { date: '2026-02-10', type: 'SSP Drill', conductor: 'Jack Sanguinetti', participants: 12, status: 'Completed' },
                { date: '2026-01-15', type: 'Security Communications Drill', conductor: 'Phillip Carter', participants: 8, status: 'Completed' },
                { date: '2025-12-01', type: 'Coordination Exercise', conductor: 'Digby Berriman', participants: 24, status: 'Completed' },
                { date: '2026-03-15', type: 'SSP Drill', conductor: 'Juan Norman', participants: 0, status: 'Scheduled' },
              ].map((drill, i) => (
                <TableRow key={i} className="border-[#1A2740]">
                  <TableCell className="text-white">{format(new Date(drill.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-white">{drill.type}</TableCell>
                  <TableCell className="text-white">{drill.conductor}</TableCell>
                  <TableCell className="text-white">{drill.participants || '—'}</TableCell>
                  <TableCell>
                    <Badge className={drill.status === 'Completed' ? 'bg-[#22C55E] text-white' : 'bg-[#3B82F6] text-white'}>
                      {drill.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section F - CSR */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Anchor className="w-5 h-5 text-[#3B82F6]" />
            Continuous Synopsis Record (CSR)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Current Version</p>
              <p className="text-white font-bold">CSR-12</p>
            </div>
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Last Amendment</p>
              <p className="text-white font-bold">15 Jan 2026</p>
            </div>
            <div className="p-3 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Status</p>
              <Badge className="bg-[#22C55E] text-white mt-1">Current</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Security Level Modal */}
      <Dialog open={showSecLevelModal} onOpenChange={setShowSecLevelModal}>
        <DialogContent className="bg-[#111D33] border-[#1A2740]">
          <DialogHeader>
            <DialogTitle className="text-white">Change Security Level</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[#94A3B8]">New Security Level</Label>
              <Select onValueChange={(v) => setCurrentSecLevel(Number(v))}>
                <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent className="bg-[#111D33] border-[#1A2740]">
                  <SelectItem value="1">Level 1 — Normal</SelectItem>
                  <SelectItem value="2">Level 2 — Heightened</SelectItem>
                  <SelectItem value="3">Level 3 — Exceptional</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[#94A3B8]">Reason</Label>
              <Textarea className="bg-[#1A2740] border-[#1A2740] text-white" placeholder="Reason for level change..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSecLevelModal(false)} className="border-[#1A2740] text-[#94A3B8]">
              Cancel
            </Button>
            <Button className="bg-[#3B82F6]" onClick={() => setShowSecLevelModal(false)}>
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Port of Call Modal */}
      <Dialog open={showAddPortModal} onOpenChange={setShowAddPortModal}>
        <DialogContent className="bg-[#111D33] border-[#1A2740] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Add Port of Call</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[#94A3B8]">Port</Label>
              <Select>
                <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                  <SelectValue placeholder="Search port..." />
                </SelectTrigger>
                <SelectContent className="bg-[#111D33] border-[#1A2740] max-h-[200px]">
                  {PORT_DIRECTORY.map((port) => (
                    <SelectItem key={port.locode} value={port.locode}>
                      {port.portName}, {port.country} ({port.locode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#94A3B8]">Arrival Date</Label>
                <Input type="datetime-local" className="bg-[#1A2740] border-[#1A2740] text-white" />
              </div>
              <div>
                <Label className="text-[#94A3B8]">Departure Date</Label>
                <Input type="datetime-local" className="bg-[#1A2740] border-[#1A2740] text-white" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-[#94A3B8]">Security Level at Port</Label>
                <Select>
                  <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                    <SelectValue placeholder="Level" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111D33] border-[#1A2740]">
                    <SelectItem value="1">Level 1</SelectItem>
                    <SelectItem value="2">Level 2</SelectItem>
                    <SelectItem value="3">Level 3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[#94A3B8]">DoS Required?</Label>
                <Select>
                  <SelectTrigger className="bg-[#1A2740] border-[#1A2740] text-white">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111D33] border-[#1A2740]">
                    <SelectItem value="no">No</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPortModal(false)} className="border-[#1A2740] text-[#94A3B8]">
              Cancel
            </Button>
            <Button className="bg-[#3B82F6]" onClick={() => setShowAddPortModal(false)}>
              Add Port
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ISPSTab;
