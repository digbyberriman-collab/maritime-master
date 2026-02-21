import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Users, FileCheck, Clock, MessageSquare, Download, Plus, Search,
  Columns, Printer,
} from 'lucide-react';
import { format, differenceInDays, addDays } from 'date-fns';
import { CREW_DRAAK } from '@/data/seedData';
import { cn } from '@/lib/utils';

// Column presets
const PRESETS = {
  'port-state': ['name', 'rank', 'nationality', 'dob', 'passport', 'coc', 'medical', 'signOn'],
  'immigration': ['name', 'rank', 'nationality', 'dob', 'passportNumber', 'passportExpiry', 'visa', 'seamansBook'],
  'full': 'all',
  'minimal': ['name', 'rank', 'nationality', 'department'],
} as const;

interface CrewListEntry {
  name: string;
  rank: string;
  department: string;
  nationality: string;
  dob: string;
  passportNumber: string;
  passportExpiry: string;
  seamansBook: string;
  seamansBookExpiry: string;
  cocType: string;
  cocNumber: string;
  cocExpiry: string;
  medicalExpiry: string;
  signOnDate: string;
  currentlyOnboard: boolean;
}

function generateCrewListData(): CrewListEntry[] {
  return CREW_DRAAK.map((crew, i) => {
    const baseYear = 2025;
    const passportExpiry = addDays(new Date(baseYear, (i * 3) % 12, 15), (i * 47) % 730 + 180);
    const medicalExpiry = addDays(new Date(baseYear, (i * 5) % 12, 1), (i * 31) % 365 + 30);
    const cocExpiry = addDays(new Date(baseYear, (i * 7) % 12, 10), (i * 53) % 1095 + 365);
    const signOn = addDays(new Date(2025, (i * 2) % 12, (i * 7) % 28 + 1), 0);

    // Make a few expired/expiring for testing
    const isExpired = i === 12 || i === 28; // Douglas Cullingworth, Darrol John Patterson
    const isExpiring = i === 5 || i === 20; // Oliver Kincart, Charlotte Elizabeth Williams

    return {
      name: crew.name,
      rank: crew.level,
      department: crew.department,
      nationality: crew.nationality || 'British',
      dob: format(new Date(1985 + (i % 15), (i * 3) % 12, (i * 7) % 28 + 1), 'yyyy-MM-dd'),
      passportNumber: `${crew.nationality === 'British' ? 'GB' : crew.nationality?.slice(0, 2).toUpperCase() || 'XX'}${String(500000 + i * 1234).padStart(7, '0')}`,
      passportExpiry: isExpired
        ? format(addDays(new Date(), -30), 'yyyy-MM-dd')
        : format(passportExpiry, 'yyyy-MM-dd'),
      seamansBook: `SB-${String(100000 + i * 567).padStart(6, '0')}`,
      seamansBookExpiry: format(addDays(new Date(), 400 + i * 20), 'yyyy-MM-dd'),
      cocType: crew.department === 'Deck' ? 'Master/OOW' : crew.department === 'Engineering' ? 'Engineer' : 'STCW',
      cocNumber: `KY-CI/${2024 + (i % 3)}/${String(891 + i).padStart(4, '0')}`,
      cocExpiry: isExpiring
        ? format(addDays(new Date(), 15), 'yyyy-MM-dd')
        : format(cocExpiry, 'yyyy-MM-dd'),
      medicalExpiry: isExpiring
        ? format(addDays(new Date(), 20), 'yyyy-MM-dd')
        : isExpired
          ? format(addDays(new Date(), -10), 'yyyy-MM-dd')
          : format(medicalExpiry, 'yyyy-MM-dd'),
      signOnDate: format(signOn, 'yyyy-MM-dd'),
      currentlyOnboard: i < 30, // Most onboard, a few on leave
    };
  });
}

const ALL_COLUMNS = [
  { key: 'name', label: 'Full Name', locked: true },
  { key: 'rank', label: 'Rank / Level', locked: true },
  { key: 'nationality', label: 'Nationality', locked: false },
  { key: 'dob', label: 'Date of Birth', locked: false },
  { key: 'passportNumber', label: 'Passport Number', locked: false },
  { key: 'passportExpiry', label: 'Passport Expiry', locked: false },
  { key: 'seamansBook', label: 'Seaman\'s Book Number', locked: false },
  { key: 'seamansBookExpiry', label: 'Seaman\'s Book Expiry', locked: false },
  { key: 'cocType', label: 'Certificate of Competency', locked: false },
  { key: 'cocNumber', label: 'CoC Number', locked: false },
  { key: 'cocExpiry', label: 'CoC Expiry', locked: false },
  { key: 'medicalExpiry', label: 'Medical Certificate Expiry', locked: false },
  { key: 'signOnDate', label: 'Sign On Date', locked: false },
  { key: 'department', label: 'Department', locked: false },
];

const DEFAULT_VISIBLE = new Set(['name', 'rank', 'nationality', 'dob', 'passportNumber', 'passportExpiry', 'cocType', 'cocNumber', 'cocExpiry', 'medicalExpiry', 'signOnDate', 'department']);

