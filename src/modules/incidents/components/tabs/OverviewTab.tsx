import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { SEVERITY_LEVELS } from "@/modules/incidents/constants";
import {
  AlertCircle,
  Bell,
  Calendar,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Star,
  User,
  Users,
} from "lucide-react";

interface OverviewTabProps {
  incident: {
    id: string;
    incident_date: string;
    location: string;
    incident_type: string;
    description: string;
    immediate_action: string | null;
    severity_actual: number;
    severity_potential: number;
    dpa_notified: boolean | null;
    dpa_notified_date: string | null;
    persons_involved: unknown;
    witnesses: unknown;
    attachments: unknown;
    vessels?: { name: string } | null;
    reporter?: { first_name: string; last_name: string; role: string } | null;
  };
}

interface PersonInvolved {
  name: string;
  role: string;
  injured: boolean;
  injuryDetails?: string;
}

interface Witness {
  name: string;
  statement: string;
}

export function OverviewTab({ incident }: OverviewTabProps) {
  const personsInvolved = Array.isArray(incident.persons_involved)
    ? (incident.persons_involved as PersonInvolved[])
    : [];
  const witnesses = Array.isArray(incident.witnesses)
    ? (incident.witnesses as Witness[])
    : [];
  const attachments = Array.isArray(incident.attachments)
    ? (incident.attachments as string[])
    : [];

  const renderSeverityStars = (severity: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-4 w-4",
              star <= severity
                ? severity <= 2
                  ? "fill-green-500 text-green-500"
                  : severity === 3
                  ? "fill-yellow-500 text-yellow-500"
                  : severity === 4
                  ? "fill-orange-500 text-orange-500"
                  : "fill-red-500 text-red-500"
                : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  const getSeverityLabel = (severity: number) => {
    return SEVERITY_LEVELS.find((l) => l.value === severity)?.label || "Unknown";
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident Summary Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" />
              Incident Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Date & Time:</span>
              <span>
                {format(new Date(incident.incident_date), "MMMM d, yyyy 'at' HH:mm")}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Location:</span>
              <span>{incident.location} - {incident.vessels?.name}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Type:</span>
              <span>{incident.incident_type}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Reported by:</span>
              <span>
                {incident.reporter?.first_name} {incident.reporter?.last_name} ({incident.reporter?.role})
              </span>
            </div>
            <div className="pt-2 border-t space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Actual Severity:</span>
                <div className="flex items-center gap-2">
                  {renderSeverityStars(incident.severity_actual)}
                  <span className="text-sm text-muted-foreground">
                    {getSeverityLabel(incident.severity_actual)}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Potential Severity:</span>
                <div className="flex items-center gap-2">
                  {renderSeverityStars(incident.severity_potential)}
                  <span className="text-sm text-muted-foreground">
                    {getSeverityLabel(incident.severity_potential)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Notifications Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">DPA Notified:</span>
              {incident.dpa_notified ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500 text-white">Yes</Badge>
                  {incident.dpa_notified_date && (
                    <span className="text-muted-foreground">
                      {format(new Date(incident.dpa_notified_date), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              ) : (
                <Badge variant="outline">No</Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">
              {incident.severity_actual >= 4 || incident.severity_potential >= 4 ? (
                <p className="text-orange-600">
                  High severity incident - DPA notification required within 24 hours
                </p>
              ) : (
                <p>Standard notification protocol applies</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Description Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Description</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{incident.description}</p>
        </CardContent>
      </Card>

      {/* Immediate Actions Card */}
      {incident.immediate_action && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Immediate Actions Taken</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{incident.immediate_action}</p>
          </CardContent>
        </Card>
      )}

      {/* People Involved Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" />
            People Involved ({personsInvolved.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {personsInvolved.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No persons recorded as involved in this incident.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Injury Status</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {personsInvolved.map((person, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{person.name}</TableCell>
                    <TableCell>{person.role}</TableCell>
                    <TableCell>
                      {person.injured ? (
                        <Badge variant="destructive">Injured</Badge>
                      ) : (
                        <Badge variant="outline">Not Injured</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {person.injured && person.injuryDetails ? person.injuryDetails : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Witnesses Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" />
            Witnesses ({witnesses.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {witnesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No witnesses recorded for this incident.
            </p>
          ) : (
            <div className="space-y-3">
              {witnesses.map((witness, index) => (
                <div key={index} className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-sm mb-1">{witness.name}</p>
                  <p className="text-sm text-muted-foreground italic">
                    "{witness.statement}"
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attachments Card */}
      {attachments.length > 0 && (
        <Card>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Attachments ({attachments.length})
            </CardTitle>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download All
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {attachments.map((url, index) => {
                const isImage = /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
                return (
                  <a
                    key={index}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative aspect-square rounded-lg border overflow-hidden hover:border-primary transition-colors"
                  >
                    {isImage ? (
                      <img
                        src={url}
                        alt={`Attachment ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-muted">
                        <FileText className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <ExternalLink className="h-6 w-6 text-white" />
                    </div>
                  </a>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
