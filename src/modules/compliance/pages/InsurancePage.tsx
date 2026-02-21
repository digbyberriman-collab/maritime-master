import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Umbrella, Plus, Info, FileText, Calendar, Building2, Upload, Eye, EyeOff, Clock, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { AuditModeIndicator, RedactedField } from '@/modules/compliance/components';

// Insurance tab data - alphabetically ordered with audit visibility rules
const insuranceTabs = [
  {
    id: 'bunker-liability',
    label: 'Bunker Liability',
    description: 'Coverage for bunker oil pollution and fuel-related liabilities',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period'],
    hiddenFromAuditor: ['Premium', 'Deductible'],
    documents: { visible: ['Blue Card', 'CLC Certificate'], hidden: ['Policy Document'] },
  },
  {
    id: 'claims-incidents',
    label: 'Claims & Incidents',
    description: 'Insurance claims tracking and incident-related correspondence',
    visibleToAuditor: ['Claim Reference', 'Incident Date', 'Claim Type', 'Status'],
    hiddenFromAuditor: ['Amount', 'Adjuster', 'Settlement Details', 'Correspondence'],
    documents: { visible: ['Claim Form'], hidden: ['Survey Report', 'Settlement Documents'] },
  },
  {
    id: 'crew-employers-liability',
    label: "Crew & Employer's Liability",
    description: 'Coverage for crew injuries, illness, and employer liabilities',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period'],
    hiddenFromAuditor: ['Premium', 'Crew Count Details'],
    documents: { visible: ['Policy Certificate'], hidden: ['Crew List', 'Medical Coverage Terms'] },
  },
  {
    id: 'hull-machinery',
    label: 'Hull & Machinery',
    description: 'Physical damage coverage for vessel hull and machinery',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Insured Value', 'Validity Period'],
    hiddenFromAuditor: ['Premium', 'Deductible'],
    documents: { visible: ['Policy Document', 'Survey Report'], hidden: ['Valuation Certificate'] },
  },
  {
    id: 'pi',
    label: 'P&I',
    description: 'Third-party liability coverage through P&I Club membership',
    visibleToAuditor: ['Club Name', 'Entry Number', 'Coverage Class', 'Validity Period'],
    hiddenFromAuditor: ['Call Premium', 'Deductible'],
    documents: { visible: ['Certificate of Entry', 'Blue Card'], hidden: ['Club Rules'] },
  },
  {
    id: 'pollution-liability',
    label: 'Pollution Liability',
    description: 'Environmental pollution and cleanup cost coverage',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period'],
    hiddenFromAuditor: ['Premium', 'Deductible'],
    documents: { visible: ['CLC Certificate', 'IOPC Fund Certificate'], hidden: ['SOPEP Documentation'] },
  },
  {
    id: 'war-piracy',
    label: 'War & Piracy',
    description: 'Coverage for war risks, piracy, and terrorism',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Trading Areas', 'Validity Period'],
    hiddenFromAuditor: ['Premium', 'Exclusions Details'],
    documents: { visible: ['War Risk Certificate', 'Piracy Endorsement'], hidden: ['Breach of Warranty Terms'] },
  },
  {
    id: 'wreck-removal',
    label: 'Wreck Removal',
    description: 'Coverage for wreck removal and related liabilities',
    visibleToAuditor: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period', 'Nairobi Convention'],
    hiddenFromAuditor: ['Premium'],
    documents: { visible: ['WRC Certificate', 'Blue Card'], hidden: ['Policy Document'] },
  },
];

interface InsuranceTabContentProps {
  tab: typeof insuranceTabs[0];
  isAuditMode: boolean;
}

