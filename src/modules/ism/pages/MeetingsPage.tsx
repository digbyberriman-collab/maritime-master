import React, { useState } from 'react';
import DashboardLayout from '@/shared/components/layout/DashboardLayout';
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
import { useAudits } from '@/modules/audits/hooks/useAudits';
import { PageHeader } from '@/shared/components/common/PageHeader';
import { StatCard, StatGrid } from '@/shared/components/common/StatCard';
import {
  Users,
  Plus,
  Search,
  Calendar,
  Clock,
  CheckCircle,
  FileText,
  Eye,
  Download,
  Upload,
  History
} from 'lucide-react';
import { format, isPast, isFuture } from 'date-fns';

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
        <PageHeader
          icon={<Users className="w-6 h-6" />}
          title="Meetings & Reviews"
          description="Safety committee meetings and management reviews"
          actions={
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Meeting
            </Button>
          }
        />

        <StatGrid cols={4}>
          <StatCard
            label="Upcoming"
            value={upcomingReviews.length}
            icon={<Calendar className="w-4 h-4 text-blue-500" />}
            hint="Scheduled meetings"
          />
          <StatCard
            label="This Month"
            value={scheduledThisMonth}
            icon={<Clock className="w-4 h-4 text-orange-500" />}
            hint="Meetings planned"
          />
          <StatCard
            label="Completed This Year"
            value={completedThisYear}
            icon={<CheckCircle className="w-4 h-4 text-green-500" />}
            tone="success"
            hint="Reviews conducted"
          />
          <StatCard
            label="Total Records"
            value={reviews.length}
            icon={<FileText className="w-4 h-4 text-purple-500" />}
            hint="All meetings"
          />
        </StatGrid>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
              <TabsTrigger value="past">Past Meetings</TabsTrigger>
              <TabsTrigger value="document-control">Document Control</TabsTrigger>
            </TabsList>
            {activeTab !== 'document-control' && (
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search meetings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            )}
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

          <TabsContent value="document-control" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">Safety Meeting Document Control</CardTitle>
                    <CardDescription>
                      Manage the controlled template used to record safety meetings.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>
                    <Button size="sm">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload New Revision
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Document Code</p>
                    <p className="text-sm font-medium">SMS-FRM-MTG-001</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Title</p>
                    <p className="text-sm font-medium">Safety Meeting Minutes</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Current Revision</p>
                    <Badge variant="outline">Rev 0</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <Badge className="bg-green-500 text-white">Controlled</Badge>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Document Owner</p>
                    <p className="text-sm font-medium">DPA</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Approved By</p>
                    <p className="text-sm font-medium">—</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Issue Date</p>
                    <p className="text-sm font-medium">—</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Next Review</p>
                    <p className="text-sm font-medium">—</p>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <History className="w-4 h-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Revision History</h3>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Revision</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Changed By</TableHead>
                        <TableHead>Description of Change</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          No revisions recorded yet.
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default MeetingsPage;
