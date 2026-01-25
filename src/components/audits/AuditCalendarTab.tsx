import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAudits } from '@/hooks/useAudits';
import { useCertificates } from '@/hooks/useCertificates';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, isToday } from 'date-fns';
import { cn } from '@/lib/utils';

const AuditCalendarTab: React.FC = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const { audits, reviews } = useAudits();
  const { certificates } = useCertificates();

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get events for a specific day
  const getEventsForDay = (date: Date) => {
    const events: Array<{ type: string; title: string; color: string }> = [];
    
    // Audits
    audits.forEach(audit => {
      if (isSameDay(new Date(audit.scheduled_date), date)) {
        events.push({
          type: 'audit',
          title: `${audit.audit_type} Audit${audit.vessel?.name ? ` - ${audit.vessel.name}` : ''}`,
          color: audit.audit_type === 'Internal' ? 'bg-blue-500' : 'bg-purple-500',
        });
      }
    });

    // Management reviews
    reviews.forEach(review => {
      if (isSameDay(new Date(review.review_date), date)) {
        events.push({
          type: 'review',
          title: `Management Review - ${review.period_covered}`,
          color: 'bg-green-500',
        });
      }
    });

    // Certificate expiries
    certificates.forEach(cert => {
      if (isSameDay(new Date(cert.expiry_date), date)) {
        events.push({
          type: 'certificate',
          title: `${cert.certificate_name} Expires`,
          color: 'bg-red-500',
        });
      }
    });

    return events;
  };

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  // Pad days to start on correct weekday
  const firstDayOfWeek = monthStart.getDay();
  const paddedDays = Array(firstDayOfWeek).fill(null).concat(days);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Audit Calendar</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-lg font-medium min-w-[160px] text-center">
              {format(currentDate, 'MMMM yyyy')}
            </span>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="flex flex-wrap gap-4 mb-4 pb-4 border-b">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm text-muted-foreground">Internal Audit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <span className="text-sm text-muted-foreground">External Audit</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-sm text-muted-foreground">Management Review</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-sm text-muted-foreground">Certificate Expiry</span>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground">
              {day}
            </div>
          ))}
          
          {/* Calendar days */}
          {paddedDays.map((day, index) => {
            if (!day) {
              return <div key={`empty-${index}`} className="bg-card p-2 min-h-[100px]" />;
            }

            const events = getEventsForDay(day);
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isCurrentDay = isToday(day);

            return (
              <div
                key={day.toISOString()}
                className={cn(
                  'bg-card p-2 min-h-[100px] transition-colors hover:bg-muted/50',
                  !isCurrentMonth && 'opacity-50'
                )}
              >
                <div className={cn(
                  'text-sm mb-1',
                  isCurrentDay && 'w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center'
                )}>
                  {format(day, 'd')}
                </div>
                <div className="space-y-1">
                  {events.slice(0, 3).map((event, i) => (
                    <div
                      key={i}
                      className={cn(
                        'text-xs px-1.5 py-0.5 rounded text-white truncate',
                        event.color
                      )}
                      title={event.title}
                    >
                      {event.title}
                    </div>
                  ))}
                  {events.length > 3 && (
                    <div className="text-xs text-muted-foreground px-1">
                      +{events.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default AuditCalendarTab;