const InsuranceTabContent: React.FC<InsuranceTabContentProps> = ({ tab, isAuditMode }) => {
  const allFields = [...tab.visibleToAuditor, ...tab.hiddenFromAuditor];
  const allDocs = [...tab.documents.visible, ...tab.documents.hidden];

  return (
    <div className="space-y-6">
      {/* Tab Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-foreground">{tab.label}</h3>
          <p className="text-sm text-muted-foreground">{tab.description}</p>
        </div>
        <Button variant="outline" size="sm" disabled={isAuditMode}>
          <Plus className="w-4 h-4 mr-2" />
          Add Policy {isAuditMode && '(Read-Only)'}
        </Button>
      </div>

      {/* Policy Placeholder Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">No Active Policy</CardTitle>
                <CardDescription>Upload or create a {tab.label.toLowerCase()} policy</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Pending</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Policy Fields Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
              Policy Details
              {isAuditMode && (
                <Badge variant="outline" className="text-xs">
                  <Eye className="w-3 h-3 mr-1" />
                  Audit View
                </Badge>
              )}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {allFields.map((field) => {
                const isHidden = tab.hiddenFromAuditor.includes(field);
                const shouldRedact = isAuditMode && isHidden;
                
                return (
                  <div key={field} className="space-y-1">
                    <label className="text-xs text-muted-foreground flex items-center gap-1">
                      {field}
                      {isHidden && (
                        <EyeOff className="w-3 h-3 text-amber-500" />
                      )}
                    </label>
                    {shouldRedact ? (
                      <RedactedField label={field} reason="Financial data restricted" />
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

          {/* Renewal Tracking Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Renewal Tracking</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Expiry Date</label>
                <div className="h-9 bg-muted rounded-md flex items-center px-3 gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Not set</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Renewal Alert</label>
                <div className="h-9 bg-muted rounded-md flex items-center px-3">
                  <span className="text-sm text-muted-foreground">30 days before</span>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Renewal Status</label>
                <div className="h-9 bg-muted rounded-md flex items-center px-3">
                  <Badge variant="outline" className="text-xs">Not Started</Badge>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Broker Contact</label>
                <div className="h-9 bg-muted rounded-md flex items-center px-3 gap-2">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">—</span>
                </div>
              </div>
            </div>
          </div>

          {/* Documents Placeholder */}
          <div>
            <h4 className="text-sm font-medium text-foreground mb-3">Required Documents</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {allDocs.map((doc) => {
                const isHidden = tab.documents.hidden.includes(doc);
                const shouldRedact = isAuditMode && isHidden;
                
                return (
                  <div 
                    key={doc} 
                    className={`flex items-center justify-between p-3 border rounded-lg ${
                      shouldRedact 
                        ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10' 
                        : 'border-dashed border-border bg-muted/30'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {shouldRedact ? (
                        <EyeOff className="w-4 h-4 text-red-500" />
                      ) : (
                        <FileText className="w-4 h-4 text-muted-foreground" />
                      )}
                      <span className={`text-sm ${shouldRedact ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                        {shouldRedact ? '[Restricted]' : doc}
                      </span>
                    </div>
                    {!shouldRedact && (
                      <Button variant="ghost" size="sm" disabled={isAuditMode} className="h-7">
                        <Upload className="w-3 h-3 mr-1" />
                        Upload
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Audit Visibility Summary */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
              <strong>Audit Visibility Rules:</strong>
            </p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="flex items-center gap-1 text-green-700 dark:text-green-300">
                  <Eye className="w-3 h-3" />
                  Visible to Auditors:
                </p>
                <p className="text-amber-700 dark:text-amber-300 ml-4">
                  {tab.visibleToAuditor.join(', ')}
                </p>
              </div>
              <div>
                <p className="flex items-center gap-1 text-red-700 dark:text-red-300">
                  <EyeOff className="w-3 h-3" />
                  Hidden from Auditors:
                </p>
                <p className="text-amber-700 dark:text-amber-300 ml-4">
                  {tab.hiddenFromAuditor.join(', ')}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const InsurancePage: React.FC = () => {
  const [isAuditMode, setIsAuditMode] = useState(false);
  const [auditExpiry] = useState(() => new Date(Date.now() + 2 * 60 * 60 * 1000)); // 2 hours from now

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Umbrella className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-foreground">Insurance</h1>
              <p className="text-muted-foreground">
                Vessel insurance policies, certificates, and claims management
              </p>
            </div>
            {/* Audit Mode Toggle */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Insurance Audit Mode</span>
              </div>
              <Switch 
                checked={isAuditMode} 
                onCheckedChange={setIsAuditMode}
              />
              {isAuditMode && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Time-bound
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Audit Mode Indicator */}
        {isAuditMode && (
          <AuditModeIndicator
            isActive={true}
            auditorType="insurance"
            expiresAt={auditExpiry}
            visibleFields={['Policy Type', 'Insurer', 'Validity Dates', 'Certificates']}
            hiddenFields={['Premiums', 'Deductibles', 'Claims Correspondence', 'Financial Settlements']}
          />
        )}

        {/* Permission Info Banner */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Access Control:</strong> DPA has full access. Captains can view and upload. 
            Crew members have no access. Auditors see certificates and validity only (premiums/deductibles hidden).
          </AlertDescription>
        </Alert>

        {/* Audit Logging Notice */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <p className="text-xs text-blue-800 dark:text-blue-200 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            <strong>Compliance:</strong> All access to insurance data is logged. 
            No hard deletes permitted. Changes tracked with full audit trail.
          </p>
        </div>

        {/* Tabbed Content */}
        <Tabs defaultValue="bunker-liability" className="w-full">
          <TabsList className="grid w-full grid-cols-4 lg:grid-cols-8 h-auto">
            {insuranceTabs.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id} className="text-xs px-2 py-2">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          
          {insuranceTabs.map((tab) => (
            <TabsContent key={tab.id} value={tab.id} className="mt-6">
              <InsuranceTabContent tab={tab} isAuditMode={isAuditMode} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default InsurancePage;
