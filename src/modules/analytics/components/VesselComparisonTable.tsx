import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface VesselData {
  vesselId: string;
  vesselName: string;
  totalIncidents: number;
  injuryRate: number;
  nearMisses: number;
  avgDaysToClose: number;
}

interface VesselComparisonTableProps {
  data: VesselData[];
}

export const VesselComparisonTable: React.FC<VesselComparisonTableProps> = ({ data }) => {
  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No vessel data available for comparison
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => b.totalIncidents - a.totalIncidents);
  const maxIncidents = Math.max(...sorted.map((v) => v.totalIncidents));
  const minIncidents = Math.min(...sorted.map((v) => v.totalIncidents));

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vessel</TableHead>
            <TableHead className="text-right">Total Incidents</TableHead>
            <TableHead className="text-right">Injury Rate</TableHead>
            <TableHead className="text-right">Near Misses</TableHead>
            <TableHead className="text-right">Avg Days to Close</TableHead>
            <TableHead className="text-right">Performance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((vessel, index) => {
            const isBest = vessel.totalIncidents === minIncidents && data.length > 1;
            const isWorst = vessel.totalIncidents === maxIncidents && data.length > 1;

            return (
              <TableRow key={vessel.vesselId}>
                <TableCell className="font-medium">
                  {vessel.vesselName}
                </TableCell>
                <TableCell className="text-right">
                  {vessel.totalIncidents}
                </TableCell>
                <TableCell className="text-right">
                  <span className={cn(
                    vessel.injuryRate > 30 ? "text-destructive" : ""
                  )}>
                    {vessel.injuryRate}%
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  {vessel.nearMisses}
                </TableCell>
                <TableCell className="text-right">
                  {vessel.avgDaysToClose} days
                </TableCell>
                <TableCell className="text-right">
                  {isBest && (
                    <Badge className="bg-success text-success-foreground">Best</Badge>
                  )}
                  {isWorst && (
                    <Badge variant="destructive">Needs Attention</Badge>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
