import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  AlertCircle, 
  AlertTriangle, 
  Clock, 
  CheckCircle2,
  Users,
  Ship
} from 'lucide-react';

interface KPITile {
  id: string;
  label: string;
  value: number;
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple';
  icon: React.ReactNode;
  description?: string;
  onClick?: () => void;
}

interface AlertKPITilesProps {
  redAlerts: number;
  orangeAlerts: number;
  yellowAlerts: number;
  greenItems: number;
  activeCrew: number;
  activeVessels: number;
  onTileClick?: (type: string) => void;
}

const colorClasses = {
  red: {
    bg: 'bg-destructive/10 hover:bg-destructive/20',
    border: 'border-destructive/30',
    text: 'text-destructive',
    badge: 'bg-destructive text-destructive-foreground',
    pulse: 'animate-pulse',
  },
  orange: {
    bg: 'bg-orange-500/10 hover:bg-orange-500/20',
    border: 'border-orange-500/30',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-500 text-white',
    pulse: '',
  },
  yellow: {
    bg: 'bg-warning/10 hover:bg-warning/20',
    border: 'border-warning/30',
    text: 'text-warning-foreground dark:text-yellow-400',
    badge: 'bg-warning text-warning-foreground',
    pulse: '',
  },
  green: {
    bg: 'bg-success/10 hover:bg-success/20',
    border: 'border-success/30',
    text: 'text-success dark:text-green-400',
    badge: 'bg-success text-success-foreground',
    pulse: '',
  },
  blue: {
    bg: 'bg-primary/10 hover:bg-primary/20',
    border: 'border-primary/30',
    text: 'text-primary',
    badge: 'bg-primary text-primary-foreground',
    pulse: '',
  },
  purple: {
    bg: 'bg-purple-500/10 hover:bg-purple-500/20',
    border: 'border-purple-500/30',
    text: 'text-purple-600 dark:text-purple-400',
    badge: 'bg-purple-500 text-white',
    pulse: '',
  },
};

export const AlertKPITiles: React.FC<AlertKPITilesProps> = ({
  redAlerts,
  orangeAlerts,
  yellowAlerts,
  greenItems,
  activeCrew,
  activeVessels,
  onTileClick,
}) => {
  const tiles: KPITile[] = [
    {
      id: 'red',
      label: 'RED',
      value: redAlerts,
      color: 'red',
      icon: <AlertCircle className="w-5 h-5" />,
      description: 'Urgent Actions',
    },
    {
      id: 'orange',
      label: 'ORANGE',
      value: orangeAlerts,
      color: 'orange',
      icon: <AlertTriangle className="w-5 h-5" />,
      description: 'Overdue Items',
    },
    {
      id: 'yellow',
      label: 'YELLOW',
      value: yellowAlerts,
      color: 'yellow',
      icon: <Clock className="w-5 h-5" />,
      description: 'Upcoming Deadlines',
    },
    {
      id: 'green',
      label: 'GREEN',
      value: greenItems,
      color: 'green',
      icon: <CheckCircle2 className="w-5 h-5" />,
      description: 'Compliant Items',
    },
    {
      id: 'crew',
      label: 'CREW',
      value: activeCrew,
      color: 'blue',
      icon: <Users className="w-5 h-5" />,
      description: 'Active Members',
    },
    {
      id: 'vessels',
      label: 'VSSL',
      value: activeVessels,
      color: 'purple',
      icon: <Ship className="w-5 h-5" />,
      description: 'Fleet Size',
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {tiles.map((tile) => {
        const colors = colorClasses[tile.color];
        return (
          <Card
            key={tile.id}
            className={cn(
              'relative cursor-pointer transition-all duration-200 border-2',
              colors.bg,
              colors.border,
              tile.value > 0 && tile.color === 'red' && colors.pulse
            )}
            onClick={() => onTileClick?.(tile.id)}
          >
            <div className="p-4 text-center">
              <div className={cn('flex items-center justify-center gap-2 mb-2', colors.text)}>
                {tile.icon}
              </div>
              <div className={cn('text-3xl font-bold mb-1', colors.text)}>
                {tile.value}
              </div>
              <Badge className={cn('text-xs', colors.badge)}>
                {tile.label}
              </Badge>
              {tile.description && (
                <p className="text-xs text-muted-foreground mt-2">{tile.description}</p>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default AlertKPITiles;
