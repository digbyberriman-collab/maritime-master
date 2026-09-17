import React from 'react';
import { PieChart } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SimpleBarChart } from '@/modules/hris/components/reporting/charts';
import { seriesColor } from '@/modules/hris/components/reporting/chartColors';
import type { MixPoint } from '@/modules/hris/lib/reports';

interface HeadcountBreakdownProps {
  byVessel: MixPoint[];
  byDepartment: MixPoint[];
  byNationality: MixPoint[];
  isLoading?: boolean;
}

const Mix: React.FC<{ data: MixPoint[]; label: string }> = ({ data, label }) => (
  <SimpleBarChart
    data={data.map((d) => ({ name: d.name, count: d.count }))}
    xKey="name"
    layout="vertical"
    series={[{ key: 'count', label, color: seriesColor(0) }]}
    height={Math.max(160, 28 * data.length + 40)}
    emptyMessage="No active crew"
  />
);

/** Active headcount split by vessel, department and nationality (top 8). */
export const HeadcountBreakdown: React.FC<HeadcountBreakdownProps> = ({ byVessel, byDepartment, byNationality, isLoading }) => (
  <Card className="bg-card">
    <CardHeader className="pb-2">
      <CardTitle className="flex items-center gap-2 text-base">
        <PieChart className="h-4 w-4 text-muted-foreground" /> Headcount breakdown
      </CardTitle>
      <CardDescription>Active crew profiles by vessel, department and nationality.</CardDescription>
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
          <Skeleton className="h-6 w-2/3" />
        </div>
      ) : (
        <Tabs defaultValue="vessel">
          <TabsList className="h-8">
            <TabsTrigger value="vessel" className="text-xs">Vessel</TabsTrigger>
            <TabsTrigger value="department" className="text-xs">Department</TabsTrigger>
            <TabsTrigger value="nationality" className="text-xs">Nationality</TabsTrigger>
          </TabsList>
          <TabsContent value="vessel" className="mt-3">
            <Mix data={byVessel} label="Crew" />
          </TabsContent>
          <TabsContent value="department" className="mt-3">
            <Mix data={byDepartment} label="Crew" />
          </TabsContent>
          <TabsContent value="nationality" className="mt-3">
            <Mix data={byNationality} label="Crew" />
          </TabsContent>
        </Tabs>
      )}
    </CardContent>
  </Card>
);

export default HeadcountBreakdown;
