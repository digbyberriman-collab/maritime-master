import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Users, Plus, Info, FileText, Calendar, Shield, Upload, Lock, Download, UserX } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GDPRCompliancePanel, RetentionStatusBadge, RedactedField } from '@/components/compliance';
import type { GDPRMapping } from '@/components/compliance';

// HR tab data with GDPR compliance mapping - alphabetically ordered
const hrTabs: Array<{
  id: string;
  label: string;
  description: string;
  fields: string[];
  sensitiveFields: string[];
  gdpr: GDPRMapping;
}> = [
  {
    id: 'annual-evaluations',
    label: 'Annual Evaluations',
    description: 'Formal performance evaluations conducted annually',
    fields: ['Crew Member', 'Evaluation Period', 'Evaluator', 'Overall Rating', 'Date Completed', 'Next Due'],
    sensitiveFields: ['Overall Rating', 'Evaluator Comments', 'Development Areas'],
    gdpr: {
      purpose: 'Performance management and career development tracking',
      lawfulBasis: 'legitimate_interest',
      retentionPeriod: '3-5 years',
      retentionTrigger: 'evaluation date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['Overall Rating', 'Evaluator Comments'],
      redactedForAuditors: true,
    },
  },
  {
    id: 'annual-reviews',
    label: 'Annual Reviews',
    description: 'Annual performance reviews and career development discussions',
    fields: ['Crew Member', 'Review Period', 'Reviewer', 'Development Goals', 'Training Needs', 'Date'],
    sensitiveFields: ['Development Goals', 'Training Needs', 'Career Aspirations'],
    gdpr: {
      purpose: 'Performance management and professional development',
      lawfulBasis: 'legitimate_interest',
      retentionPeriod: '3-5 years',
      retentionTrigger: 'review date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['Performance Scores', 'Development Goals'],
      redactedForAuditors: true,
    },
  },
  {
    id: 'contracts-employment',
    label: 'Contracts & Employment',
    description: 'Employment contracts, SEAs, and terms of service',
    fields: ['Crew Member', 'Contract Type', 'Start Date', 'End Date', 'Vessel Assignment', 'Status'],
    sensitiveFields: ['Contract Terms', 'Special Clauses', 'Termination Conditions'],
    gdpr: {
      purpose: 'Legal compliance and employment record keeping',
      lawfulBasis: 'legal_obligation',
      retentionPeriod: '7 years',
      retentionTrigger: 'termination date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['Contract Terms', 'Salary Details'],
      redactedForAuditors: false, // Contract existence can be confirmed
    },
  },
  {
    id: 'disciplinary-matters',
    label: 'Disciplinary Matters',
    description: 'Disciplinary records, warnings, and investigations',
    fields: ['Crew Member', 'Incident Date', 'Category', 'Severity', 'Outcome', 'Expiry Date'],
    sensitiveFields: ['Incident Details', 'Investigation Notes', 'Witness Statements', 'Outcome Details'],
    gdpr: {
      purpose: 'Workplace conduct management and safety compliance',
      lawfulBasis: 'legal_obligation',
      retentionPeriod: '2-7 years (severity dependent)',
      retentionTrigger: 'incident date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['All Fields'],
      redactedForAuditors: true,
    },
  },
  {
    id: 'end-of-rotation',
    label: 'End-of-Rotation Catch-Ups',
    description: 'Informal check-ins at the end of rotation periods',
    fields: ['Crew Member', 'Rotation Period', 'Supervisor', 'Feedback Summary', 'Follow-up Actions', 'Date'],
    sensitiveFields: ['Feedback Summary', 'Welfare Concerns', 'Personal Notes'],
    gdpr: {
      purpose: 'Crew welfare support and management',
      lawfulBasis: 'legitimate_interest',
      retentionPeriod: '2 years',
      retentionTrigger: 'rotation end date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['Welfare Notes', 'Personal Concerns'],
      redactedForAuditors: true,
    },
  },
  {
    id: 'pay-reviews',
    label: 'Pay Reviews',
    description: 'Salary review records and compensation adjustments',
    fields: ['Crew Member', 'Review Date', 'Previous Rate', 'New Rate', 'Effective Date', 'Approved By'],
    sensitiveFields: ['Previous Rate', 'New Rate', 'Justification', 'Comparator Data'],
    gdpr: {
      purpose: 'Compensation management and audit trail',
      lawfulBasis: 'contractual',
      retentionPeriod: '5 years',
      retentionTrigger: 'review date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['Salary Amounts', 'Justification'],
      redactedForAuditors: true,
    },
  },
  {
    id: 'salaries-compensation',
    label: 'Salaries & Compensation',
    description: 'Current salary structures, allowances, and benefits',
    fields: ['Crew Member', 'Base Salary', 'Currency', 'Allowances', 'Payment Frequency', 'Bank Details'],
    sensitiveFields: ['Base Salary', 'Allowances', 'Bank Details', 'Tax Information'],
    gdpr: {
      purpose: 'Payroll processing and tax compliance',
      lawfulBasis: 'contractual',
      retentionPeriod: '7 years',
      retentionTrigger: 'last payment date',
      dataOwner: 'Company / Management',
      sensitiveFields: ['All Financial Fields', 'Bank Details'],
      redactedForAuditors: true,
    },
  },
];

