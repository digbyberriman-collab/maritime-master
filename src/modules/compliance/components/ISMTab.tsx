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
  if (diffDays < 0) return <Badge variant="destructive">Expired</Badge>;
  if (diffDays <= 90) return <Badge className="bg-warning text-warning-foreground">Expiring</Badge>;
  return <Badge className="bg-success text-success-foreground">Valid</Badge>;
}

const ISMTab: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* SMS Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Safety Management System (SMS)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Document Version</p>
              <p className="text-lg font-bold text-foreground">Rev 8.2</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Approval Date</p>
              <p className="text-lg font-bold text-foreground">15 Jan 2026</p>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <p className="text-xs text-muted-foreground">Next Review</p>
              <p className="text-lg font-bold text-foreground">15 Jan 2027</p>
              <Badge className="bg-success text-success-foreground mt-1">On Schedule</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* DOC & SMC */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-success" />
              Document of Compliance (DOC)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Number</span>
              <span className="text-foreground font-mono text-sm">CISR-DOC-2025-0234</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Issue Date</span>
              <span className="text-foreground text-sm">01 Mar 2025</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Expiry Date</span>
              <span className="text-foreground text-sm">01 Mar 2030</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Issuing Authority</span>
              <span className="text-foreground text-sm">CISR</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status</span>
              {statusBadge('2030-03-01')}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-success" />
              Safety Management Certificate (SMC)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Number</span>
              <span className="text-foreground font-mono text-sm">CISR-SMC-2025-0567</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Issue Date</span>
              <span className="text-foreground text-sm">15 Apr 2025</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Expiry Date</span>
              <span className="text-foreground text-sm">15 Apr 2030</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Issuing Authority</span>
              <span className="text-foreground text-sm">CISR</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status</span>
              {statusBadge('2030-04-15')}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audit Schedule */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Audit Schedule</CardTitle>
          <Button size="sm" variant="outline" className="gap-1">
            <Plus className="w-4 h-4" /> Schedule Audit
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Findings</TableHead>
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
                <TableRow key={i}>
                  <TableCell>{format(new Date(audit.date), 'dd MMM yyyy')}</TableCell>
                  <TableCell>{audit.type}</TableCell>
                  <TableCell>{audit.auditor}</TableCell>
                  <TableCell>
                    <Badge className={audit.status === 'Completed' ? 'bg-success text-success-foreground' : 'bg-primary text-primary-foreground'}>
                      {audit.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{audit.findings}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Findings Tracker */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" />
            Findings Tracker
          </CardTitle>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="gap-1">
              <Download className="w-4 h-4" /> Export
            </Button>
            <Button size="sm" className="gap-1">
              <Plus className="w-4 h-4" /> Add Finding
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ref</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Assigned To</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Status</TableHead>
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
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{finding.ref}</TableCell>
                  <TableCell className="max-w-[300px] truncate">{finding.desc}</TableCell>
                  <TableCell>
                    <Badge className={
                      finding.severity === 'Major' ? 'bg-destructive text-destructive-foreground' :
                      finding.severity === 'Minor' ? 'bg-warning text-warning-foreground' :
                      'bg-primary text-primary-foreground'
                    }>
                      {finding.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>{finding.assignedTo}</TableCell>
                  <TableCell>{format(new Date(finding.due), 'dd MMM yyyy')}</TableCell>
                  <TableCell>
                    <Badge className={
                      finding.status === 'Closed' ? 'bg-success text-success-foreground' :
                      finding.status === 'In Progress' ? 'bg-primary text-primary-foreground' :
                      'bg-warning text-warning-foreground'
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Evidence Library</CardTitle>
          <Button size="sm" className="gap-1">
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
              <div key={i} className="p-3 rounded-lg bg-muted flex items-center gap-3 cursor-pointer hover:bg-muted/80 transition">
                <FileCheck className="w-8 h-8 text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-foreground text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-muted-foreground text-xs">{doc.type} · {doc.size} · {doc.date}</p>
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
