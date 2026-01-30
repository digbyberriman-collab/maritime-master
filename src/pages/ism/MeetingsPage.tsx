import React, { useState } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAudits } from '@/hooks/useAudits';
import { 
  Users, 
  Plus, 
  Search, 
  Calendar,
  Clock,
  CheckCircle,
  FileText,
  Eye
} from 'lucide-react';
import { format, isPast, isFuture, addDays } from 'date-fns';
import { cn } from '@/lib/utils';

const MeetingsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  
  // Using management reviews from audits hook
  const { reviews = [], isLoading } = useAudits();

  // Filter reviews based on tab - use review_date instead of scheduled_date
  const upcomingReviews = reviews.filter(r => 
    r.status === 'Scheduled' && isFuture(new Date(r.review_date))
  );
  const pastReviews = reviews.filter(r => 
    r.status === 'Completed' || isPast(new Date(r.review_date))
  );

  const filteredReviews = (activeTab === 'upcoming' ? upcomingReviews : pastReviews)
    .filter(review => 
      searchQuery === '' || 
      review.period_covered?.toLowerCase().includes(searchQuery.toLowerCase())
    );

  // Stats
  const scheduledThisMonth = reviews.filter(r => {
    if (!r.review_date) return false;
    const date = new Date(r.review_date);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length;

  const completedThisYear = reviews.filter(r => {
    if (r.status !== 'Completed') return false;
    return new Date(r.review_date).getFullYear() === new Date().getFullYear();
  }).length;

  const getStatusBadge = (status: string, date?: string) => {
    if (status === 'Completed') {
      return <Badge className="bg-green-500 text-white">Completed</Badge>;
    }
    if (date && isPast(new Date(date))) {
      return <Badge className="bg-red-500 text-white">Overdue</Badge>;
    }
    return <Badge className="bg-blue-500 text-white">Scheduled</Badge>;
  };
  
  // Helper to get attendees count from JSON
  const getAttendeesCount = (attendees: unknown): number => {
    if (Array.isArray(attendees)) return attendees.length;
    return 0;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Users className="w-6 h-6 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Meetings & Reviews</h1>
            </div>
            <p className="text-muted-foreground">
              Safety committee meetings and management reviews
            </p>
          </div>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Schedule Meeting
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
              <Calendar className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{upcomingReviews.length}</div>
              <p className="text-xs text-muted-foreground">Scheduled meetings</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
              <Clock className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{scheduledThisMonth}</div>
              <p className="text-xs text-muted-foreground">Meetings planned</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed This Year</CardTitle>
              <CheckCircle className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{completedThisYear}</div>
              <p className="text-xs text-muted-foreground">Reviews conducted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Records</CardTitle>
              <FileText className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reviews.length}</div>
              <p className="text-xs text-muted-foreground">All meetings</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past Meetings</TabsTrigger>
            </TabsList>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <TabsContent value="upcoming" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-64">
                    <p className="text-muted-foreground">Loading meetings...</p>
                  </div>
                ) : filteredReviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">No upcoming meetings</h3>
                    <p className="text-muted-foreground mb-4">
                      Schedule a safety committee meeting or management review
                    </p>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" />
                      Schedule Meeting
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Meeting Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Attendees</TableHead>
                        <TableHead>Agenda</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviews.map((review) => (
                        <TableRow key={review.id}>
                          <TableCell className="font-medium">
                            {review.period_covered || 'Management Review'}
                          </TableCell>
                          <TableCell>
                            {review.review_date && format(new Date(review.review_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            {getAttendeesCount(review.attendees)} attendees
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {review.period_covered || '-'}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(review.status, review.review_date)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {filteredReviews.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-center">
                    <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-semibold">No past meetings</h3>
                    <p className="text-muted-foreground">
                      Completed meetings will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Meeting Type</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Attendees</TableHead>
                        <TableHead>Minutes</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredReviews.map((review) => (
                        <TableRow key={review.id}>
                          <TableCell className="font-medium">
                            {review.period_covered || 'Management Review'}
                          </TableCell>
                          <TableCell>
                            {review.review_date && format(new Date(review.review_date), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            {getAttendeesCount(review.attendees)} attendees
                          </TableCell>
                          <TableCell>
                            {review.minutes_url ? (
                              <Badge variant="outline">Available</Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {getStatusBadge(review.status, review.review_date)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MeetingsPage;
