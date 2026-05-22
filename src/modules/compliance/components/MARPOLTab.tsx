import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Droplets, Trash2, FileText, Anchor, BookOpen } from 'lucide-react';

const SECTIONS = [
  {
    title: 'Delivery Notes & Bunker Receipts',
    description: 'Fuel oil delivery notes and bunker receipts (MARPOL Annex VI).',
    icon: Droplets,
  },
  {
    title: 'Garbage Management Plan',
    description: 'Onboard garbage management plan and procedures (Annex V).',
    icon: BookOpen,
  },
  {
    title: 'Garbage Receipts',
    description: 'Records of garbage discharged to port reception facilities.',
    icon: Trash2,
  },
  {
    title: 'Port Reception Facilities',
    description: 'Reference list of reception facilities at ports of call.',
    icon: Anchor,
  },
  {
    title: 'SOPEP Manual',
    description: 'Shipboard Oil Pollution Emergency Plan (Annex I).',
    icon: FileText,
  },
];

const MARPOLTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Droplets className="w-5 h-5 text-primary" />
                MARPOL Compliance
              </CardTitle>
              <CardDescription className="mt-1">
                International Convention for the Prevention of Pollution from Ships
              </CardDescription>
            </div>
            <Badge variant="secondary">Coming Soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <div
                  key={s.title}
                  className="p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-md bg-primary/10">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground text-sm">{s.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MARPOLTab;