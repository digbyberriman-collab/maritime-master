import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useTraining, TrainingRecord } from '@/hooks/useTraining';
import { useCrew } from '@/hooks/useCrew';
import { 
  getTrainingStatusColor, 
  getCategoryColor,
  daysUntilExpiry,
  COURSE_CATEGORIES
} from '@/lib/trainingConstants';
import { format } from 'date-fns';
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  User, 
  Award, 
  Calendar,
  Plus,
  Eye,
  RefreshCw,
  FileText
} from 'lucide-react';

interface TrainingRecordsTabProps {
  onAddTraining: () => void;
}

const TrainingRecordsTab: React.FC<TrainingRecordsTabProps> = ({ onAddTraining }) => {
  const { trainingRecords, courses, isLoading } = useTraining();
  const { crew } = useCrew();
  const [viewMode, setViewMode] = useState<'crew' | 'course' | 'calendar'>('crew');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Group records by crew member
  const recordsByCrewMember = useMemo(() => {
    const grouped: Record<string, { profile: any; records: TrainingRecord[] }> = {};
    
    trainingRecords.forEach(record => {
      if (record.user) {
        const key = record.user_id;
        if (!grouped[key]) {
          grouped[key] = { profile: record.user, records: [] };
        }
        grouped[key].records.push(record);
      }
    });

    return Object.entries(grouped).filter(([_, data]) => {
      const name = `${data.profile.first_name} ${data.profile.last_name}`.toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });
  }, [trainingRecords, searchQuery]);

  // Group records by course category
  const recordsByCourse = useMemo(() => {
    const grouped: Record<string, TrainingRecord[]> = {};
    
    trainingRecords.forEach(record => {
      if (record.course) {
        const category = record.course.course_category;
        if (!grouped[category]) {
          grouped[category] = [];
        }
        grouped[category].push(record);
      }
    });

    return Object.entries(grouped).filter(([category]) => 
      categoryFilter === 'all' || category === categoryFilter
    );
  }, [trainingRecords, categoryFilter]);

  // Filter records for calendar view
  const filteredRecords = useMemo(() => {
    return trainingRecords.filter(record => {
      if (statusFilter !== 'all' && record.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && record.course?.course_category !== categoryFilter) return false;
      return true;
    });
  }, [trainingRecords, statusFilter, categoryFilter]);

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Toggle & Filters */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="crew">
              <User className="h-4 w-4 mr-2" />
              By Crew Member
            </TabsTrigger>
            <TabsTrigger value="course">
              <Award className="h-4 w-4 mr-2" />
              By Course
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <Calendar className="h-4 w-4 mr-2" />
              Calendar View
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {COURSE_CATEGORIES.map(cat => (
                <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* By Crew Member View */}
      {viewMode === 'crew' && (
        <div className="space-y-3">
          {recordsByCrewMember.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Award className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Training Records</h3>
                <p className="text-muted-foreground mb-4">Get started by adding training records for crew members</p>
                <Button onClick={onAddTraining}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Training Record
                </Button>
              </CardContent>
            </Card>
          ) : (
            recordsByCrewMember.map(([userId, data]) => {
              const validCount = data.records.filter(r => r.status === 'Valid').length;
              const expiringCount = data.records.filter(r => r.status === 'Expiring_Soon').length;
              const expiredCount = data.records.filter(r => r.status === 'Expired').length;
              const isExpanded = expandedItems.has(userId);

              return (
                <Collapsible key={userId} open={isExpanded} onOpenChange={() => toggleExpanded(userId)}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                            <div>
                              <CardTitle className="text-lg">
                                {data.profile.first_name} {data.profile.last_name}
                              </CardTitle>
                              <p className="text-sm text-muted-foreground">
                                {data.profile.rank || 'Crew'} • Certificates: {data.records.length}
                                {expiringCount > 0 && ` • Expiring: ${expiringCount}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {expiredCount > 0 && (
                              <Badge variant="destructive">{expiredCount} Expired</Badge>
                            )}
                            {expiringCount > 0 && (
                              <Badge className="bg-yellow-100 text-yellow-800">{expiringCount} Expiring</Badge>
                            )}
                            <Badge variant={validCount === data.records.length ? "default" : "secondary"}>
                              {validCount === data.records.length ? '✓ Compliant' : `${validCount}/${data.records.length}`}
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Course Name</TableHead>
                              <TableHead>Certificate #</TableHead>
                              <TableHead>Issue Date</TableHead>
                              <TableHead>Expiry Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {data.records.map(record => {
                              const days = record.expiry_date ? daysUntilExpiry(new Date(record.expiry_date)) : null;
                              return (
                                <TableRow key={record.id}>
                                  <TableCell>
                                    <div>
                                      <p className="font-medium">{record.course?.course_name}</p>
                                      <p className="text-xs text-muted-foreground">{record.course?.course_code}</p>
                                    </div>
                                  </TableCell>
                                  <TableCell>{record.certificate_number || '-'}</TableCell>
                                  <TableCell>{format(new Date(record.issue_date), 'dd MMM yyyy')}</TableCell>
                                  <TableCell>
                                    {record.expiry_date ? (
                                      <div>
                                        <p>{format(new Date(record.expiry_date), 'dd MMM yyyy')}</p>
                                        {days !== null && days <= 90 && (
                                          <p className={`text-xs ${days < 0 ? 'text-red-600' : 'text-yellow-600'}`}>
                                            {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
                                          </p>
                                        )}
                                      </div>
                                    ) : (
                                      <span className="text-muted-foreground">No expiry</span>
                                    )}
                                  </TableCell>
                                  <TableCell>
                                    <Badge className={getTrainingStatusColor(record.status)}>
                                      {record.status.replace('_', ' ')}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-right">
                                    <div className="flex justify-end gap-2">
                                      <Button variant="ghost" size="sm">
                                        <Eye className="h-4 w-4" />
                                      </Button>
                                      <Button variant="ghost" size="sm">
                                        <RefreshCw className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                        <div className="flex justify-end mt-4">
                          <Button variant="outline" size="sm" onClick={onAddTraining}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Training
                          </Button>
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>
      )}

      {/* By Course View */}
      {viewMode === 'course' && (
        <div className="space-y-3">
          {recordsByCourse.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No Training Records</h3>
                <p className="text-muted-foreground">No records found for the selected category</p>
              </CardContent>
            </Card>
          ) : (
            recordsByCourse.map(([category, records]) => {
              const isExpanded = expandedItems.has(category);
              const expiringCount = records.filter(r => r.status === 'Expiring_Soon').length;

              return (
                <Collapsible key={category} open={isExpanded} onOpenChange={() => toggleExpanded(category)}>
                  <Card>
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="h-5 w-5" />
                            ) : (
                              <ChevronRight className="h-5 w-5" />
                            )}
                            <div>
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Badge className={getCategoryColor(category)}>
                                  {COURSE_CATEGORIES.find(c => c.value === category)?.label || category}
                                </Badge>
                              </CardTitle>
                              <p className="text-sm text-muted-foreground mt-1">
                                {records.length} certificates
                                {expiringCount > 0 && ` • ${expiringCount} expiring soon`}
                              </p>
                            </div>
                          </div>
                        </div>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent>
                        {/* Group by course within category */}
                        {Object.entries(
                          records.reduce((acc, record) => {
                            const courseName = record.course?.course_name || 'Unknown';
                            if (!acc[courseName]) acc[courseName] = [];
                            acc[courseName].push(record);
                            return acc;
                          }, {} as Record<string, TrainingRecord[]>)
                        ).map(([courseName, courseRecords]) => (
                          <div key={courseName} className="mb-4 last:mb-0">
                            <h4 className="font-medium mb-2">{courseName}</h4>
                            <div className="text-sm text-muted-foreground mb-2">
                              {courseRecords.length} crew members trained
                              {courseRecords[0]?.expiry_date && (
                                <span>
                                  {' '}• Next expiry: {format(new Date(
                                    Math.min(...courseRecords.filter(r => r.expiry_date).map(r => new Date(r.expiry_date!).getTime()))
                                  ), 'MMM yyyy')}
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {courseRecords.map(record => (
                                <Badge 
                                  key={record.id} 
                                  variant="outline"
                                  className={record.status !== 'Valid' ? 'border-yellow-500 text-yellow-700' : ''}
                                >
                                  {record.user?.first_name} {record.user?.last_name}
                                  {record.expiry_date && (
                                    <span className="ml-1 text-xs opacity-75">
                                      ({format(new Date(record.expiry_date), 'MMM yy')})
                                    </span>
                                  )}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              );
            })
          )}
        </div>
      )}

      {/* Calendar View */}
      {viewMode === 'calendar' && (
        <Card>
          <CardHeader>
            <CardTitle>Certificate Expiry Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Expiring_Soon">Expiring Soon</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Valid">Valid</SelectItem>
                </SelectContent>
              </Select>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Crew Member</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>Days Left</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords
                    .filter(r => r.expiry_date)
                    .sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime())
                    .slice(0, 20)
                    .map(record => {
                      const days = daysUntilExpiry(new Date(record.expiry_date!));
                      return (
                        <TableRow key={record.id}>
                          <TableCell>
                            {record.user?.first_name} {record.user?.last_name}
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{record.course?.course_name}</p>
                              <Badge variant="outline" className="text-xs">
                                {record.course?.course_category}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell>
                            {format(new Date(record.expiry_date!), 'dd MMM yyyy')}
                          </TableCell>
                          <TableCell>
                            <span className={days !== null && days < 0 ? 'text-red-600 font-medium' : days !== null && days <= 30 ? 'text-yellow-600' : ''}>
                              {days !== null ? (days < 0 ? `${Math.abs(days)} overdue` : `${days} days`) : '-'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Badge className={getTrainingStatusColor(record.status)}>
                              {record.status.replace('_', ' ')}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm">
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Renew
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TrainingRecordsTab;
