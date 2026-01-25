import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Eye, FileText, Users } from 'lucide-react';
import { useAudits, type ActionItem } from '@/hooks/useAudits';
import { format } from 'date-fns';

interface ManagementReviewsTabProps {
  onScheduleReview: () => void;
}

const ManagementReviewsTab: React.FC<ManagementReviewsTabProps> = ({ onScheduleReview }) => {
  const { reviews, isLoading } = useAudits();

  const getActionItemCounts = (actionItems: unknown) => {
    if (!Array.isArray(actionItems)) return { open: 0, closed: 0 };
    const items = actionItems as ActionItem[];
    return {
      open: items.filter(i => i.status !== 'Closed').length,
      closed: items.filter(i => i.status === 'Closed').length,
    };
  };

  const getAttendeeCount = (attendees: unknown): number => {
    if (Array.isArray(attendees)) return attendees.length;
    return 0;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Management Reviews</CardTitle>
          <Button onClick={onScheduleReview}>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Review
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {reviews.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No management reviews scheduled</p>
            <p className="text-sm text-muted-foreground mb-4">
              ISM Code requires annual management reviews of the Safety Management System
            </p>
            <Button onClick={onScheduleReview}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule First Review
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Review Date</TableHead>
                <TableHead>Period Covered</TableHead>
                <TableHead>Attendees</TableHead>
                <TableHead>Action Items</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Minutes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reviews.map(review => {
                const counts = getActionItemCounts(review.action_items);
                return (
                  <TableRow key={review.id}>
                    <TableCell className="font-medium">
                      {format(new Date(review.review_date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{review.period_covered}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Users className="w-4 h-4 text-muted-foreground" />
                        <span>{getAttendeeCount(review.attendees)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {counts.open > 0 && (
                          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                            {counts.open} Open
                          </Badge>
                        )}
                        {counts.closed > 0 && (
                          <Badge variant="secondary" className="text-xs bg-green-100 text-green-800">
                            {counts.closed} Closed
                          </Badge>
                        )}
                        {counts.open === 0 && counts.closed === 0 && (
                          <span className="text-muted-foreground text-sm">None</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={review.status === 'Completed' ? 'default' : 'secondary'}>
                        {review.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {review.minutes_url ? (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={review.minutes_url} target="_blank" rel="noopener noreferrer">
                            <FileText className="w-4 h-4 mr-1" />
                            View
                          </a>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not uploaded</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default ManagementReviewsTab;
