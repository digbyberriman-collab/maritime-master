import React from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { badgeToneClass } from '@/modules/health/lib/format';
import { bookingStatusLabel, bookingStatusTone } from '@/modules/health/hooks/useSpa';

interface BookingStatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export const BookingStatusBadge: React.FC<BookingStatusBadgeProps> = ({ status, className }) => (
  <Badge
    variant="outline"
    className={cn('text-[10px] font-medium', badgeToneClass[bookingStatusTone[status ?? ''] ?? 'default'], className)}
  >
    {bookingStatusLabel(status)}
  </Badge>
);

export default BookingStatusBadge;
