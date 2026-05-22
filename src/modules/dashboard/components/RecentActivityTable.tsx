import React from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useDashboardStore } from '@/modules/dashboard/store/dashboardStore';
import { activityTypeConfig } from '@/modules/dashboard/types';

const moduleFromType = (type: string): string => {
  if (type.startsWith('incident')) return 'Safety';
  if (type.startsWith('certificate')) return 'Certificates';
  if (type.startsWith('crew')) return 'Crew';
  if (type.startsWith('drill')) return 'Safety';
  if (type.startsWith('maintenance') || type.startsWith('defect')) return 'Technical';
  if (type.startsWith('audit') || type.startsWith('nc') || type.startsWith('capa')) return 'Compliance';
  if (type.startsWith('alert')) return 'Alerts';
  if (type.startsWith('form')) return 'Forms';
  if (type.startsWith('document')) return 'Documents';
  if (type.startsWith('task')) return 'Tasks';
  return 'Other';
};

export const RecentActivityTable: React.FC = () => {
  const { recentActivity } = useDashboardStore();

  return (
    <Card className="shadow-card">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Activity className="w-4 h-4 text-primary" />
          Recent Activity
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {recentActivity.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Activity className="w-10 h-10 mb-2 opacity-50" />
            <p className="text-sm font-medium">No recent activity</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px] uppercase text-xs">Module</TableHead>
                <TableHead className="uppercase text-xs">Notification</TableHead>
                <TableHead className="w-[140px] uppercase text-xs text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentActivity.slice(0, 12).map((item) => {
                const cfg = activityTypeConfig[item.activity_type] || { label: item.activity_type, color: 'text-muted-foreground' };
                return (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {moduleFromType(item.activity_type)}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 align-middle ${cfg.color.replace('text-', 'bg-')}`} />
                      <span className="font-medium">{item.title}</span>
                      {item.description && (
                        <span className="text-muted-foreground"> — {item.description}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground text-right whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default RecentActivityTable;