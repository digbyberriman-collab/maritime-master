import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, Edit } from 'lucide-react';
import { useAudits } from '@/hooks/useAudits';
import { format } from 'date-fns';
import { getAuditStatusBadgeClass, AUDIT_TYPES } from '@/lib/auditConstants';

interface ExternalAuditsTabProps {
  onScheduleAudit: () => void;
}

const ExternalAuditsTab: React.FC<ExternalAuditsTabProps> = ({ onScheduleAudit }) => {
  const { externalAudits, isLoading } = useAudits();

  const getAuditTypeLabel = (type: string) => {
    const typeConfig = AUDIT_TYPES.find(t => t.value === type);
    return typeConfig?.label || type;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>External Audits (DOC/SMC)</CardTitle>
          <Button onClick={onScheduleAudit}>
            <Plus className="w-4 h-4 mr-2" />
            Add External Audit
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {externalAudits.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No external audits scheduled</p>
            <p className="text-sm text-muted-foreground mb-4">
              External audits are automatically created 90 days before DOC/SMC expiry dates
            </p>
            <Button onClick={onScheduleAudit}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule External Audit
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Audit Type</TableHead>
                <TableHead>Certificate</TableHead>
                <TableHead>Vessel</TableHead>
                <TableHead>Scheduled Date</TableHead>
                <TableHead>Auditing Organization</TableHead>
                <TableHead>Auditor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {externalAudits.map(audit => (
                <TableRow key={audit.id}>
                  <TableCell className="font-medium">{getAuditTypeLabel(audit.audit_type)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {audit.vessel_id ? 'SMC' : 'DOC'}
                    </Badge>
                  </TableCell>
                  <TableCell>{audit.vessel?.name || 'Company'}</TableCell>
                  <TableCell>{format(new Date(audit.scheduled_date), 'MMM d, yyyy')}</TableCell>
                  <TableCell>{audit.external_auditor_org || '-'}</TableCell>
                  <TableCell>{audit.external_auditor_name || 'TBD'}</TableCell>
                  <TableCell>
                    <Badge className={getAuditStatusBadgeClass(audit.status)}>
                      {audit.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {audit.overall_result ? (
                      <Badge variant={audit.overall_result === 'Satisfactory' ? 'default' : 'secondary'}>
                        {audit.overall_result.replace(/_/g, ' ')}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <Edit className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ExternalAuditsTab;
