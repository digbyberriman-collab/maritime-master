import React from 'react';
import { Ship, Flag, Award, Hash } from 'lucide-react';
import type { DashboardSummary } from '@/modules/dashboard/types';

interface DashboardHeaderProps {
  summary: DashboardSummary | null;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ summary }) => {
  if (!summary) return null;

  const isAllVessels = summary.vessel_id === null;

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10">
        <Ship className="w-6 h-6 text-primary" />
      </div>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {summary.vessel_name}
        </h1>
        {!isAllVessels && (
          <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
            {summary.imo_number && (
              <span className="flex items-center gap-1">
                <Hash className="w-3.5 h-3.5" />
                IMO: {summary.imo_number}
              </span>
            )}
            {summary.flag_state && (
              <span className="flex items-center gap-1">
                <Flag className="w-3.5 h-3.5" />
                {summary.flag_state}
              </span>
            )}
            {summary.classification_society && (
              <span className="flex items-center gap-1">
                <Award className="w-3.5 h-3.5" />
                {summary.classification_society}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
