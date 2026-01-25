import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { format, differenceInDays } from 'date-fns';
import { 
  FileText, 
  Download, 
  Printer, 
  Mail, 
  Calendar, 
  Clock, 
  MapPin, 
  Cloud, 
  Star,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  Target,
  Wrench,
  MessageSquare,
  Plus
} from 'lucide-react';
import { Drill, useDrillDetails } from '@/hooks/useDrills';
import { DRILL_STATUSES, DEFICIENCY_SEVERITIES, EQUIPMENT_STATUSES, getDrillTypeColor } from '@/lib/drillConstants';

interface DrillDetailModalProps {
  drill: Drill | null;
  isOpen: boolean;
  onClose: () => void;
}

const DrillDetailModal: React.FC<DrillDetailModalProps> = ({
  drill,
  isOpen,
  onClose,
}) => {
  const [participantFilter, setParticipantFilter] = useState<'all' | 'present' | 'absent'>('all');
  
  const { participants, evaluations, deficiencies, equipment, isLoading } = useDrillDetails(drill?.id || null);

  if (!drill) return null;

  const statusConfig = DRILL_STATUSES.find(s => s.value === drill.status);
  const drillTypeColor = getDrillTypeColor(drill.drill_type?.drill_name || '');
  
  const isEditable = differenceInDays(new Date(), new Date(drill.created_at)) <= 7;

  const filteredParticipants = participants.filter(p => {
    if (participantFilter === 'present') return p.attended === true;
    if (participantFilter === 'absent') return p.attended === false;
    return true;
  });

  const objectivesAchieved = evaluations.filter(e => e.achieved === true).length;
  const totalObjectives = evaluations.length;

  const renderStars = (rating: number | null) => {
    if (!rating) return <span className="text-muted-foreground">—</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <Star 
            key={star}
            className={`h-4 w-4 ${star <= rating ? 'text-yellow-500 fill-yellow-500' : 'text-gray-300'}`}
          />
        ))}
      </div>
    );
  };

  const getSeverityBadge = (severity: string) => {
    const config = DEFICIENCY_SEVERITIES.find(s => s.value === severity);
    return <Badge className={config?.color || ''}>{config?.label || severity}</Badge>;
  };

  const getEquipmentStatusIcon = (status: string | null) => {
    switch (status) {
      case 'Satisfactory':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'Defective':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'Not_Available':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{drill.drill_number}</DialogTitle>
              <div className="flex items-center gap-2 mt-1">
                <Badge style={{ backgroundColor: drillTypeColor, color: 'white' }}>
                  {drill.drill_type?.drill_name}
                </Badge>
                <Badge className={statusConfig?.color || ''}>
                  {statusConfig?.label || drill.status}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                PDF
              </Button>
              <Button variant="outline" size="sm">
                <Mail className="h-4 w-4 mr-1" />
                Email
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="h-[calc(90vh-150px)]">
          <div className="space-y-6 pr-4">
            {/* Summary Section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Date</p>
                      <p className="text-sm font-medium">
                        {format(new Date(drill.drill_date_actual || drill.drill_date_scheduled), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Duration</p>
                      <p className="text-sm font-medium">
                        {drill.drill_duration_minutes ? `${drill.drill_duration_minutes} min` : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Location</p>
                      <p className="text-sm font-medium">{drill.location || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Cloud className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs text-muted-foreground">Weather</p>
                      <p className="text-sm font-medium">{drill.weather_conditions || '—'}</p>
                    </div>
                  </div>
                </div>
                <Separator className="my-4" />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Conducted By</p>
                    <p className="text-sm font-medium">
                      {drill.conducted_by 
                        ? `${drill.conducted_by.first_name} ${drill.conducted_by.last_name}`
                        : '—'
                      }
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vessel</p>
                    <p className="text-sm font-medium">{drill.vessel?.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Overall Rating</p>
                    {renderStars(drill.overall_rating)}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabs for detailed info */}
            <Tabs defaultValue="scenario">
              <TabsList className="grid grid-cols-5 w-full">
                <TabsTrigger value="scenario" className="flex items-center gap-1">
                  <Target className="h-4 w-4" />
                  <span className="hidden sm:inline">Scenario</span>
                </TabsTrigger>
                <TabsTrigger value="participants" className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Crew</span>
                </TabsTrigger>
                <TabsTrigger value="equipment" className="flex items-center gap-1">
                  <Wrench className="h-4 w-4" />
                  <span className="hidden sm:inline">Equipment</span>
                </TabsTrigger>
                <TabsTrigger value="deficiencies" className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="hidden sm:inline">Issues</span>
                </TabsTrigger>
                <TabsTrigger value="lessons" className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Lessons</span>
                </TabsTrigger>
              </TabsList>

              {/* Scenario & Objectives Tab */}
              <TabsContent value="scenario" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Scenario Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{drill.scenario_description}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>Objectives</span>
                      <Badge variant="outline">
                        {objectivesAchieved}/{totalObjectives} achieved
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {evaluations.length > 0 ? (
                      <div className="space-y-3">
                        {evaluations.map(evaluation => (
                          <div 
                            key={evaluation.id}
                            className={`p-3 rounded-lg border ${
                              evaluation.achieved 
                                ? 'border-green-200 bg-green-50' 
                                : evaluation.achieved === false 
                                  ? 'border-red-200 bg-red-50'
                                  : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {evaluation.achieved ? (
                                <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                              ) : evaluation.achieved === false ? (
                                <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
                              ) : (
                                <div className="h-5 w-5 rounded-full border-2 border-gray-300 mt-0.5" />
                              )}
                              <div className="flex-1">
                                <p className="text-sm font-medium">{evaluation.objective_text}</p>
                                {evaluation.notes && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    Notes: {evaluation.notes}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : drill.objectives && drill.objectives.length > 0 ? (
                      <div className="space-y-2">
                        {drill.objectives.map((obj, idx) => (
                          <div key={idx} className="flex items-center gap-2 p-2 rounded border">
                            <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                            <span className="text-sm">{obj}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No objectives recorded</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Participants Tab */}
              <TabsContent value="participants">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Participants</CardTitle>
                      <div className="flex gap-2">
                        <Button 
                          variant={participantFilter === 'all' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setParticipantFilter('all')}
                        >
                          All ({participants.length})
                        </Button>
                        <Button 
                          variant={participantFilter === 'present' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setParticipantFilter('present')}
                        >
                          Present ({participants.filter(p => p.attended).length})
                        </Button>
                        <Button 
                          variant={participantFilter === 'absent' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setParticipantFilter('absent')}
                        >
                          Absent ({participants.filter(p => p.attended === false).length})
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {filteredParticipants.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Rank</TableHead>
                            <TableHead>Station</TableHead>
                            <TableHead>Attendance</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Comments</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredParticipants.map(participant => (
                            <TableRow key={participant.id}>
                              <TableCell className="font-medium">
                                {participant.profile 
                                  ? `${participant.profile.first_name} ${participant.profile.last_name}`
                                  : '—'
                                }
                              </TableCell>
                              <TableCell>{participant.profile?.rank || '—'}</TableCell>
                              <TableCell>{participant.station_assignment || '—'}</TableCell>
                              <TableCell>
                                {participant.attended ? (
                                  <Badge className="bg-green-100 text-green-800">Present</Badge>
                                ) : participant.attended === false ? (
                                  <Badge className="bg-red-100 text-red-800">
                                    Absent{participant.absent_reason ? `: ${participant.absent_reason}` : ''}
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Unknown</Badge>
                                )}
                              </TableCell>
                              <TableCell>{renderStars(participant.performance_rating)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {participant.comments || '—'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No participants recorded
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Equipment Tab */}
              <TabsContent value="equipment">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Equipment Used</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {equipment.length > 0 ? (
                      <div className="space-y-2">
                        {equipment.map(item => (
                          <div 
                            key={item.id}
                            className={`flex items-center justify-between p-3 rounded-lg border ${
                              item.equipment_status === 'Satisfactory' 
                                ? 'border-green-200 bg-green-50'
                                : item.equipment_status === 'Defective'
                                  ? 'border-red-200 bg-red-50'
                                  : 'border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {getEquipmentStatusIcon(item.equipment_status)}
                              <div>
                                <p className="font-medium text-sm">{item.equipment_name}</p>
                                {item.notes && (
                                  <p className="text-xs text-muted-foreground">{item.notes}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {item.equipment_used && (
                                <Badge variant="outline">Used</Badge>
                              )}
                              <Badge 
                                className={
                                  item.equipment_status === 'Satisfactory' 
                                    ? 'bg-green-100 text-green-800' 
                                    : item.equipment_status === 'Defective'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-yellow-100 text-yellow-800'
                                }
                              >
                                {item.equipment_status?.replace('_', ' ') || 'Unknown'}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No equipment recorded
                      </p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Deficiencies Tab */}
              <TabsContent value="deficiencies">
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Deficiencies Found</CardTitle>
                      {isEditable && (
                        <Button size="sm">
                          <Plus className="h-4 w-4 mr-1" />
                          Add Deficiency
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {deficiencies.length > 0 ? (
                      <div className="space-y-3">
                        {deficiencies.map(deficiency => (
                          <div 
                            key={deficiency.id}
                            className="p-3 rounded-lg border"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {getSeverityBadge(deficiency.severity)}
                                  {deficiency.corrective_action_id && (
                                    <Badge variant="outline" className="text-xs">
                                      CAPA Linked
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm">{deficiency.deficiency_description}</p>
                              </div>
                            </div>
                            {deficiency.photo_urls && deficiency.photo_urls.length > 0 && (
                              <div className="flex gap-2 mt-2">
                                {deficiency.photo_urls.map((url, idx) => (
                                  <img 
                                    key={idx}
                                    src={url}
                                    alt={`Evidence ${idx + 1}`}
                                    className="h-16 w-16 object-cover rounded border"
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">No deficiencies found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Lessons Learned Tab */}
              <TabsContent value="lessons" className="space-y-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-green-600">What Went Well</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {drill.lessons_learned_positive || 'No positive observations recorded'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-amber-600">Areas for Improvement</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {drill.lessons_learned_improvement || 'No improvement areas recorded'}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base text-blue-600">Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      {drill.recommendations || 'No recommendations recorded'}
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            {/* Action Buttons */}
            {isEditable && (
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline">
                  <FileText className="h-4 w-4 mr-2" />
                  Create Follow-up Drill
                </Button>
                <Button variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Link to CAPA
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default DrillDetailModal;
