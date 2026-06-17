import { useProject } from "@/contexts/ProjectContext";
import { ArrowLeft, Users } from "lucide-react";
import { Link } from "react-router-dom";
import ContractorDemarcation from "@/components/interior/ContractorDemarcation";

export default function InteriorDemarcation() {
  const { currentProject } = useProject();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/interior" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contractor Demarcation — {currentProject?.name}</h1>
          <p className="text-muted-foreground text-sm">Scope responsibility assignments per room.</p>
        </div>
      </div>
      <ContractorDemarcation />
    </div>
  );
}
