import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useIncidentTimeline } from "@/hooks/useIncidentTimeline";
import {
  AlertCircle,
  Bell,
  CheckCircle,
  Clock,
  FileSearch,
  FileText,
  User,
} from "lucide-react";

interface TimelineTabProps {
  incidentId: string;
}

const getTimelineIcon = (type: string) => {
  switch (type) {
    case "incident":
      return <AlertCircle className="h-4 w-4" />;
    case "investigation":
      return <FileSearch className="h-4 w-4" />;
    case "capa":
      return <FileText className="h-4 w-4" />;
    case "notification":
      return <Bell className="h-4 w-4" />;
    case "status":
      return <CheckCircle className="h-4 w-4" />;
    default:
      return <Clock className="h-4 w-4" />;
  }
};

const getTimelineColor = (type: string) => {
  switch (type) {
    case "incident":
      return "bg-critical";
    case "investigation":
      return "bg-info";
    case "capa":
      return "bg-purple";
    case "notification":
      return "bg-warning";
    case "status":
      return "bg-success";
    default:
      return "bg-muted-foreground";
  }
};

export function TimelineTab({ incidentId }: TimelineTabProps) {
  const { data: timeline, isLoading } = useIncidentTimeline(incidentId);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Loading timeline...</p>
        </CardContent>
      </Card>
    );
  }

  if (!timeline || timeline.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Clock className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-2">No Activity Yet</h3>
          <p className="text-muted-foreground">
            Timeline events will appear here as actions are taken.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4" />
          Activity Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

          <div className="space-y-6">
            {timeline.map((entry, index) => (
              <div key={entry.id} className="relative flex gap-4">
                {/* Icon bubble */}
                <div
                  className={cn(
                    "relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-white",
                    getTimelineColor(entry.type)
                  )}
                >
                  {getTimelineIcon(entry.type)}
                </div>

                {/* Content */}
                <div className="flex-1 pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-medium">{entry.action}</h4>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {entry.description}
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <div>{format(new Date(entry.timestamp), "MMM d, yyyy")}</div>
                      <div>{format(new Date(entry.timestamp), "HH:mm")}</div>
                    </div>
                  </div>
                  {entry.userName && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {entry.userName}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
