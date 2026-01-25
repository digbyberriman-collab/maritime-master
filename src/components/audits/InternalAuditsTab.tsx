import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Eye, Edit, FileText } from 'lucide-react';
import { useAudits } from '@/hooks/useAudits';
import { useVessels } from '@/hooks/useVessels';
import { format } from 'date-fns';
import { getAuditStatusBadgeClass } from '@/lib/auditConstants';

interface InternalAuditsTabProps {
  onScheduleAudit: () => void;
}

const InternalAuditsTab: React.FC<InternalAuditsTabProps> = ({ onScheduleAudit }) => {
  const { internalAudits, findings, isLoading } = useAudits();
  const { vessels } = useVessels();
  const [vesselFilter, setVesselFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const filteredAudits = internalAudits.filter(audit => {
    if (vesselFilter !== 'all' && audit.vessel_id !== vesselFilter) return false;
    if (yearFilter !== 'all' && !audit.scheduled_date.startsWith(yearFilter)) return false;
    if (statusFilter !== 'all' && audit.status !== statusFilter) return false;
    return true;
  });

  const getYears = () => {
    const years = new Set(internalAudits.map(a => a.scheduled_date.substring(0, 4)));
    return Array.from(years).sort().reverse();
  };

  const getFindingCounts = (auditId: string) => {
    const auditFindings = findings.filter(f => f.audit_id === auditId);
    return {
      major: auditFindings.filter(f => f.finding_type === 'Major_NC').length,
      minor: auditFindings.filter(f => f.finding_type === 'Minor_NC').length,
      obs: auditFindings.filter(f => f.finding_type === 'Observation').length,
    };
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Internal Audits</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={vesselFilter} onValueChange={setVesselFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Vessels" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Vessels</SelectItem>
                {vessels.map(vessel => (
                  <SelectItem key={vessel.id} value={vessel.id}>{vessel.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={yearFilter} onValueChange={setYearFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="All Years" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Years</SelectItem>
                {getYears().map(year => (
                  <SelectItem key={year} value={year}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Planned">Planned</SelectItem>
                <SelectItem value="In_Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {filteredAudits.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No internal audits found</p>
            <Button onClick={onScheduleAudit}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule First Internal Audit
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Audit #</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Actual Date</TableHead>
                <TableHead>Lead Auditor</TableHead>
                <TableHead>Findings</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAudits.map(audit => {
                const counts = getFindingCounts(audit.id);
                return (
                  <TableRow key={audit.id}>
                    <TableCell className="font-medium">{audit.audit_number}</TableCell>
                    <TableCell>{audit.vessel?.name || 'Company-wide'}</TableCell>
                    <TableCell>{format(new Date(audit.scheduled_date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      {audit.actual_start_date 
                        ? format(new Date(audit.actual_start_date), 'MMM d, yyyy')
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {audit.lead_auditor 
                        ? `${audit.lead_auditor.first_name} ${audit.lead_auditor.last_name}`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {counts.major > 0 && (
                          <Badge variant="destructive" className="text-xs">{counts.major} Major</Badge>
                        )}
                        {counts.minor > 0 && (
                          <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800">{counts.minor} Minor</Badge>
                        )}
                        {counts.obs > 0 && (
                          <Badge variant="secondary" className="text-xs">{counts.obs} Obs</Badge>
                        )}
                        {counts.major === 0 && counts.minor === 0 && counts.obs === 0 && (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getAuditStatusBadgeClass(audit.status)}>
                        {audit.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="icon">
                          <FileText className="w-4 h-4" />
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
  );
};

export default InternalAuditsTab;
