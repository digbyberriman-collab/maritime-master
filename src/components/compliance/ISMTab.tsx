import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, FileCheck, AlertTriangle, Plus, Download } from 'lucide-react';
import { format } from 'date-fns';

function statusBadge(expiryDate: string) {
  const now = new Date();
  const expiry = new Date(expiryDate);
  const diffDays = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return <Badge className="bg-[#EF4444] text-white">Expired</Badge>;
  if (diffDays <= 90) return <Badge className="bg-[#F59E0B] text-black">Expiring</Badge>;
  return <Badge className="bg-[#22C55E] text-white">Valid</Badge>;
}

const ISMTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* SMS Status */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-white">
            <Shield className="w-5 h-5 text-[#3B82F6]" />
            Safety Management System (SMS)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Document Version</p>
              <p className="text-lg font-bold text-white">Rev 8.2</p>
            </div>
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Approval Date</p>
              <p className="text-lg font-bold text-white">15 Jan 2026</p>
            </div>
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Next Review</p>
              <p className="text-lg font-bold text-white">15 Jan 2027</p>
              <Badge className="bg-[#22C55E] text-white mt-1">On Schedule</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DOC & SMC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#111D33] border-[#1A2740]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileCheck className="w-5 h-5 text-[#22C55E]" />
              Document of Compliance (DOC)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Number</span>
              <span className="text-white font-mono text-sm">CISR-DOC-2025-0234</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Issue Date</span>
              <span className="text-white text-sm">01 Mar 2025</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Expiry Date</span>
              <span className="text-white text-sm">01 Mar 2030</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Issuing Authority</span>
              <span className="text-white text-sm">CISR</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Status</span>
              {statusBadge('2030-03-01')}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111D33] border-[#1A2740]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <FileCheck className="w-5 h-5 text-[#22C55E]" />
              Safety Management Certificate (SMC)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Number</span>
              <span className="text-white font-mono text-sm">CISR-SMC-2025-0567</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Issue Date</span>
              <span className="text-white text-sm">15 Apr 2025</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Expiry Date</span>
              <span className="text-white text-sm">15 Apr 2030</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Issuing Authority</span>
              <span className="text-white text-sm">CISR</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Status</span>
              {statusBadge('2030-04-15')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Schedule */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white">Audit Schedule</CardTitle>
          <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
            <Plus className="w-4 h-4" /> Schedule Audit
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2740]">
                <TableHead className="text-[#94A3B8]">Date</TableHead>
                <TableHead className="text-[#94A3B8]">Type</TableHead>
                <TableHead className="text-[#94A3B8]">Auditor</TableHead>
                <TableHead className="text-[#94A3B8]">Status</TableHead>
                <TableHead className="text-[#94A3B8]">Findings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { date: '2026-06-15', type: 'Internal', auditor: 'Phillip Carter', status: 'Scheduled', findings: 0 },
                { date: '2026-03-10', type: 'External (Annual)', auditor: 'Lloyd\'s Register', status: 'Scheduled', findings: 0 },
                { date: '2025-09-20', type: 'Internal', auditor: 'Jack Sanguinetti', status: 'Completed', findings: 2 },
                { date: '2025-03-15', type: 'External (Annual)', auditor: 'Lloyd\'s Register', status: 'Completed', findings: 1 },
                { date: '2024-09-10', type: 'Internal', auditor: 'Digby Berriman', status: 'Completed', findings: 3 },
              ].map((audit, i) => (
                <TableRow key={i} className="border-[#1A2740]">
                  <TableCell className="text-white">{format(new Date(audit.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell className="text-white">{audit.type}</TableCell>
                  <TableCell className="text-white">{audit.auditor}</TableCell>
                  <TableCell>
                    <Badge className={audit.status === 'Completed' ? 'bg-[#22C55E] text-white' : 'bg-[#3B82F6] text-white'}>
                      {audit.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white">{audit.findings}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Findings Tracker */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-[#F59E0B]" />
            Findings Tracker
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
              <Download className="w-4 h-4" /> Export
            </Button>
            <Button size="sm" className="gap-1 bg-[#3B82F6]">
              <Plus className="w-4 h-4" /> Add Finding
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2740]">
                <TableHead className="text-[#94A3B8]">Ref</TableHead>
                <TableHead className="text-[#94A3B8]">Description</TableHead>
                <TableHead className="text-[#94A3B8]">Severity</TableHead>
                <TableHead className="text-[#94A3B8]">Assigned To</TableHead>
                <TableHead className="text-[#94A3B8]">Due Date</TableHead>
                <TableHead className="text-[#94A3B8]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[
                { ref: 'NC-2025-003', desc: 'Fire drill records incomplete for Q3', severity: 'Major', assignedTo: 'Jack Sanguinetti', due: '2026-03-15', status: 'Open' },
                { ref: 'NC-2025-002', desc: 'SMS revision acknowledgment pending from 3 crew', severity: 'Minor', assignedTo: 'Nicole Annmarie Collen', due: '2026-02-28', status: 'In Progress' },
                { ref: 'OBS-2025-005', desc: 'Bridge procedure manual formatting inconsistency', severity: 'Observation', assignedTo: 'Juan Norman', due: '2026-04-01', status: 'Open' },
                { ref: 'NC-2024-008', desc: 'Emergency generator test records gap', severity: 'Major', assignedTo: 'Callum Brown', due: '2025-12-01', status: 'Closed' },
                { ref: 'NC-2024-007', desc: 'SOPEP equipment location signage missing', severity: 'Minor', assignedTo: 'Emil Schwarz', due: '2025-11-15', status: 'Closed' },
              ].map((finding, i) => (
                <TableRow key={i} className="border-[#1A2740]">
                  <TableCell className="text-white font-mono text-sm">{finding.ref}</TableCell>
                  <TableCell className="text-white max-w-[300px] truncate">{finding.desc}</TableCell>
                  <TableCell>
                    <Badge className={
                      finding.severity === 'Major' ? 'bg-[#EF4444] text-white' :
                      finding.severity === 'Minor' ? 'bg-[#F59E0B] text-black' :
                      'bg-[#3B82F6] text-white'
                    }>
                      {finding.severity}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-white">{finding.assignedTo}</TableCell>
                  <TableCell className="text-white">{format(new Date(finding.due), 'dd MMM yyyy')}</TableCell>
                  <TableCell>
                    <Badge className={
                      finding.status === 'Closed' ? 'bg-[#22C55E] text-white' :
                      finding.status === 'In Progress' ? 'bg-[#3B82F6] text-white' :
                      'bg-[#F59E0B] text-black'
                    }>
                      {finding.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Evidence Library */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white">Evidence Library</CardTitle>
          <Button size="sm" className="gap-1 bg-[#3B82F6]">
            <Plus className="w-4 h-4" /> Upload Evidence
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { name: 'SMS Manual Rev 8.2', type: 'PDF', date: '15 Jan 2026', size: '2.4 MB' },
              { name: 'DOC Certificate Scan', type: 'PDF', date: '01 Mar 2025', size: '1.1 MB' },
              { name: 'Internal Audit Report Sept 2025', type: 'PDF', date: '25 Sep 2025', size: '3.7 MB' },
              { name: 'External Audit Report Mar 2025', type: 'PDF', date: '20 Mar 2025', size: '5.2 MB' },
              { name: 'Safety Meeting Minutes Feb 2026', type: 'DOCX', date: '10 Feb 2026', size: '0.8 MB' },
              { name: 'Drill Log Q1 2026', type: 'XLSX', date: '01 Feb 2026', size: '0.3 MB' },
            ].map((doc, i) => (
              <div key={i} className="p-3 rounded-lg bg-[#1A2740] flex items-center gap-3 cursor-pointer hover:bg-[#1A2740]/80 transition">
                <FileCheck className="w-8 h-8 text-[#3B82F6] shrink-0" />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-[#94A3B8] text-xs">{doc.type} · {doc.size} · {doc.date}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ISMTab;
