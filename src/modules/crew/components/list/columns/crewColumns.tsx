import React from 'react';
import { format } from 'date-fns';
import type { ColumnDef } from '@tanstack/react-table';
import { Checkbox } from '@/components/ui/checkbox';
import { AvatarNameCell } from '@/modules/crew/components/list/cells/AvatarNameCell';
import { StatusCell } from '@/modules/crew/components/list/cells/StatusCell';
import { CertStatusCell } from '@/modules/crew/components/list/cells/CertStatusCell';
import { MedicalCell } from '@/modules/crew/components/list/cells/MedicalCell';
import { VesselCell } from '@/modules/crew/components/list/cells/VesselCell';
import { ContractEndCell } from '@/modules/crew/components/list/cells/ContractEndCell';
import type { CrewMemberWithStatus } from '@/modules/crew/hooks/useCrewWithComputedStatus';

export interface CrewColumnMeta {
  label: string;
  exportable: boolean;
  hideableByDefault: boolean;
}

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    label?: string;
    exportable?: boolean;
    hideableByDefault?: boolean;
  }
}

const fmtDate = (d?: string | null) => {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : format(dt, 'yyyy-MM-dd');
};

export const buildCrewColumns = (): ColumnDef<CrewMemberWithStatus>[] => [
  {
    id: 'select',
    enableHiding: false,
    enableSorting: false,
    size: 36,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
    meta: { label: 'Select', exportable: false, hideableByDefault: false },
  },
  {
    id: 'name',
    accessorFn: (m) => `${m.first_name ?? ''} ${m.last_name ?? ''}`.trim(),
    header: 'Name',
    cell: ({ row }) => <AvatarNameCell member={row.original} />,
    size: 240,
    enableHiding: false,
    meta: { label: 'Name', exportable: true, hideableByDefault: false },
  },
  {
    id: 'rank',
    accessorKey: 'rank',
    header: 'Rank',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 140,
    meta: { label: 'Rank', exportable: true, hideableByDefault: false },
  },
  {
    id: 'department',
    accessorKey: 'department',
    header: 'Department',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 140,
    meta: { label: 'Department', exportable: true, hideableByDefault: false },
  },
  {
    id: 'vessel',
    accessorFn: (m) => m.current_assignment?.vessel_name ?? '',
    header: 'Vessel',
    cell: ({ row }) => <VesselCell member={row.original} />,
    size: 160,
    meta: { label: 'Vessel', exportable: true, hideableByDefault: false },
  },
  {
    id: 'status',
    accessorFn: (m) => (m.isOnLeave ? 'on_leave' : m.hasAssignment ? 'onboard' : 'unassigned'),
    header: 'Status',
    cell: ({ row }) => <StatusCell member={row.original} />,
    size: 130,
    meta: { label: 'Status', exportable: true, hideableByDefault: false },
  },
  {
    id: 'cert_status',
    accessorKey: 'certStatus',
    header: 'Certs',
    cell: ({ row }) => <CertStatusCell member={row.original} />,
    size: 120,
    sortingFn: (a, b) => {
      const order = { expired: 0, expiring: 1, missing: 2, valid: 3 } as const;
      return order[a.original.certStatus] - order[b.original.certStatus];
    },
    meta: { label: 'Certificates', exportable: true, hideableByDefault: false },
  },
  {
    id: 'medical_status',
    accessorKey: 'medicalStatus',
    header: 'Medical',
    cell: ({ row }) => <MedicalCell member={row.original} />,
    size: 140,
    meta: { label: 'Medical', exportable: true, hideableByDefault: false },
  },
  {
    id: 'contract_end',
    accessorKey: 'contract_end_date',
    header: 'Contract End',
    cell: ({ row }) => <ContractEndCell member={row.original} />,
    size: 140,
    meta: { label: 'Contract End', exportable: true, hideableByDefault: false },
  },
  // Hidden by default below this line
  {
    id: 'nationality',
    accessorKey: 'nationality',
    header: 'Nationality',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 120,
    meta: { label: 'Nationality', exportable: true, hideableByDefault: true },
  },
  {
    id: 'date_of_birth',
    accessorKey: 'date_of_birth',
    header: 'DOB',
    cell: ({ getValue }) => fmtDate(getValue<string | null>()),
    size: 120,
    meta: { label: 'Date of Birth', exportable: true, hideableByDefault: true },
  },
  {
    id: 'cabin',
    accessorKey: 'cabin',
    header: 'Cabin',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 90,
    meta: { label: 'Cabin', exportable: true, hideableByDefault: true },
  },
  {
    id: 'rotation',
    accessorKey: 'rotation',
    header: 'Rotation',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 120,
    meta: { label: 'Rotation', exportable: true, hideableByDefault: true },
  },
  {
    id: 'passport',
    accessorKey: 'passport_number',
    header: 'Passport',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 140,
    meta: { label: 'Passport #', exportable: true, hideableByDefault: true },
  },
  {
    id: 'visa_status',
    accessorKey: 'visa_status',
    header: 'Visa',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 110,
    meta: { label: 'Visa', exportable: true, hideableByDefault: true },
  },
  {
    id: 'email',
    accessorKey: 'email',
    header: 'Email',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 220,
    meta: { label: 'Email', exportable: true, hideableByDefault: true },
  },
  {
    id: 'phone',
    accessorKey: 'phone',
    header: 'Phone',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 140,
    meta: { label: 'Phone', exportable: true, hideableByDefault: true },
  },
  {
    id: 'emergency_contact',
    accessorFn: (m) => m.emergency_contact_name ?? '',
    header: 'Emergency Contact',
    cell: ({ row }) => row.original.emergency_contact_name ?? '—',
    size: 180,
    meta: { label: 'Emergency Contact', exportable: true, hideableByDefault: true },
  },
  {
    id: 'account_status',
    accessorKey: 'account_status',
    header: 'Account',
    cell: ({ getValue }) => (getValue<string | null>() ?? '—'),
    size: 120,
    meta: { label: 'Account Status', exportable: true, hideableByDefault: true },
  },
  {
    id: 'last_login',
    accessorKey: 'last_login_at',
    header: 'Last Login',
    cell: ({ getValue }) => fmtDate(getValue<string | null>()),
    size: 140,
    meta: { label: 'Last Login', exportable: true, hideableByDefault: true },
  },
  {
    id: 'contract_start',
    accessorKey: 'contract_start_date',
    header: 'Contract Start',
    cell: ({ getValue }) => fmtDate(getValue<string | null>()),
    size: 140,
    meta: { label: 'Contract Start', exportable: true, hideableByDefault: true },
  },
];

export const DEFAULT_HIDDEN_COLUMNS = [
  'nationality',
  'date_of_birth',
  'cabin',
  'rotation',
  'passport',
  'visa_status',
  'email',
  'phone',
  'emergency_contact',
  'account_status',
  'last_login',
  'contract_start',
];
