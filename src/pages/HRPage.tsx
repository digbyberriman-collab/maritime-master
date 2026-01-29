import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Users, Plus, Info, FileText, Calendar, Shield, Upload, Lock } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// HR tab data - alphabetically ordered
const hrTabs = [
  {
    id: 'annual-evaluations',
    label: 'Annual Evaluations',
    description: 'Formal performance evaluations conducted annually',
    fields: ['Crew Member', 'Evaluation Period', 'Evaluator', 'Overall Rating', 'Date Completed', 'Next Due'],
    retention: '3-5 years',
    gdprBasis: 'Legitimate interest',
  },
  {
    id: 'annual-reviews',
    label: 'Annual Reviews',
    description: 'Annual performance reviews and career development discussions',
    fields: ['Crew Member', 'Review Period', 'Reviewer', 'Development Goals', 'Training Needs', 'Date'],
    retention: '3-5 years',
    gdprBasis: 'Legitimate interest',
  },
  {
    id: 'contracts-employment',
    label: 'Contracts & Employment',
    description: 'Employment contracts, SEAs, and terms of service',
    fields: ['Crew Member', 'Contract Type', 'Start Date', 'End Date', 'Vessel Assignment', 'Status'],
    retention: '7 years post-termination',
    gdprBasis: 'Contractual obligation',
  },
  {
    id: 'disciplinary-matters',
    label: 'Disciplinary Matters',
    description: 'Disciplinary records, warnings, and investigations',
    fields: ['Crew Member', 'Incident Date', 'Category', 'Severity', 'Outcome', 'Expiry Date'],
    retention: '2-7 years (severity dependent)',
    gdprBasis: 'Legal obligation',
  },
  {
    id: 'end-of-rotation',
    label: 'End-of-Rotation Catch-Ups',
    description: 'Informal check-ins at the end of rotation periods',
    fields: ['Crew Member', 'Rotation Period', 'Supervisor', 'Feedback Summary', 'Follow-up Actions', 'Date'],
    retention: '2 years',
    gdprBasis: 'Legitimate interest',
  },
  {
    id: 'pay-reviews',
    label: 'Pay Reviews',
    description: 'Salary review records and compensation adjustments',
    fields: ['Crew Member', 'Review Date', 'Previous Rate', 'New Rate', 'Effective Date', 'Approved By'],
    retention: '5 years',
    gdprBasis: 'Contractual obligation',
  },
  {
    id: 'salaries-compensation',
    label: 'Salaries & Compensation',
    description: 'Current salary structures, allowances, and benefits',
    fields: ['Crew Member', 'Base Salary', 'Currency', 'Allowances', 'Payment Frequency', 'Bank Details'],
    retention: '7 years after final payment',
    gdprBasis: 'Contractual obligation',
  },
];

interface HRTabContentProps {
  tab: typeof hrTabs[0];
}

const HRTabContent: React.FC<HRTabContentProps> = ({ tab }) => {
  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">{tab.label}</h3>
          <p className="text-sm text-muted-foreground">{tab.description}</p>
        </div>
        <Button variant="outline" size="sm" disabled>
          <Plus className="w-4 h-4 mr-2" />
          Add Record (Coming Soon)
        </Button>
      </div>

      {/* GDPR & Retention Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Retention Period</span>
            </div>
            <p className="text-sm font-medium text-foreground">{tab.retention}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">GDPR Lawful Basis</span>
            </div>
            <p className="text-sm font-medium text-foreground">{tab.gdprBasis}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">Data Owner</span>
            </div>
            <p className="text-sm font-medium text-foreground">Company / Management</p>
          </CardContent>
        </Card>
      </div>

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
          {/* Record Fields Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Record Fields</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {tab.fields.map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-xs text-muted-foreground">{field}</label>
                  <div className="h-9 bg-muted rounded-md flex items-center px-3">
                    <span className="text-sm text-muted-foreground">—</span>
                  </div>
                </div>
              ))}
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
            <div className="h-24 bg-muted rounded-md flex items-center justify-center">
              <span className="text-sm text-muted-foreground">No notes added</span>
            </div>
          </div>

          {/* Audit Trail Notice */}
          <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-xs text-blue-800 dark:text-blue-200">
              <strong>Audit Trail:</strong> All changes to HR records are logged with timestamp, user, and previous values for compliance purposes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Access Control Notice */}
      <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-xs text-red-800 dark:text-red-200">
          <strong>Sensitive Data:</strong> This section contains highly sensitive HR data. 
          Access is restricted to DPA and authorized personnel. 
          Auditors have no access by default.
        </p>
      </div>
    </div>
  );
};

const HRPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Human Resources</h1>
              <p className="text-muted-foreground">
                Crew HR records, contracts, evaluations, and compensation
              </p>
            </div>
          </div>
        </div>

        {/* Permission Info Banner */}
        <Alert variant="destructive" className="border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20">
          <Lock className="h-4 w-4" />
          <AlertDescription className="text-red-800 dark:text-red-200">
            <strong>Restricted Access:</strong> DPA has full access. Captains have restricted view/contribution. 
            Crew members have no access. Auditors have no access by default.
          </AlertDescription>
        </Alert>

        {/* GDPR Compliance Notice */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            HR data is processed under GDPR. Records include retention periods, lawful basis, and are subject to data subject access requests.
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
              <HRTabContent tab={tab} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default HRPage;