interface HRTabContentProps {
  tab: typeof hrTabs[0];
  isAuditMode?: boolean;
}

const HRTabContent: React.FC<HRTabContentProps> = ({ tab, isAuditMode = false }) => {
  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">{tab.label}</h3>
          <p className="text-sm text-muted-foreground">{tab.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <RetentionStatusBadge 
            status="active" 
            retentionPeriod={tab.gdpr.retentionPeriod}
          />
          <Button variant="outline" size="sm" disabled>
            <Plus className="w-4 h-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {/* GDPR Compliance Panel */}
      <GDPRCompliancePanel 
        mapping={tab.gdpr} 
        recordType={tab.label}
      />

      {/* Records Placeholder Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">No Records</CardTitle>
                <CardDescription>HR records for {tab.label.toLowerCase()} will appear here</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">0 Records</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Record Fields - Show redacted if audit mode and sensitive */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Record Fields</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {tab.fields.map((field) => {
                const isSensitive = tab.sensitiveFields.includes(field);
                const shouldRedact = isAuditMode && isSensitive;
                
                return (
                  <div key={field} className="space-y-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      {field}
                      {isSensitive && <Lock className="w-3 h-3 text-amber-500" />}
                    </label>
                    {shouldRedact ? (
                      <RedactedField label={field} reason="Auditor restricted" />
                    ) : (
                      <div className="h-9 bg-muted rounded-md flex items-center px-3">
                        <span className="text-sm text-muted-foreground">—</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Document Attachments Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Supporting Documents</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Document attachment</span>
                </div>
                <Button variant="ghost" size="sm" disabled className="h-7">
                  <Upload className="w-3 h-3 mr-1" />
                  Upload
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Notes & comments</span>
                </div>
                <Button variant="ghost" size="sm" disabled className="h-7">
                  <Plus className="w-3 h-3 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>

          {/* Notes Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Notes</h4>
            {isAuditMode && tab.gdpr.redactedForAuditors ? (
              <RedactedField label="Notes" reason="Content hidden from auditors" className="h-24" />
            ) : (
              <div className="h-24 bg-muted rounded-md flex items-center justify-center">
                <span className="text-sm text-muted-foreground">No notes added</span>
              </div>
            )}
          </div>

          {/* Audit Trail Notice */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Audit Trail:</strong> All changes to HR records are logged with timestamp, user, and previous values. 
              Versioning is enabled for compliance.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const HRPage: React.FC = () => {
  // In production, this would come from context/hook
  const isAuditMode = false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-foreground">Human Resources</h1>
              <p className="text-muted-foreground">
                Crew HR records, contracts, evaluations, and compensation
              </p>
            </div>
            {/* DPA Actions */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled>
                <Download className="w-4 h-4 mr-2" />
                Export Data (GDPR)
              </Button>
              <Button variant="outline" size="sm" disabled>
                <UserX className="w-4 h-4 mr-2" />
                Anonymise Expired
              </Button>
            </div>
          </div>
        </div>

        {/* Permission Info Banner */}
        <Alert variant="destructive" className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <Lock className="h-4 w-4" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Restricted Access:</strong> DPA has full access. Captains have restricted view/contribution. 
            Crew members have no access. <strong>Auditors have NO HR access by default.</strong>
          </AlertDescription>
        </Alert>

        {/* GDPR & Retention Overview */}
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <div className="flex items-center justify-between">
              <span>
                HR data is processed under GDPR with defined retention periods. Records are archived (not deleted) after expiry.
                Only DPA can approve data deletion.
              </span>
              <Badge variant="outline" className="ml-4">
                <Calendar className="w-3 h-3 mr-1" />
                Retention Tracking Active
              </Badge>
            </div>
          </AlertDescription>
        </Alert>

        {/* Tabbed Content */}
        <Tabs defaultValue="annual-evaluations" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-7 h-auto">
            {hrTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs px-2 py-2">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {hrTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <HRTabContent tab={tab} isAuditMode={isAuditMode} />
            </TabsContent>
          ))}
        </Tabs>

        {/* Data Retention Footer */}
        <div className="p-4 bg-muted/30 border border-border rounded-lg">
          <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Data Retention Summary
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-muted-foreground">Contracts & Employment</p>
              <p className="font-medium">7 years post-termination</p>
            </div>
            <div>
              <p className="text-muted-foreground">Salaries & Compensation</p>
              <p className="font-medium">7 years after final payment</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reviews & Evaluations</p>
              <p className="font-medium">3-5 years</p>
            </div>
            <div>
              <p className="text-muted-foreground">Disciplinary (Serious)</p>
              <p className="font-medium">6-7 years</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default HRPage;
