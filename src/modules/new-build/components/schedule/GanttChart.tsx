import { useMemo, useRef, useState, useEffect } from "react";
import { parseWeekDate } from "@/modules/new-build/data/appendix11-data";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { format, differenceInDays, addDays, startOfMonth, endOfMonth, eachMonthOfInterval } from "date-fns";

interface GanttItem {
  id: string;
  description: string;
  chapter_name: string;
  chapter_number: number;
  builder_date: Date | null;
  owner_date: Date | null;
  resolved: boolean;
  requirement_title?: string | null;
}

interface GanttChartProps {
  items: GanttItem[];
}

/*
 * Chapter colours come from the chart palette (gap/10 DS18, DS25), never from
 * the status hues: red stays "overdue" and green "done". Twelve chapters share
 * the five category slots in order (the legend names each); a chapter outside
 * the list uses the neutral slot. Bars take the colour inline from the CSS
 * variable, the legend dots use the matching `bg-chart-N` class.
 */
const CHAPTER_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 14, 15, 16] as const;
type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6;
const CHART_DOT: Record<ChartSlot, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
  6: "bg-chart-6",
};
const chapterSlot = (chapter: number): ChartSlot => {
  const index = (CHAPTER_ORDER as readonly number[]).indexOf(chapter);
  return index < 0 ? 6 : (((index % 5) + 1) as ChartSlot);
};
const chapterColor = (chapter: number): string => `hsl(var(--chart-${chapterSlot(chapter)}))`;

export function GanttChart({ items }: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dayWidth, setDayWidth] = useState(3);

  // Find timeline bounds
  const { minDate, maxDate, totalDays, months } = useMemo(() => {
    let min = new Date(2027, 11, 31);
    let max = new Date(2025, 0, 1);
    items.forEach((it) => {
      [it.builder_date, it.owner_date].forEach((d) => {
        if (d) {
          if (d < min) min = d;
          if (d > max) max = d;
        }
      });
    });
    // Add padding
    min = addDays(startOfMonth(min), -14);
    max = addDays(endOfMonth(max), 14);
    const days = differenceInDays(max, min);
    const monthList = eachMonthOfInterval({ start: min, end: max });
    return { minDate: min, maxDate: max, totalDays: days, months: monthList };
  }, [items]);

  const dayToX = (d: Date) => differenceInDays(d, minDate) * dayWidth;
  const ROW_HEIGHT = 28;
  const LABEL_WIDTH = 320;
  const today = new Date();
  const todayX = dayToX(today);

  // Auto-scroll to "today" on mount so users see current items
  useEffect(() => {
    if (containerRef.current && todayX > 0) {
      const scrollTarget = Math.max(0, todayX - 200);
      containerRef.current.scrollLeft = scrollTarget;
    }
  }, [todayX, items.length]);

  const zoom = (dir: number) => setDayWidth((w) => Math.max(1, Math.min(12, w + dir)));

  const getBarColor = (item: GanttItem): string => {
    if (item.resolved) return "hsl(var(--success))";
    const isPast = item.owner_date && item.owner_date < today;
    if (isPast) return "hsl(var(--critical))";
    return chapterColor(item.chapter_number);
  };

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <span className="text-sm font-medium mr-auto">Gantt Chart — Deliverables Schedule</span>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoom(-1)}><ZoomOut className="h-3.5 w-3.5" /></Button>
        <Badge variant="secondary" className="text-xs">{dayWidth}px/day</Badge>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => zoom(1)}><ZoomIn className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDayWidth(3)}><RotateCcw className="h-3.5 w-3.5" /></Button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-3 py-2 border-b bg-muted/20 text-[10px]">
        {CHAPTER_ORDER.map((ch) => {
          const item = items.find((i) => i.chapter_number === ch);
          if (!item) return null;
          return (
            <span key={ch} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${CHART_DOT[chapterSlot(ch)]}`} />
              {item.chapter_name}
            </span>
          );
        })}
        <span className="flex items-center gap-1 ml-auto">
          <span className="w-2 h-2 rounded-full bg-success" /> Done
          <span className="w-2 h-2 rounded-full bg-destructive/60 ml-2" /> Overdue
          <span className="w-px h-3 bg-destructive/60 ml-2" /> Today
        </span>
      </div>

      <div ref={containerRef} className="overflow-auto max-h-[70vh]" style={{ position: "relative" }}>
        <div className="flex" style={{ minWidth: LABEL_WIDTH + totalDays * dayWidth }}>
          {/* Left labels */}
          <div className="sticky left-0 z-20 bg-background border-r shrink-0" style={{ width: LABEL_WIDTH }}>
            {/* Month header placeholder */}
            <div className="h-8 border-b bg-muted/50" />
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-1.5 px-2 border-b text-xs truncate hover:bg-accent/30"
                style={{ height: ROW_HEIGHT }}
              >
                <span
                  className="inline-block w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: chapterColor(it.chapter_number) }}
                />
                <span className="truncate">{it.description}</span>
              </div>
            ))}
          </div>

          {/* Right chart area */}
          <div className="relative flex-1" style={{ width: totalDays * dayWidth }}>
            {/* Month headers */}
            <div className="flex h-8 border-b bg-muted/50 sticky top-0 z-10">
              {months.map((m, i) => {
                const nextMonth = i < months.length - 1 ? months[i + 1] : maxDate;
                const w = differenceInDays(nextMonth, m) * dayWidth;
                return (
                  <div
                    key={m.toISOString()}
                    className="border-r text-[10px] font-medium text-muted-foreground flex items-center px-1 shrink-0"
                    style={{ width: w }}
                  >
                    {format(m, "MMM yyyy")}
                  </div>
                );
              })}
            </div>

            {/* Today line */}
            {todayX > 0 && todayX < totalDays * dayWidth && (
              <div
                className="absolute top-0 bottom-0 w-px z-10"
                style={{ left: todayX, backgroundColor: "rgba(239, 68, 68, 0.6)" }}
              />
            )}

            {/* Rows */}
            {items.map((it) => {
              const bx = it.builder_date ? dayToX(it.builder_date) : null;
              const ox = it.owner_date ? dayToX(it.owner_date) : null;
              const barLeft = bx ?? ox ?? 0;
              const barRight = ox ?? bx ?? 0;
              const barWidth = Math.max(barRight - barLeft, dayWidth * 2);
              const color = getBarColor(it);

              return (
                <div
                  key={it.id}
                  className="border-b relative"
                  style={{ height: ROW_HEIGHT }}
                >
                  {(bx != null || ox != null) && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div
                          className="absolute top-1 rounded-sm cursor-default transition-colors"
                          style={{
                            left: barLeft,
                            width: barWidth,
                            height: ROW_HEIGHT - 8,
                            backgroundColor: color,
                            opacity: 0.7,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs text-xs">
                        <p className="font-medium">{it.description}</p>
                        <p className="text-muted-foreground">{it.chapter_name}</p>
                        {it.builder_date && <p>Builder: {format(it.builder_date, "d MMM yyyy")}</p>}
                        {it.owner_date && <p>Owner decision: {format(it.owner_date, "d MMM yyyy")}</p>}
                        {it.requirement_title && <p className="text-primary">Req: {it.requirement_title}</p>}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
