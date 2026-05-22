import React from 'react';
import { Download, FileText, FileSpreadsheet, FileType } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { exportCrewToCSV, exportCrewToExcel, exportCrewToPDF, type ExportScope } from '@/modules/crew/lib/crewExport';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

interface CrewExportMenuProps {
  all: CrewMemberWithStatus[];
  filtered: CrewMemberWithStatus[];
  selected: CrewMemberWithStatus[];
}

export const CrewExportMenu: React.FC<CrewExportMenuProps> = ({ all, filtered, selected }) => {
  const { profile } = useAuth();
  const companyName = (profile as unknown as { company?: { name?: string } } | null)?.company?.name;

  const handle = async (format: 'csv' | 'xlsx' | 'pdf', scope: ExportScope) => {
    const rows = scope === 'all' ? all : scope === 'selected' ? selected : filtered;
    if (rows.length === 0) return;
    if (format === 'csv') exportCrewToCSV(rows, scope);
    else if (format === 'xlsx') await exportCrewToExcel(rows, scope);
    else await exportCrewToPDF(rows, scope, { companyName });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="h-4 w-4" /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Export filtered ({filtered.length})</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => handle('csv', 'filtered')}>
          <FileText className="mr-2 h-4 w-4" /> CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle('xlsx', 'filtered')}>
          <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle('pdf', 'filtered')}>
          <FileType className="mr-2 h-4 w-4" /> PDF
        </DropdownMenuItem>
        {selected.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Export selected ({selected.length})</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => handle('csv', 'selected')}>
              <FileText className="mr-2 h-4 w-4" /> CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handle('xlsx', 'selected')}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handle('pdf', 'selected')}>
              <FileType className="mr-2 h-4 w-4" /> PDF
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handle('csv', 'all')}>
          <FileText className="mr-2 h-4 w-4" /> All crew (CSV)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
