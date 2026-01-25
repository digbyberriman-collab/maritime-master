export const INCIDENT_TYPES = [
  { value: "Near Miss", label: "Near Miss", color: "bg-info", icon: "AlertCircle" },
  { value: "Injury", label: "Injury", color: "bg-orange", icon: "HeartPulse" },
  { value: "Pollution", label: "Pollution", color: "bg-critical", icon: "Droplets" },
  { value: "Property Damage", label: "Property Damage", color: "bg-warning", icon: "Hammer" },
  { value: "Security", label: "Security", color: "bg-purple", icon: "Shield" },
  { value: "Other", label: "Other", color: "bg-muted-foreground", icon: "MoreHorizontal" },
] as const;

export const VESSEL_LOCATIONS = [
  "Bridge",
  "Engine Room",
  "Deck",
  "Galley",
  "Cargo Hold",
  "Accommodation",
  "Steering Gear Room",
  "Bow Thruster Room",
  "Tank Top",
  "Forecastle",
  "Poop Deck",
  "Mooring Area",
  "Ballast Tank",
  "Fuel Tank",
  "Workshop",
  "Store Room",
  "Other",
];

export const SEVERITY_LEVELS = [
  { value: 1, label: "No Impact", description: "No injuries, no damage, no environmental impact", color: "text-success" },
  { value: 2, label: "Minor Impact", description: "Minor first aid, minor damage, negligible release", color: "text-warning" },
  { value: 3, label: "Moderate Impact", description: "Medical treatment, significant damage, contained release", color: "text-orange" },
  { value: 4, label: "Serious Impact", description: "Serious injury, major damage, significant pollution", color: "text-critical" },
  { value: 5, label: "Critical Impact", description: "Fatality/disability, total loss, major environmental disaster", color: "text-destructive" },
] as const;

export const INVESTIGATION_METHODS = [
  { value: "5 Whys", label: "5 Whys Analysis" },
  { value: "Fishbone", label: "Fishbone/Ishikawa Diagram" },
  { value: "RCA", label: "Root Cause Analysis" },
  { value: "Other", label: "Other Method" },
] as const;

export const ACTION_TYPES = [
  { value: "Immediate", label: "Immediate Action", description: "Action taken immediately to contain the issue" },
  { value: "Corrective", label: "Corrective Action", description: "Action to fix the root cause and prevent recurrence" },
  { value: "Preventive", label: "Preventive Action", description: "Action to prevent similar issues from occurring" },
] as const;

export function getIncidentTypeColor(type: string): string {
  const incidentType = INCIDENT_TYPES.find((t) => t.value === type);
  return incidentType?.color || "bg-muted-foreground";
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "Open":
      return "bg-warning";
    case "Under Investigation":
      return "bg-info";
    case "Closed":
      return "bg-success";
    default:
      return "bg-muted-foreground";
  }
}

export function getCAPAStatusColor(status: string): string {
  switch (status) {
    case "Open":
      return "bg-critical";
    case "In Progress":
      return "bg-warning";
    case "Verification":
      return "bg-info";
    case "Closed":
      return "bg-success";
    default:
      return "bg-muted-foreground";
  }
}
