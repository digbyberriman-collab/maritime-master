import { useProject } from "@/modules/new-build/contexts/NewBuildProjectContext";

export default function Onboarding() {
  const { currentProject } = useProject();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Get Up to Speed — {currentProject?.name}</h1>
      <p className="text-muted-foreground">Read-only summary of key project context, decisions, and priorities. Coming in Phase 5.</p>
    </div>
  );
}
