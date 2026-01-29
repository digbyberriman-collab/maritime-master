import React from 'react';
import { Shield, Clock, Building2, FileText, Lock, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface GDPRMapping {
  purpose: string;
  lawfulBasis: 'contractual' | 'legal_obligation' | 'legitimate_interest' | 'consent';
  retentionPeriod: string;
  retentionTrigger: string;
  dataOwner: string;
  sensitiveFields?: string[];
  redactedForAuditors?: boolean;
}

interface GDPRCompliancePanelProps {
  mapping: GDPRMapping;
  recordType: string;
  compact?: boolean;
}

const lawfulBasisLabels: Record<string, { label: string; color: string }> = {
  contractual: { label: 'Contractual Obligation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  legal_obligation: { label: 'Legal Obligation', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300' },
  legitimate_interest: { label: 'Legitimate Interest', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  consent: { label: 'Consent', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
};

const GDPRCompliancePanel: React.FC<GDPRCompliancePanelProps> = ({ mapping, recordType, compact = false }) => {
  const basisInfo = lawfulBasisLabels[mapping.lawfulBasis] || lawfulBasisLabels.legitimate_interest;

  if (compact) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className={basisInfo.color}>
          <Shield className="w-3 h-3 mr-1" />
          {basisInfo.label}
        </Badge>
        <Badge variant="outline" className="bg-muted">
          <Clock className="w-3 h-3 mr-1" />
          {mapping.retentionPeriod}
        </Badge>
        {mapping.redactedForAuditors && (
          <Badge variant="outline" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
            <EyeOff className="w-3 h-3 mr-1" />
            Auditor Restricted
          </Badge>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            GDPR Compliance Information
          </h4>
          <Badge variant="outline" className="text-xs">
            {recordType}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Purpose */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <FileText className="w-3 h-3" />
              Purpose of Processing
            </label>
            <p className="text-sm text-foreground">{mapping.purpose}</p>
          </div>

          {/* Lawful Basis */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Shield className="w-3 h-3" />
              Lawful Basis
            </label>
            <Badge className={`${basisInfo.color} text-xs`}>
              {basisInfo.label}
            </Badge>
          </div>

          {/* Retention */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Retention Period
            </label>
            <p className="text-sm text-foreground">{mapping.retentionPeriod}</p>
            <p className="text-xs text-muted-foreground">After: {mapping.retentionTrigger}</p>
          </div>

          {/* Data Owner */}
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Data Owner
            </label>
            <p className="text-sm text-foreground">{mapping.dataOwner}</p>
          </div>
        </div>

        {/* Sensitive Fields */}
        {mapping.sensitiveFields && mapping.sensitiveFields.length > 0 && (
          <div className="pt-2 border-t border-border">
            <label className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
              <Lock className="w-3 h-3" />
              Field-Level Access Controls
            </label>
            <div className="flex flex-wrap gap-2">
              {mapping.sensitiveFields.map((field) => (
                <Badge key={field} variant="secondary" className="text-xs">
                  <Lock className="w-3 h-3 mr-1" />
                  {field}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Auditor Access */}
        {mapping.redactedForAuditors && (
          <div className="p-2 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-md">
            <p className="text-xs text-red-800 dark:text-red-200 flex items-center gap-1">
              <EyeOff className="w-3 h-3" />
              <strong>Auditor Access:</strong> This data is redacted from auditor views by default.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default GDPRCompliancePanel;
