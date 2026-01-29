import React from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { AlertCircle, Plus, Info } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import ChecklistCard from '@/components/ism/ChecklistCard';

// Checklist data - alphabetically ordered
const emergencyChecklists = [
  'Abandon Ship',
  'Blackout',
  'Collision',
  'Fire at Sea',
  'Fire in Port',
  'Flooding / Damage Control',
  'Grounding',
  'Lithium Ion Battery Fire at Sea',
  'Man Overboard',
  'Pollution',
  'Post Incident (MAJOR EMERGENCY)',
  'Propulsion Failure',
  'Steering Failure',
];

const otherEmergencies = [
  'Bomb Threat / Suspicious Package',
  'Bridge Equipment Failure: GPS / GMDSS / Radar',
  'Crane/Davit Failure During Launch or Recovery',
  'Cyber Attack',
  'Dive Emergency',
  'Enclosed Space Rescue',
  'Helicopter Evacuation',
  'Kidnap / Hostage Incident Ashore',
  'Medical Emergency',
  'Piracy / Suspicious Craft',
  'Receiving Distress Signals and Search & Rescue',
  'Rescue of Persons from Cold Water',
  'Rescue of Refugees and Migrants',
  'Salvage of Own Vessel',
  'Stowaway',
  'Tender Incident',
];

const peopleWelfareIssues = [
  'Aggressive / Intoxicated Person',
  'Contagious Disease Outbreak',
  'Death Onboard',
  'Drugs Onboard',
  'Food Poisoning Outbreak',
  'Mental Health Crisis',
  'Missing Person Ashore',
];

interface ChecklistGridProps {
  items: string[];
}

const ChecklistGrid: React.FC<ChecklistGridProps> = ({ items }) => {
  return (
    <div className="space-y-4">
      {/* Header with count and action */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} checklists
        </p>
        <Button variant="outline" size="sm" disabled>
          <Plus className="w-4 h-4 mr-2" />
          Add Checklist (Coming Soon)
        </Button>
      </div>
      
      {/* Checklist cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((title) => (
          <ChecklistCard key={title} title={title} />
        ))}
      </div>
    </div>
  );
};

const ERMPage: React.FC = () => {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <AlertCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">
                Emergency Response Manual (ERM)
              </h1>
              <p className="text-muted-foreground">
                Emergency procedures, checklists, and response guidance
              </p>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            These checklists are placeholders. Document upload and electronic form functionality coming soon.
          </AlertDescription>
        </Alert>

        {/* Tabbed Content */}
        <Tabs defaultValue="emergency-checklists" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="emergency-checklists">
              Emergency Checklists ({emergencyChecklists.length})
            </TabsTrigger>
            <TabsTrigger value="other-emergencies">
              Other Emergencies ({otherEmergencies.length})
            </TabsTrigger>
            <TabsTrigger value="people-welfare">
              People & Welfare ({peopleWelfareIssues.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="emergency-checklists" className="mt-6">
            <ChecklistGrid items={emergencyChecklists} />
          </TabsContent>
          
          <TabsContent value="other-emergencies" className="mt-6">
            <ChecklistGrid items={otherEmergencies} />
          </TabsContent>
          
          <TabsContent value="people-welfare" className="mt-6">
            <ChecklistGrid items={peopleWelfareIssues} />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default ERMPage;
