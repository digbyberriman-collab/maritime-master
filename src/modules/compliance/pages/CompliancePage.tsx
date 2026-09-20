import React from 'react';
import { Link } from 'react-router-dom';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Construction, FileText, ClipboardList, ShieldCheck, Award } from 'lucide-react';
import { useVessel } from '@/modules/vessels/contexts/VesselContext';

/**
 * Compliance overview.
 *
 * The ISM / ISPS / MLC / MARPOL tabs that used to live here rendered sample
 * data for one vessel regardless of the selected vessel. Until a real
 * compliance overview exists this page says so and points at the areas
 * that hold real records.
 */
const REAL_AREAS = [
  { to: '/ism/forms/templates', label: 'ISM forms and checklists', icon: ClipboardList },
  { to: '/documents', label: 'Document library and reviews', icon: FileText },
  { to: '/audits', label: 'Audits and management reviews', icon: ShieldCheck },
  { to: '/certificates', label: 'Vessel and crew certificates', icon: Award },
];

const CompliancePage: React.FC = () => {
  const { selectedVessel } = useVessel();

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance</h1>
          <p className="text-muted-foreground">
            ISM, ISPS, MLC and MARPOL overview
            {selectedVessel && <span className="ml-1">— {selectedVessel.name}</span>}
          </p>
        </div>

        <Card className="shadow-card">
          <CardHeader>
            <CardTitle>Compliance overview is not built yet</CardTitle>
            <CardDescription>
              The convention-by-convention view will draw on the records below once it exists. Nothing on this page is sample data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Construction className="w-14 h-14 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">Coming Soon</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {REAL_AREAS.map(({ to, label, icon: Icon }) => (
                <Button key={to} asChild variant="outline" className="justify-start gap-2">
                  <Link to={to}>
                    <Icon className="w-4 h-4" />
                    {label}
                  </Link>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default CompliancePage;
