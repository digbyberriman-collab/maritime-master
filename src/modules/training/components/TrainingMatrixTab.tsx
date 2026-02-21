import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useTraining } from '@/modules/training/hooks/useTraining';
import { useCrew } from '@/modules/crew/hooks/useCrew';
import { useVessels } from '@/modules/vessels/hooks/useVessels';
import { getTrainingStatusColor, daysUntilExpiry } from '@/modules/training/constants';
import { format } from 'date-fns';
import { Grid3X3, Check, X, AlertTriangle, Download } from 'lucide-react';

const TrainingMatrixTab: React.FC = () => {
  const { trainingRecords, courses, trainingMatrix, saveTrainingMatrix, isLoading } = useTraining();
  const { crew } = useCrew();
  const { vessels } = useVessels();
  const [selectedVessel, setSelectedVessel] = useState<string>('all');
  const [editMode, setEditMode] = useState(false);

  // Get unique crew with their training records
  const crewWithTraining = useMemo(() => {
    // Filter crew if vessel selected (would need crew assignment data)
    const filtered = crew;

    return filtered.map(member => {
      const memberRecords = trainingRecords.filter(r => r.user_id === member.user_id);
      const recordsByCourse: Record<string, { status: string; expiry: string | null }> = {};
      
      memberRecords.forEach(record => {
        if (record.course) {
          recordsByCourse[record.course.id] = {
            status: record.status,
            expiry: record.expiry_date,
          };
        }
      });

      return {
        ...member,
        trainingRecords: recordsByCourse,
      };
    });
  }, [crew, trainingRecords, selectedVessel]);

  // Get mandatory courses
  const mandatoryCourses = useMemo(() => {
    return courses.filter(c => c.is_mandatory);
  }, [courses]);

  // Calculate compliance summary
  const complianceSummary = useMemo(() => {
    const summary = {
      total: crewWithTraining.length * mandatoryCourses.length,
      valid: 0,
      expiring: 0,
      expired: 0,
      missing: 0,
    };

    crewWithTraining.forEach(member => {
      mandatoryCourses.forEach(course => {
        const record = member.trainingRecords[course.id];
        if (!record) {
          summary.missing++;
        } else if (record.status === 'Valid') {
          summary.valid++;
        } else if (record.status === 'Expiring_Soon') {
          summary.expiring++;
        } else if (record.status === 'Expired') {
          summary.expired++;
        }
      });
    });

    return summary;
  }, [crewWithTraining, mandatoryCourses]);

  const exportToExcel = () => {
    // Create CSV content
    const headers = ['Name', 'Rank', ...mandatoryCourses.map(c => c.course_code)];
    const rows = crewWithTraining.map(member => {
      const row = [
        `${member.first_name} ${member.last_name}`,
        member.rank || 'Crew',
      ];
      mandatoryCourses.forEach(course => {
        const record = member.trainingRecords[course.id];
        if (!record) {
          row.push('Missing');
        } else if (record.expiry) {
          row.push(`${record.status} (${format(new Date(record.expiry), 'MMM yy')})`);
        } else {
          row.push(record.status);
        }
      });
      return row;
    });

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `training-matrix-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-semibold">Training Matrix</h2>
          <p className="text-muted-foreground">Required vs actual training compliance grid</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedVessel} onValueChange={setSelectedVessel}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by vessel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Vessels</SelectItem>
              {vessels.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Compliance Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">
              {complianceSummary.total > 0 
                ? Math.round((complianceSummary.valid / complianceSummary.total) * 100) 
                : 0}%
            </p>
            <p className="text-sm text-muted-foreground">Overall Compliance</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-600">{complianceSummary.valid}</p>
            <p className="text-sm text-muted-foreground">Valid</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{complianceSummary.expiring}</p>
            <p className="text-sm text-muted-foreground">Expiring Soon</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-600">{complianceSummary.expired}</p>
            <p className="text-sm text-muted-foreground">Expired</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-gray-600">{complianceSummary.missing}</p>
            <p className="text-sm text-muted-foreground">Missing</p>
          </CardContent>
        </Card>
      </div>

      {/* Matrix Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[200px]">Crew Member</TableHead>
                  <TableHead className="min-w-[100px]">Rank</TableHead>
                  {mandatoryCourses.map(course => (
                    <TableHead key={course.id} className="text-center min-w-[100px]">
                      <div className="flex flex-col items-center">
                        <span className="text-xs font-medium">{course.course_code}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                          {course.course_name}
                        </span>
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {crewWithTraining.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={mandatoryCourses.length + 2} className="text-center py-8">
                      <Grid3X3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">No crew members found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  crewWithTraining.map(member => (
                    <TableRow key={member.user_id}>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        {member.first_name} {member.last_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{member.rank || 'Crew'}</Badge>
                      </TableCell>
                      {mandatoryCourses.map(course => {
                        const record = member.trainingRecords[course.id];
                        
                        if (!record) {
                          return (
                            <TableCell key={course.id} className="text-center">
                              <div className="flex justify-center">
                                <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                                  <X className="h-4 w-4 text-gray-500" />
                                </div>
                              </div>
                            </TableCell>
                          );
                        }

                        const days = record.expiry ? daysUntilExpiry(new Date(record.expiry)) : null;
                        
                        return (
                          <TableCell key={course.id} className="text-center">
                            <div className="flex flex-col items-center gap-1">
                              {record.status === 'Valid' && (
                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                                  <Check className="h-4 w-4 text-green-600" />
                                </div>
                              )}
                              {record.status === 'Expiring_Soon' && (
                                <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
                                  <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                </div>
                              )}
                              {record.status === 'Expired' && (
                                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                                  <X className="h-4 w-4 text-red-600" />
                                </div>
                              )}
                              {record.expiry && (
                                <span className="text-xs text-muted-foreground">
                                  {format(new Date(record.expiry), 'MMM yy')}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                <Check className="h-4 w-4 text-green-600" />
              </div>
              <span className="text-sm">Valid</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
              </div>
              <span className="text-sm">Expiring Soon (&lt;90 days)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                <X className="h-4 w-4 text-red-600" />
              </div>
              <span className="text-sm">Expired</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </div>
              <span className="text-sm">Missing/Not Required</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainingMatrixTab;
