import { useState } from "react";
import { format, subDays } from "date-fns";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { useVessels } from "@/hooks/useVessels";
import { useIncidents, useIncidentStats } from "@/hooks/useIncidents";
import { ReportIncidentModal } from "@/components/incidents/ReportIncidentModal";
import { IncidentDetailView } from "@/components/incidents/IncidentDetailView";
import {
  INCIDENT_TYPES,
  getIncidentTypeColor,
  getStatusColor,
} from "@/lib/incidentConstants";
import {
  AlertTriangle,
  Calendar as CalendarIcon,
  Clock,
  Eye,
  Filter,
  Plus,
  Search,
  Shield,
  Star,
  TrendingUp,
} from "lucide-react";

export default function Incidents() {
  const [showReportModal, setShowReportModal] = useState(false);
  const [viewingIncident, setViewingIncident] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    vesselId: "",
    status: "",
    incidentType: [] as string[],
    dateFrom: subDays(new Date(), 30).toISOString(),
    dateTo: new Date().toISOString(),
    severity: 0,
  });
  const [searchQuery, setSearchQuery] = useState("");

  const { vessels } = useVessels();
  const { data: incidents, isLoading } = useIncidents({
    vesselId: filters.vesselId || undefined,
    status: filters.status || undefined,
    incidentType: filters.incidentType.length === 1 ? filters.incidentType[0] : undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    severity: filters.severity || undefined,
  });
  const { data: stats } = useIncidentStats();

  const filteredIncidents = incidents?.filter((incident) => {
    if (searchQuery) {
      const search = searchQuery.toLowerCase();
      return (
        incident.incident_number.toLowerCase().includes(search) ||
        incident.description.toLowerCase().includes(search) ||
        incident.location.toLowerCase().includes(search)
      );
    }
    if (filters.incidentType.length > 1) {
      return filters.incidentType.includes(incident.incident_type);
    }
    return true;
  });

  const toggleIncidentType = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      incidentType: prev.incidentType.includes(type)
        ? prev.incidentType.filter((t) => t !== type)
        : [...prev.incidentType, type],
    }));
  };

  const renderSeverityStars = (severity: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "h-3 w-3",
              star <= severity
                ? severity <= 2
                  ? "fill-success text-success"
                  : severity === 3
                  ? "fill-warning text-warning"
                  : severity === 4
                  ? "fill-orange text-orange"
                  : "fill-critical text-critical"
                : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Incidents & Near Misses</h1>
            <p className="text-muted-foreground">
              Report and track safety incidents across the fleet
            </p>
          </div>
          <Button
            onClick={() => setShowReportModal(true)}
            className="bg-red-600 hover:bg-red-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Report Incident
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Incidents This Month
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats?.totalThisMonth || 0}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Open Investigations
              </CardTitle>
              <Search className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats?.openInvestigations || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue CAPAs</CardTitle>
              <Clock className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className={cn(
                "text-2xl font-bold",
                (stats?.overdueCAPAs || 0) > 0 && "text-red-600"
              )}>
                {stats?.overdueCAPAs || 0}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Days Since Last Incident
              </CardTitle>
              <Shield className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {stats?.daysSinceLastIncident || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search incidents..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>

              <Select
                value={filters.vesselId || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, vesselId: value === "all" ? "" : value }))
                }
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Vessels" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Vessels</SelectItem>
                  {vessels?.map((vessel) => (
                    <SelectItem key={vessel.id} value={vessel.id}>
                      {vessel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[240px]">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(new Date(filters.dateFrom), "MMM d")} -{" "}
                    {format(new Date(filters.dateTo), "MMM d, yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={{
                      from: new Date(filters.dateFrom),
                      to: new Date(filters.dateTo),
                    }}
                    onSelect={(range) => {
                      if (range?.from) {
                        setFilters((prev) => ({
                          ...prev,
                          dateFrom: range.from!.toISOString(),
                          dateTo: (range.to || range.from).toISOString(),
                        }));
                      }
                    }}
                    numberOfMonths={2}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>

              <Select
                value={filters.status || "all"}
                onValueChange={(value) =>
                  setFilters((prev) => ({ ...prev, status: value === "all" ? "" : value }))
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="Under Investigation">Under Investigation</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>

            {showFilters && (
              <div className="mt-4 pt-4 border-t space-y-4">
                <div>
                  <Label className="mb-2 block">Incident Type</Label>
                  <div className="flex flex-wrap gap-2">
                    {INCIDENT_TYPES.map((type) => (
                      <div
                        key={type.value}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={type.value}
                          checked={filters.incidentType.includes(type.value)}
                          onCheckedChange={() => toggleIncidentType(type.value)}
                        />
                        <Label
                          htmlFor={type.value}
                          className="flex items-center gap-1 cursor-pointer"
                        >
                          <div className={cn("w-2 h-2 rounded-full", type.color)} />
                          {type.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block">Minimum Severity</Label>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3, 4, 5].map((level) => (
                      <Button
                        key={level}
                        variant={filters.severity === level ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setFilters((prev) => ({ ...prev, severity: level }))
                        }
                      >
                        {level === 0 ? "Any" : `${level}+`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Incidents Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <p className="text-muted-foreground">Loading incidents...</p>
              </div>
            ) : !filteredIncidents || filteredIncidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <Shield className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-semibold">No incidents reported</h3>
                <p className="text-muted-foreground">
                  Report any incidents or near misses immediately.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Incident #</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Vessel</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Severity (A/P)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Investigation</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredIncidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell className="font-medium">
                        {incident.incident_number}
                      </TableCell>
                      <TableCell>
                        {format(new Date(incident.incident_date), "MMM d, yyyy HH:mm")}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-white",
                            getIncidentTypeColor(incident.incident_type)
                          )}
                        >
                          {incident.incident_type}
                        </Badge>
                      </TableCell>
                      <TableCell>{incident.vessels?.name}</TableCell>
                      <TableCell>{incident.location}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {renderSeverityStars(incident.severity_actual)}
                          <span className="text-muted-foreground">/</span>
                          {renderSeverityStars(incident.severity_potential)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "text-white",
                            getStatusColor(incident.status)
                          )}
                        >
                          {incident.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {incident.investigation_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewingIncident(incident.id)}
                        >
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

        {/* Modals */}
        <ReportIncidentModal
          open={showReportModal}
          onOpenChange={setShowReportModal}
        />

        {viewingIncident && (
          <IncidentDetailView
            incidentId={viewingIncident}
            open={!!viewingIncident}
            onOpenChange={(open) => !open && setViewingIncident(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
