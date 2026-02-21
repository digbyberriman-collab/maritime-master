import React from 'react';
import { useDataRetention } from '@/modules/compliance/hooks/useDataRetention';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Archive, 
  Clock, 
  Shield, 
  AlertTriangle,
  FileText,
  Calendar
} from 'lucide-react';
import { HR_GDPR_MAPPING, type HRRecordType } from '@/modules/compliance/types';

const RECORD_TYPE_LABELS: Record<HRRecordType, string> = {
  employment_contract: 'Employment Contracts',
  salary_compensation: 'Salary & Compensation',
  pay_review: 'Pay Reviews',
  annual_review: 'Annual Reviews',
  performance_evaluation: 'Performance Evaluations',
  rotation_catchup: 'End-of-Rotation Catch-Ups',
  disciplinary_minor: 'Disciplinary (Minor)',
  disciplinary_serious: 'Disciplinary (Serious)',
  welfare_note: 'Welfare Notes',
  training_record: 'Training Records',
  leave_record: 'Leave Records',
  medical_record: 'Medical Records',
};

const LAWFUL_BASIS_LABELS: Record<string, string> = {
  consent: 'Consent',
  contractual: 'Contractual Necessity',
  legal_obligation: 'Legal Obligation',
  vital_interests: 'Vital Interests',
  public_task: 'Public Task',
  legitimate_interest: 'Legitimate Interest',
};

export const DataRetentionSettings: React.FC = () => {
  const { 
    retentionPolicies, 
    pendingArchiveRecords, 
    policiesLoading,
    pendingLoading,
    updatePolicy 
  } = useDataRetention();

  if (policiesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">Data Retention & GDPR Compliance</h2>
        <p className="text-muted-foreground mt-1">
          Configure retention periods, GDPR mapping, and archive policies for HR data.
        </p>
      </div>

      {/* Pending Archive Alert */}
      {pendingArchiveRecords && pendingArchiveRecords.length > 0 && (
        <Card className="border-warning bg-warning/5">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-warning">
              <AlertTriangle className="w-5 h-5" />
              Records Pending Archive
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {pendingArchiveRecords.length} records have exceeded their retention period and require action.
            </p>
            <Button variant="outline" className="mt-3" size="sm">
              Review Pending Records
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Retention Policies Grid */}
      <div className="grid gap-4 md:grid-cols-2">
        {retentionPolicies?.map((policy) => {
          const gdprInfo = HR_GDPR_MAPPING[policy.record_type as HRRecordType];
          
          return (
            <Card key={policy.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {RECORD_TYPE_LABELS[policy.record_type as HRRecordType] || policy.record_type}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {gdprInfo?.purpose || 'Data processing purpose'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    <Clock className="w-3 h-3 mr-1" />
                    {policy.retention_years}y
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* GDPR Info */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="text-xs">
                    <Shield className="w-3 h-3 mr-1" />
                    {LAWFUL_BASIS_LABELS[policy.gdpr_lawful_basis] || policy.gdpr_lawful_basis}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    <FileText className="w-3 h-3 mr-1" />
                    {policy.data_owner}
                  </Badge>
                </div>

                {/* Settings */}
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Auto-archive on expiry</span>
                    <Switch
                      checked={policy.auto_archive}
                      onCheckedChange={(checked) => {
                        updatePolicy.mutate({
                          id: policy.id,
                          auto_archive: checked,
                        });
                      }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">DPA approval for deletion</span>
                    <Switch
                      checked={policy.require_dpa_approval_for_deletion}
                      onCheckedChange={(checked) => {
                        updatePolicy.mutate({
                          id: policy.id,
                          require_dpa_approval_for_deletion: checked,
                        });
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* GDPR Rights Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            GDPR Data Subject Rights
          </CardTitle>
          <CardDescription>
            Crew members have the following rights under GDPR
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { title: 'Right of Access', desc: 'Export personal data on request' },
              { title: 'Right to Rectification', desc: 'Correct inaccurate data' },
              { title: 'Right to Erasure', desc: 'Anonymize data after retention' },
              { title: 'Right to Portability', desc: 'Export data in standard format' },
              { title: 'Right to Restriction', desc: 'Limit processing of data' },
              { title: 'Right to Object', desc: 'Object to data processing' },
            ].map((right) => (
              <div key={right.title} className="p-3 rounded-lg bg-muted/50">
                <h4 className="font-medium text-sm">{right.title}</h4>
                <p className="text-xs text-muted-foreground mt-1">{right.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Retention Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            Retention Period Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between py-2 border-b">
              <span className="text-sm font-medium">Category</span>
              <span className="text-sm font-medium">Retention</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Contracts & Employment</span>
              <span className="text-sm">7 years post-termination</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Salaries & Compensation</span>
              <span className="text-sm">7 years after final payment</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Pay Reviews</span>
              <span className="text-sm">5 years</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Annual Reviews & Evaluations</span>
              <span className="text-sm">3-5 years</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">End-of-Rotation Catch-Ups</span>
              <span className="text-sm">2 years</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Disciplinary (Minor)</span>
              <span className="text-sm">2-3 years</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-sm text-muted-foreground">Disciplinary (Serious)</span>
              <span className="text-sm">6-7 years</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DataRetentionSettings;