function getExpiryStatus(dateStr: string): 'expired' | 'expiring' | 'valid' {
  const days = differenceInDays(new Date(dateStr), new Date());
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
}

const MLCTab: React.FC = () => {
  const [crewData] = useState<CrewListEntry[]>(generateCrewListData);
  const [showOnboardOnly, setShowOnboardOnly] = useState(true);
  const [visibleCols, setVisibleCols] = useState<Set<string>>(DEFAULT_VISIBLE);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCol, setSortCol] = useState<string>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const filteredCrew = crewData
    .filter(c => showOnboardOnly ? c.currentlyOnboard : true)
    .filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return c.name.toLowerCase().includes(q)
        || c.rank.toLowerCase().includes(q)
        || c.department.toLowerCase().includes(q)
        || c.nationality.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortCol] as string || '';
      const bVal = (b as Record<string, unknown>)[sortCol] as string || '';
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });

  const toggleCol = (key: string) => {
    const col = ALL_COLUMNS.find(c => c.key === key);
    if (col?.locked) return;
    const next = new Set(visibleCols);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setVisibleCols(next);
  };

  const applyPreset = (preset: string) => {
    if (preset === 'full') {
      setVisibleCols(new Set(ALL_COLUMNS.map(c => c.key)));
    } else {
      const cols = PRESETS[preset as keyof typeof PRESETS];
      if (Array.isArray(cols)) {
        const next = new Set(cols);
        next.add('name');
        next.add('rank');
        setVisibleCols(next);
      }
    }
  };

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  const visibleColumns = ALL_COLUMNS.filter(c => visibleCols.has(c.key));

  return (
    <div className="space-y-6">
      {/* Section A - MLC Certificates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="bg-[#111D33] border-[#1A2740]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[#22C55E]" />
              Maritime Labour Certificate
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Number', value: 'CISR-MLC-2025-0345' },
              { label: 'Issue Date', value: '01 Jun 2025' },
              { label: 'Expiry Date', value: '01 Jun 2030' },
              { label: 'Authority', value: 'CISR' },
            ].map((f, i) => (
              <div key={i} className="flex justify-between">
                <span className="text-[#94A3B8] text-sm">{f.label}</span>
                <span className="text-white text-sm">{f.value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center">
              <span className="text-[#94A3B8] text-sm">Status</span>
              <Badge className="bg-[#22C55E] text-white">Valid</Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#111D33] border-[#1A2740]">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <FileCheck className="w-5 h-5 text-[#3B82F6]" />
              DMLC Tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-[#94A3B8] text-sm">DMLC Part I</span>
              <Badge className="bg-[#22C55E] text-white">Current</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94A3B8] text-sm">DMLC Part II</span>
              <Badge className="bg-[#22C55E] text-white">Current</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94A3B8] text-sm">Last Inspection</span>
              <span className="text-white text-sm">15 Nov 2025</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#94A3B8] text-sm">Next Due</span>
              <span className="text-white text-sm">15 Nov 2028</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Section B - Crew List Generator — CRITICAL */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-[#3B82F6]" />
              Crew List
            </CardTitle>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[#94A3B8] text-sm">Onboard only</span>
                <Switch checked={showOnboardOnly} onCheckedChange={setShowOnboardOnly} />
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94A3B8]" />
                <Input
                  placeholder="Search crew..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-8 w-48 bg-[#1A2740] border-[#1A2740] text-white"
                />
              </div>
              {/* Column Toggle */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
                    <Columns className="w-4 h-4" /> Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="bg-[#111D33] border-[#1A2740] w-80 p-4" align="end">
                  <p className="text-white font-semibold text-sm mb-3">Column Visibility</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {ALL_COLUMNS.map(col => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleCols.has(col.key)}
                          onChange={() => toggleCol(col.key)}
                          disabled={col.locked}
                          className="rounded border-[#94A3B8]"
                        />
                        <span className={cn('text-sm', col.locked ? 'text-[#94A3B8]' : 'text-white')}>
                          {col.label}
                          {col.locked && <span className="text-xs text-[#94A3B8] ml-1">(locked)</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-[#1A2740]">
                    <p className="text-xs text-[#94A3B8] mb-2">Quick Presets</p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        { key: 'port-state', label: 'Port State Control' },
                        { key: 'immigration', label: 'Immigration' },
                        { key: 'full', label: 'Full Details' },
                        { key: 'minimal', label: 'Minimal' },
                      ].map(p => (
                        <Button
                          key={p.key}
                          size="sm"
                          variant="outline"
                          onClick={() => applyPreset(p.key)}
                          className="text-xs border-[#1A2740] text-[#94A3B8] hover:text-white"
                        >
                          {p.label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <Button size="sm" className="gap-1 bg-[#3B82F6]">
                <Download className="w-4 h-4" /> Generate Crew List
              </Button>
              <Button size="sm" variant="outline" className="gap-1 border-[#1A2740] text-[#94A3B8]">
                <Printer className="w-4 h-4" /> Print
              </Button>
            </div>
          </div>
          <p className="text-[#94A3B8] text-sm mt-1">
            {filteredCrew.length} crew {showOnboardOnly ? 'onboard' : 'total'} — DRAAK
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-[#1A2740]">
                  {visibleColumns.map(col => (
                    <TableHead
                      key={col.key}
                      className="text-[#94A3B8] cursor-pointer hover:text-white whitespace-nowrap"
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                      {sortCol === col.key && <span className="ml-1">{sortAsc ? '↑' : '↓'}</span>}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCrew.map((crew, i) => {
                  // Determine row highlight
                  const hasExpired = ['passportExpiry', 'cocExpiry', 'medicalExpiry', 'seamansBookExpiry']
                    .some(field => {
                      const val = (crew as Record<string, unknown>)[field] as string;
                      return val && visibleCols.has(field) && getExpiryStatus(val) === 'expired';
                    });
                  const hasExpiring = ['passportExpiry', 'cocExpiry', 'medicalExpiry', 'seamansBookExpiry']
                    .some(field => {
                      const val = (crew as Record<string, unknown>)[field] as string;
                      return val && visibleCols.has(field) && getExpiryStatus(val) === 'expiring';
                    });

                  return (
                    <TableRow
                      key={i}
                      className={cn(
                        'border-[#1A2740] cursor-pointer hover:bg-[#1A2740]/50',
                        hasExpired && 'bg-[#EF4444]/10',
                        !hasExpired && hasExpiring && 'bg-[#F59E0B]/10',
                      )}
                    >
                      {visibleColumns.map(col => {
                        const val = (crew as Record<string, unknown>)[col.key] as string;
                        const isDateCol = col.key.includes('Expiry') || col.key === 'dob' || col.key === 'signOnDate';
                        const isExpiryCol = col.key.includes('Expiry');

                        let displayVal = val;
                        if (isDateCol && val) {
                          try {
                            displayVal = format(new Date(val), 'dd MMM yyyy');
                          } catch { displayVal = val; }
                        }

                        let cellClass = 'text-white';
                        if (isExpiryCol && val) {
                          const status = getExpiryStatus(val);
                          if (status === 'expired') cellClass = 'text-[#EF4444] font-semibold';
                          else if (status === 'expiring') cellClass = 'text-[#F59E0B] font-semibold';
                        }

                        return (
                          <TableCell key={col.key} className={cn(cellClass, 'whitespace-nowrap text-sm')}>
                            {displayVal}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Section C - Working Hours & Rest */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#F59E0B]" />
            Working Hours & Rest
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Compliance Rate</p>
              <p className="text-2xl font-bold text-[#22C55E]">98.5%</p>
              <p className="text-xs text-[#94A3B8]">Last 30 days</p>
            </div>
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Non-Conformances</p>
              <p className="text-2xl font-bold text-[#F59E0B]">2</p>
              <p className="text-xs text-[#94A3B8]">This month</p>
            </div>
            <div className="p-4 rounded-lg bg-[#1A2740]">
              <p className="text-xs text-[#94A3B8]">Records Pending</p>
              <p className="text-2xl font-bold text-white">5</p>
              <p className="text-xs text-[#94A3B8]">Awaiting sign-off</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section D - SEAs */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5 text-[#3B82F6]" />
            Seafarer Employment Agreements
          </CardTitle>
          <Button size="sm" className="gap-1 bg-[#3B82F6]">
            <Plus className="w-4 h-4" /> Add SEA
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="border-[#1A2740]">
                <TableHead className="text-[#94A3B8]">Crew Member</TableHead>
                <TableHead className="text-[#94A3B8]">Start Date</TableHead>
                <TableHead className="text-[#94A3B8]">End Date</TableHead>
                <TableHead className="text-[#94A3B8]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {CREW_DRAAK.slice(0, 8).map((crew, i) => {
                const start = new Date(2025, (i * 2) % 12, 1);
                const end = addDays(start, 365);
                const isExpiring = differenceInDays(end, new Date()) < 60;
                return (
                  <TableRow key={i} className="border-[#1A2740]">
                    <TableCell className="text-white">{crew.name}</TableCell>
                    <TableCell className="text-white">{format(start, 'dd MMM yyyy')}</TableCell>
                    <TableCell className="text-white">{format(end, 'dd MMM yyyy')}</TableCell>
                    <TableCell>
                      <Badge className={isExpiring ? 'bg-[#F59E0B] text-black' : 'bg-[#22C55E] text-white'}>
                        {isExpiring ? 'Expiring' : 'Active'}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Section E - Crew Complaints */}
      <Card className="bg-[#111D33] border-[#1A2740]">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#94A3B8]" />
            Crew Complaints
          </CardTitle>
          <Button size="sm" className="gap-1 bg-[#3B82F6]">
            <Plus className="w-4 h-4" /> Submit Complaint
          </Button>
        </CardHeader>
        <CardContent>
          <div className="p-8 text-center">
            <MessageSquare className="w-12 h-12 text-[#94A3B8]/30 mx-auto mb-3" />
            <p className="text-[#94A3B8]">No active complaints</p>
            <p className="text-xs text-[#94A3B8]/70 mt-1">
              Complaints are confidential and accessible only to Captain, DPA, and HR.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MLCTab;
