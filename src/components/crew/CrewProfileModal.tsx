import React from 'react';
import { format, differenceInDays, differenceInMonths, differenceInYears } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Mail,
  Phone,
  MapPin,
  Ship,
  Calendar,
  Clock,
  User,
  FileText,
  GraduationCap,
  Activity,
  Edit,
  ArrowRightLeft,
  LogOut,
  UserX,
} from 'lucide-react';
import type { CrewMember } from '@/hooks/useCrew';

interface CrewProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  crewMember: CrewMember | null;
  onEdit: () => void;
  onTransfer: () => void;
  onSignOff: () => void;
  onDeactivate: () => void;
  canManage: boolean;
}

const formatTimeOnVessel = (joinDate: string) => {
  const join = new Date(joinDate);
  const now = new Date();
  const years = differenceInYears(now, join);
  const months = differenceInMonths(now, join) % 12;
  const days = differenceInDays(now, join) % 30;

  if (years > 0) {
    return `${years}y ${months}m`;
  } else if (months > 0) {
    return `${months}m ${days}d`;
  } else {
    return `${days} days`;
  }
};

const CrewProfileModal: React.FC<CrewProfileModalProps> = ({
  isOpen,
  onClose,
  crewMember,
  onEdit,
  onTransfer,
  onSignOff,
  onDeactivate,
  canManage,
}) => {
  if (!crewMember) return null;

  const fullName = `${crewMember.first_name} ${crewMember.last_name}`;
  const hasAssignment = !!crewMember.current_assignment;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Crew Member Profile</DialogTitle>
        </DialogHeader>

        {/* Profile Header */}
        <div className="flex items-start gap-4 pb-4 border-b">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">{fullName}</h2>
            <p className="text-muted-foreground">{crewMember.rank || 'No rank assigned'}</p>
            <div className="flex gap-2 mt-2">
              <Badge variant={crewMember.status === 'Active' ? 'default' : 'secondary'}>
                {crewMember.status || 'Unknown'}
              </Badge>
              {crewMember.nationality && (
                <Badge variant="outline">{crewMember.nationality}</Badge>
              )}
            </div>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              <Edit className="w-4 h-4 mr-2" />
              Edit
            </Button>
          )}
        </div>

        {/* Current Assignment Card */}
        {hasAssignment && (
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Ship className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">{crewMember.current_assignment?.vessel_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {crewMember.current_assignment?.position}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {formatTimeOnVessel(crewMember.current_assignment?.join_date || '')}
                  </p>
                  <p className="text-xs text-muted-foreground">Time on vessel</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="overview" className="mt-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="certificates">Certificates</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            <div className="grid gap-3">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-muted-foreground" />
                <span>{crewMember.email}</span>
              </div>
              {crewMember.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-muted-foreground" />
                  <span>{crewMember.phone}</span>
                </div>
              )}
              {crewMember.nationality && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground" />
                  <span>{crewMember.nationality}</span>
                </div>
              )}
              {hasAssignment && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span>
                    Joined {format(new Date(crewMember.current_assignment!.join_date), 'PPP')}
                  </span>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="certificates" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4" />
                  Certificates
                </CardTitle>
                <CardDescription>Coming in next phase</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Certificate management will be available soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="training" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <GraduationCap className="w-4 h-4" />
                  Training Records
                </CardTitle>
                <CardDescription>Coming in next phase</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>Training records will be available soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="w-4 h-4" />
                  Activity Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">
                      Account created {format(new Date(crewMember.created_at), 'PPP')}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Actions */}
        {canManage && (
          <div className="flex flex-wrap gap-2 pt-4 border-t mt-4">
            {hasAssignment && (
              <>
                <Button variant="outline" size="sm" onClick={onTransfer}>
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  Transfer to Another Vessel
                </Button>
                <Button variant="outline" size="sm" onClick={onSignOff}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Off
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onDeactivate}
              className="text-destructive hover:text-destructive"
            >
              <UserX className="w-4 h-4 mr-2" />
              Deactivate Account
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CrewProfileModal;
