import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useCrewLeave } from '@/hooks/useCrewLeave';
import { LEAVE_STATUS_CODES, STATUS_CODE_MAP, LEAVE_DEPARTMENTS, type LeaveDepartment } from '@/lib/leaveConstants';
import { getDaysInMonth, format, isWeekend, isToday, getDay } from 'date-fns';
import { 
  ChevronLeft, ChevronRight, Lock, Unlock, Search, Paintbrush, 
  Undo2, Loader2, Info, CalendarDays
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SUMMARY_CODES = ['F', 'Q', 'L', 'T', 'CD', 'M', 'PPL', 'CL', 'N', 'U', 'R'];

export default function LeavePlannerPage() {
  const currentDate = new Date();
  const [year, setYear] = useState(currentDate.getFullYear());
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<LeaveDepartment>('All');
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkCode, setBulkCode] = useState('F');
  const [showLegend, setShowLegend] = useState(false);
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const navigate = useNavigate();

  // Drag-to-fill state
  const dragRef = useRef<{
    active: boolean;
    crewId: string;
    startDay: number;
    currentDay: number;
    code: string;
  } | null>(null);
  const [dragRange, setDragRange] = useState<{ crewId: string; minDay: number; maxDay: number; code: string } | null>(null);

  const { crewLeaveData, loading, isMonthLocked, setEntry, bulkFill, undo, toggleMonthLock, canUndo } = useCrewLeave(year, month);

  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const locked = isMonthLocked(month);

  // Filter crew
  const filteredCrew = useMemo(() => {
    let data = crewLeaveData;
    if (departmentFilter !== 'All') {
      data = data.filter(c => c.department === departmentFilter);
    }
    if (search) {
      const s = search.toLowerCase();
      data = data.filter(c => 
        c.firstName.toLowerCase().includes(s) || 
        c.lastName.toLowerCase().includes(s) ||
        c.position.toLowerCase().includes(s)
      );
    }
    return data;
  }, [crewLeaveData, departmentFilter, search]);

  // Group by department
  const groupedCrew = useMemo(() => {
    const groups: Record<string, typeof filteredCrew> = {};
    filteredCrew.forEach(c => {
      if (!groups[c.department]) groups[c.department] = [];
      groups[c.department].push(c);
    });
    return groups;
  }, [filteredCrew]);

  const navigateMonth = (dir: number) => {
    let newMonth = month + dir;
    let newYear = year;
    if (newMonth < 1) { newMonth = 12; newYear--; }
    if (newMonth > 12) { newMonth = 1; newYear++; }
    setMonth(newMonth);
    setYear(newYear);
  };

  // Drag-to-fill handlers
  const handleMouseDown = useCallback((crewId: string, day: number, existingCode: string | null) => {
    if (locked) return;
    
    const code = bulkMode ? bulkCode : existingCode;
    if (!code && !bulkMode) {
      // No code on cell and not in bulk mode → open popover for single-cell pick
      const dateStr = format(new Date(year, month - 1, day), 'yyyy-MM-dd');
      setActivePopover(`${crewId}-${dateStr}`);
      return;
    }

    // Start drag
    dragRef.current = { active: true, crewId, startDay: day, currentDay: day, code: code || bulkCode };
    setDragRange({ crewId, minDay: day, maxDay: day, code: code || bulkCode });
  }, [locked, bulkMode, bulkCode, year, month]);

  const handleMouseEnter = useCallback((crewId: string, day: number) => {
    if (!dragRef.current?.active || dragRef.current.crewId !== crewId) return;
    dragRef.current.currentDay = day;
    const min = Math.min(dragRef.current.startDay, day);
    const max = Math.max(dragRef.current.startDay, day);
    setDragRange({ crewId, minDay: min, maxDay: max, code: dragRef.current.code });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!dragRef.current?.active) return;
    const { crewId, startDay, currentDay, code } = dragRef.current;
    dragRef.current = null;
    setDragRange(null);

    const min = Math.min(startDay, currentDay);
    const max = Math.max(startDay, currentDay);
    
    if (min === max) {
      // Single cell click with existing code — just set it (already has the code, so this is a no-op unless bulk mode)
      if (bulkMode) {
        const dateStr = format(new Date(year, month - 1, min), 'yyyy-MM-dd');
        setEntry(crewId, dateStr, code);
      }
    } else {
      // Multi-cell drag
      const startDate = format(new Date(year, month - 1, min), 'yyyy-MM-dd');
      const endDate = format(new Date(year, month - 1, max), 'yyyy-MM-dd');
      bulkFill(crewId, startDate, endDate, code);
    }
  }, [bulkMode, year, month, setEntry, bulkFill]);

  // Global mouseup listener for drag
  useEffect(() => {
    const handler = () => handleMouseUp();
    window.addEventListener('mouseup', handler);
    return () => window.removeEventListener('mouseup', handler);
  }, [handleMouseUp]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (canUndo) undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canUndo, undo]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="w-6 h-6" />
              Leave Planner
            </h1>
            <p className="text-sm text-muted-foreground">Crew leave calendar — {year}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate('/crew/leave/requests')}>
            Leave Requests →
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap bg-card border rounded-lg p-3">
          {/* Month Navigation */}
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth(-1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="font-semibold text-sm min-w-[120px] text-center">
              {MONTH_NAMES[month - 1]} {year}
              {locked && <Lock className="w-3 h-3 inline ml-1 text-muted-foreground" />}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigateMonth(1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Department Filter */}
          <Select value={departmentFilter} onValueChange={(v) => setDepartmentFilter(v as LeaveDepartment)}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEAVE_DEPARTMENTS.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-[160px] pl-7 text-xs"
            />
          </div>

          <div className="w-px h-6 bg-border" />

          {/* Bulk Fill */}
          <Button
            variant={bulkMode ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => { setBulkMode(!bulkMode); dragRef.current = null; setDragRange(null); }}
          >
            <Paintbrush className="w-3 h-3 mr-1" />
            Bulk Fill
          </Button>
          {bulkMode && (
            <Select value={bulkCode} onValueChange={setBulkCode}>
              <SelectTrigger className="h-8 w-[80px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEAVE_STATUS_CODES.map(s => (
                  <SelectItem key={s.code} value={s.code}>
                    <span className="flex items-center gap-1.5">
                      <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: s.bgColor, border: `1px solid ${s.color}` }} />
                      {s.code}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <div className="w-px h-6 bg-border" />

          {/* Lock Month */}
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => toggleMonthLock(month)}
          >
            {locked ? <Unlock className="w-3 h-3 mr-1" /> : <Lock className="w-3 h-3 mr-1" />}
            {locked ? 'Unlock' : 'Lock'} Month
          </Button>

          {/* Undo */}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={undo} disabled={!canUndo}>
            <Undo2 className="w-3 h-3 mr-1" />
            Undo
          </Button>

          {/* Legend */}
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowLegend(!showLegend)}>
            <Info className="w-3 h-3 mr-1" />
            Legend
          </Button>
        </div>

        {/* Legend */}
        {showLegend && (
          <div className="flex flex-wrap gap-2 bg-card border rounded-lg p-3">
            {LEAVE_STATUS_CODES.map(s => (
              <div
                key={s.code}
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-md"
                style={{ backgroundColor: s.bgColor, color: s.color }}
              >
                <span className="font-bold">{s.code}</span>
                <span className="text-[10px]">{s.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bulk mode indicator */}
        {bulkMode && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg px-3 py-2 text-xs text-primary">
            Click and drag across cells to fill with <strong>{bulkCode}</strong>. Single click to set one cell.
          </div>
        )}

        {/* Grid */}
        <div className="border rounded-lg overflow-hidden bg-card">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/50">
                  {/* Sticky columns header */}
                  <th className="sticky left-0 z-20 bg-muted/90 backdrop-blur-sm text-left px-2 py-1.5 border-r font-medium min-w-[180px]">
                    Crew Member
                  </th>
                  <th className="sticky left-[180px] z-20 bg-muted/90 backdrop-blur-sm text-left px-2 py-1.5 border-r font-medium min-w-[100px]">
                    Position
                  </th>
                  <th className="sticky left-[280px] z-20 bg-muted/90 backdrop-blur-sm text-right px-2 py-1.5 border-r font-medium min-w-[55px]">
                    Balance
                  </th>
                  {/* Day columns */}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const d = new Date(year, month - 1, i + 1);
                    const weekend = isWeekend(d);
                    const today = isToday(d);
                    return (
                      <th
                        key={i}
                        className={cn(
                          'text-center px-0 py-1 font-normal min-w-[32px] border-l',
                          weekend && 'bg-muted/40',
                          today && 'border-b-2 border-b-primary'
                        )}
                      >
                        <div className="text-[9px] text-muted-foreground">{DAY_NAMES[getDay(d)]}</div>
                        <div className="font-medium">{i + 1}</div>
                      </th>
                    );
                  })}
                  {/* Summary columns */}
                  {SUMMARY_CODES.map(code => (
                    <th
                      key={code}
                      className="text-center px-1 py-1 font-medium border-l min-w-[28px]"
                      style={{ color: STATUS_CODE_MAP[code]?.color }}
                    >
                      {code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(groupedCrew).map(([dept, members]) => (
                  <React.Fragment key={dept}>
                    {/* Department header */}
                    <tr className="bg-muted/30">
                      <td
                        colSpan={3 + daysInMonth + SUMMARY_CODES.length}
                        className="sticky left-0 z-10 px-2 py-1.5 font-semibold text-xs uppercase tracking-wider text-muted-foreground"
                      >
                        {dept} — {members.length} crew
                      </td>
                    </tr>
                    {/* Crew rows */}
                    {members.map(crew => (
                      <tr key={crew.userId} className="hover:bg-muted/20 border-t border-border/50">
                        {/* Name */}
                        <td className="sticky left-0 z-10 bg-card px-2 py-1 border-r whitespace-nowrap font-medium">
                          {crew.lastName}, {crew.firstName}
                        </td>
                        {/* Position */}
                        <td className="sticky left-[180px] z-10 bg-card px-2 py-1 border-r whitespace-nowrap text-muted-foreground">
                          {crew.position}
                        </td>
                        {/* Balance */}
                        <td className={cn(
                          'sticky left-[280px] z-10 bg-card px-2 py-1 border-r text-right font-bold',
                          crew.balance < 0 && 'text-red-600',
                          crew.balance > 40 && 'text-green-600'
                        )}>
                          {crew.balance}
                        </td>
                        {/* Day cells */}
                        {Array.from({ length: daysInMonth }, (_, i) => {
                          const day = i + 1;
                          const dateStr = format(new Date(year, month - 1, day), 'yyyy-MM-dd');
                          const d = new Date(year, month - 1, day);
                          const weekend = isWeekend(d);
                          const today = isToday(d);
                          const code = crew.entries[dateStr];
                          const statusInfo = code ? STATUS_CODE_MAP[code] : null;
                          const cellKey = `${crew.userId}-${dateStr}`;
                          const isDragHighlighted = dragRange && dragRange.crewId === crew.userId && day >= dragRange.minDay && day <= dragRange.maxDay;
                          const dragPreviewInfo = isDragHighlighted ? STATUS_CODE_MAP[dragRange.code] : null;

                          return (
                            <td
                              key={i}
                              className={cn(
                                'text-center border-l cursor-pointer select-none p-0',
                                weekend && !statusInfo && !isDragHighlighted && 'bg-muted/30',
                                today && 'border-b-2 border-b-primary',
                                locked && 'opacity-60 cursor-not-allowed',
                                isDragHighlighted && 'ring-1 ring-inset ring-primary'
                              )}
                              onMouseDown={(e) => { e.preventDefault(); handleMouseDown(crew.userId, day, code); }}
                              onMouseEnter={() => handleMouseEnter(crew.userId, day)}
                            >
                              {activePopover === cellKey && !locked ? (
                                <Popover open onOpenChange={(open) => !open && setActivePopover(null)}>
                                  <PopoverTrigger asChild>
                                    <div
                                      className="w-full h-full min-h-[24px] flex items-center justify-center text-[10px] font-bold"
                                      style={statusInfo ? { backgroundColor: statusInfo.bgColor, color: statusInfo.color } : undefined}
                                    >
                                      {code || ''}
                                    </div>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-48 p-1" align="start" side="bottom">
                                    <div className="grid grid-cols-2 gap-0.5">
                                      {LEAVE_STATUS_CODES.map(s => (
                                        <button
                                          key={s.code}
                                          className="flex items-center gap-1 px-2 py-1.5 text-xs rounded hover:bg-muted text-left w-full"
                                          onClick={() => { setEntry(crew.userId, dateStr, s.code); setActivePopover(null); }}
                                        >
                                          <span
                                            className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold shrink-0"
                                            style={{ backgroundColor: s.bgColor, color: s.color }}
                                          >
                                            {s.code}
                                          </span>
                                          <span className="truncate text-[10px]">{s.label}</span>
                                        </button>
                                      ))}
                                      <button
                                        className="flex items-center gap-1 px-2 py-1.5 text-xs rounded hover:bg-muted text-left w-full col-span-2 border-t mt-0.5 pt-1.5"
                                        onClick={() => { setEntry(crew.userId, dateStr, null); setActivePopover(null); }}
                                      >
                                        <span className="w-4 h-4 rounded-sm bg-muted flex items-center justify-center text-[9px] shrink-0">✕</span>
                                        <span>Clear</span>
                                      </button>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              ) : (
                                <div
                                  className="w-full h-full min-h-[24px] flex items-center justify-center text-[10px] font-bold"
                                  style={isDragHighlighted && dragPreviewInfo
                                    ? { backgroundColor: dragPreviewInfo.bgColor, color: dragPreviewInfo.color }
                                    : statusInfo ? { backgroundColor: statusInfo.bgColor, color: statusInfo.color } : undefined
                                  }
                                >
                                  {isDragHighlighted ? dragRange.code : (code || '')}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        {/* Summary columns */}
                        {SUMMARY_CODES.map(code => (
                          <td
                            key={code}
                            className="text-center border-l text-[10px] font-medium px-0.5"
                            style={{ color: STATUS_CODE_MAP[code]?.color }}
                          >
                            {crew.counts[code] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Month Lock Panel */}
        <div className="bg-card border rounded-lg p-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">Month Lock Status — {year}</p>
          <div className="flex gap-1 flex-wrap">
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              const isLocked = isMonthLocked(m);
              return (
                <Button
                  key={m}
                  variant={isLocked ? 'default' : 'outline'}
                  size="sm"
                  className={cn('h-7 text-[10px] px-2', isLocked && 'bg-muted-foreground')}
                  onClick={() => toggleMonthLock(m)}
                >
                  {isLocked ? <Lock className="w-2.5 h-2.5 mr-0.5" /> : <Unlock className="w-2.5 h-2.5 mr-0.5" />}
                  {name.substring(0, 3)}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
