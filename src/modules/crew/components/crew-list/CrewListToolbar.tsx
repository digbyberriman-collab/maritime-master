import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { CrewDepartmentOption } from '@/modules/crew/lib/crewListModel';

const ALL = '__all__';

interface CrewListToolbarProps {
  departments: readonly CrewDepartmentOption[];
  /** The selected department key, or null for all. */
  department: string | null;
  onDepartmentChange: (key: string | null) => void;
}

/**
 * The crew list's page-level filter next to the search (gap/04 C3): the
 * department, kept in the URL (`dept`). The status filter is the count
 * chips, the sort is the column headers.
 */
export const CrewListToolbar: React.FC<CrewListToolbarProps> = ({ departments, department, onDepartmentChange }) => {
  // A department in the URL that is not on the list (anymore) still shows, so it can be cleared.
  const options = department && !departments.some((d) => d.key === department) ? [...departments, { key: department, label: department }] : departments;
  return (
    <Select value={department ?? ALL} onValueChange={(value) => onDepartmentChange(value === ALL ? null : value)}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Department">
        <SelectValue placeholder="All departments" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All departments</SelectItem>
        {options.map((d) => (
          <SelectItem key={d.key} value={d.key}>
            {d.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default CrewListToolbar;
