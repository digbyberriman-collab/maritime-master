export const INCIDENT_TYPES = [
  { value: "Near Miss", label: "Near Miss", color: "bg-blue-500", icon: "AlertCircle" },
  { value: "Injury", label: "Injury", color: "bg-orange-500", icon: "HeartPulse" },
  { value: "Pollution", label: "Pollution", color: "bg-red-500", icon: "Droplets" },
  { value: "Property Damage", label: "Property Damage", color: "bg-yellow-500", icon: "Hammer" },
  { value: "Security", label: "Security", color: "bg-purple-500", icon: "Shield" },
  { value: "Other", label: "Other", color: "bg-gray-500", icon: "MoreHorizontal" },
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
  { value: 1, label: "No Impact", description: "No injuries, no damage, no environmental impact", color: "text-green-600" },
  { value: 2, label: "Minor Impact", description: "Minor first aid, minor damage, negligible release", color: "text-yellow-600" },
  { value: 3, label: "Moderate Impact", description: "Medical treatment, significant damage, contained release", color: "text-orange-500" },
  { value: 4, label: "Serious Impact", description: "Serious injury, major damage, significant pollution", color: "text-red-500" },
  { value: 5, label: "Critical Impact", description: "Fatality/disability, total loss, major environmental disaster", color: "text-red-700" },
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
  return incidentType?.color || "bg-gray-500";
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "Open":
      return "bg-yellow-500";
    case "Under Investigation":
      return "bg-blue-500";
    case "Closed":
      return "bg-green-500";
    default:
      return "bg-gray-500";
  }
}

export function getCAPAStatusColor(status: string): string {
  switch (status) {
    case "Open":
      return "bg-red-500";
    case "In Progress":
      return "bg-yellow-500";
    case "Verification":
      return "bg-blue-500";
    case "Closed":
      return "bg-green-500";
    default:
      return "bg-gray-500";
  }
}
