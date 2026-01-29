import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Shield, Plus, Info, FileText, Calendar, Building2, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// Insurance tab data - alphabetically ordered
const insuranceTabs = [
  {
    id: 'bunker-liability',
    label: 'Bunker Liability',
    description: 'Coverage for bunker oil pollution and fuel-related liabilities',
    fields: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period', 'Premium', 'Deductible'],
    documents: ['Blue Card', 'CLC Certificate', 'Policy Document'],
  },
  {
    id: 'claims-incidents',
    label: 'Claims & Incidents',
    description: 'Insurance claims tracking and incident-related correspondence',
    fields: ['Claim Reference', 'Incident Date', 'Claim Type', 'Status', 'Amount', 'Adjuster'],
    documents: ['Claim Form', 'Incident Report', 'Survey Report', 'Settlement Documents'],
  },
  {
    id: 'crew-employers-liability',
    label: "Crew & Employer's Liability",
    description: 'Coverage for crew injuries, illness, and employer liabilities',
    fields: ['Policy Number', 'Insurer', 'Coverage Limit', 'Crew Count', 'Validity Period', 'Premium'],
    documents: ['Policy Certificate', 'Crew List', 'Medical Coverage Terms'],
  },
  {
    id: 'hull-machinery',
    label: 'Hull & Machinery',
    description: 'Physical damage coverage for vessel hull and machinery',
    fields: ['Policy Number', 'Insurer', 'Insured Value', 'Validity Period', 'Premium', 'Deductible'],
    documents: ['Policy Document', 'Survey Report', 'Valuation Certificate'],
  },
  {
    id: 'pi',
    label: 'P&I (Protection & Indemnity)',
    description: 'Third-party liability coverage through P&I Club membership',
    fields: ['Club Name', 'Entry Number', 'Coverage Class', 'Validity Period', 'Call Premium', 'Deductible'],
    documents: ['Certificate of Entry', 'Blue Card', 'Club Rules'],
  },
  {
    id: 'pollution-liability',
    label: 'Pollution Liability',
    description: 'Environmental pollution and cleanup cost coverage',
    fields: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period', 'Premium', 'Deductible'],
    documents: ['CLC Certificate', 'IOPC Fund Certificate', 'SOPEP Documentation'],
  },
  {
    id: 'war-piracy',
    label: 'War & Piracy',
    description: 'Coverage for war risks, piracy, and terrorism',
    fields: ['Policy Number', 'Insurer', 'Trading Areas', 'Validity Period', 'Premium', 'Exclusions'],
    documents: ['War Risk Certificate', 'Piracy Endorsement', 'Breach of Warranty Terms'],
  },
  {
    id: 'wreck-removal',
    label: 'Wreck Removal',
    description: 'Coverage for wreck removal and related liabilities',
    fields: ['Policy Number', 'Insurer', 'Coverage Limit', 'Validity Period', 'Premium', 'Nairobi Convention'],
    documents: ['WRC Certificate', 'Policy Document', 'Blue Card'],
  },
];

interface InsuranceTabContentProps {
  tab: typeof insuranceTabs[0];
}

const InsuranceTabContent: React.FC<InsuranceTabContentProps> = ({ tab }) => {
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
          Add Policy (Coming Soon)
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
            <h4 className="text-sm font-medium text-foreground mb-3">Policy Details</h4>
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
              {tab.documents.map((doc) => (
                <div key={doc} className="flex items-center justify-between p-3 border border-dashed border-border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">{doc}</span>
                  </div>
                  <Button variant="ghost" size="sm" disabled className="h-7">
                    <Upload className="w-3 h-3 mr-1" />
                    Upload
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Audit Visibility Notice */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-xs text-amber-800 dark:text-amber-200">
              <strong>Audit Visibility:</strong> Policy certificates and validity dates are visible to auditors. 
              Premiums, deductibles, and claims correspondence are hidden.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const InsurancePage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Insurance</h1>
              <p className="text-muted-foreground">
                Vessel insurance policies, certificates, and claims management
              </p>
            </div>
          </div>
        </div>

        {/* Permission Info Banner */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Access Control:</strong> DPA has full access. Captains can view and upload. 
            Crew members have no access. Auditors see certificates only.
          </AlertDescription>
        </Alert>

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
              <InsuranceTabContent tab={tab} />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default InsurancePage;
