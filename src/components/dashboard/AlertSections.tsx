import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Clock, 
  ChevronRight,
  FileWarning,
  GraduationCap,
  Siren,
  Shield,
  ClipboardList
} from 'lucide-react';

export interface AlertItem {
  id: string;
  type: string;
  title: string;
  count: number;
  icon: React.ReactNode;
}

interface AlertSectionProps {
  title: string;
  color: 'orange' | 'yellow';
  items: AlertItem[];
  onViewAll: () => void;
}

const colorClasses = {
  orange: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
    headerBg: 'bg-orange-500/10',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-500 text-white',
  },
  yellow: {
    border: 'border-warning/30',
    bg: 'bg-warning/5',
    headerBg: 'bg-warning/10',
    text: 'text-yellow-700 dark:text-yellow-400',
    badge: 'bg-warning text-warning-foreground',
  },
};

export const AlertSection: React.FC<AlertSectionProps> = ({
  title,
  color,
  items,
  onViewAll,
}) => {
  const colors = colorClasses[color];
  const totalCount = items.reduce((sum, item) => sum + item.count, 0);

  return (
    <Card className={`shadow-card ${colors.border} ${colors.bg}`}>
      <CardHeader className={`pb-3 ${colors.headerBg} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 text-sm font-semibold ${colors.text}`}>
            {color === 'orange' ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <Clock className="w-4 h-4" />
            )}
            {title} ({totalCount})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-3">
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className={colors.text}>{item.icon}</span>
                <span>{item.count} {item.title}</span>
              </div>
            </li>
          ))}
        </ul>
        <Button 
          variant="ghost" 
          size="sm" 
          className={`mt-3 w-full ${colors.text} hover:${colors.bg}`}
          onClick={onViewAll}
        >
          View All
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
};

interface AlertSectionsProps {
  orangeAlerts: {
    overdueCAPAs: number;
    overdueTraining: number;
    drillGaps: number;
  };
  yellowAlerts: {
    expiringCerts: number;
    upcomingAudits: number;
    incompleteMeetings: number;
  };
  onNavigate: (path: string) => void;
}

export const AlertSections: React.FC<AlertSectionsProps> = ({
  orangeAlerts,
  yellowAlerts,
  onNavigate,
}) => {
  const orangeItems: AlertItem[] = [
    {
      id: 'capas',
      type: 'capa',
      title: 'Overdue CAPAs',
      count: orangeAlerts.overdueCAPAs,
      icon: <FileWarning className="w-4 h-4" />,
    },
    {
      id: 'training',
      type: 'training',
      title: 'Training overdue',
      count: orangeAlerts.overdueTraining,
      icon: <GraduationCap className="w-4 h-4" />,
    },
    {
      id: 'drills',
      type: 'drill',
      title: 'Drill gaps',
      count: orangeAlerts.drillGaps,
      icon: <Siren className="w-4 h-4" />,
    },
  ].filter(item => item.count > 0);

  const yellowItems: AlertItem[] = [
    {
      id: 'certs',
      type: 'certificate',
      title: 'Certs expiring <30 days',
      count: yellowAlerts.expiringCerts,
      icon: <Shield className="w-4 h-4" />,
    },
    {
      id: 'audits',
      type: 'audit',
      title: 'Upcoming audits',
      count: yellowAlerts.upcomingAudits,
      icon: <ClipboardList className="w-4 h-4" />,
    },
    {
      id: 'meetings',
      type: 'meeting',
      title: 'Incomplete meeting minutes',
      count: yellowAlerts.incompleteMeetings,
      icon: <FileWarning className="w-4 h-4" />,
    },
  ].filter(item => item.count > 0);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {orangeItems.length > 0 && (
        <AlertSection
          title="ORANGE ALERTS"
          color="orange"
          items={orangeItems}
          onViewAll={() => onNavigate('/reports/capa-tracker')}
        />
      )}
      {yellowItems.length > 0 && (
        <AlertSection
          title="YELLOW ALERTS"
          color="yellow"
          items={yellowItems}
          onViewAll={() => onNavigate('/certificates/alerts')}
        />
      )}
    </div>
  );
};

export default AlertSections;
