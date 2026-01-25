import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useCrew } from "@/hooks/useCrew";
import { useStartInvestigation } from "@/hooks/useInvestigation";
import { INVESTIGATION_METHODS } from "@/lib/incidentConstants";
import { CalendarIcon } from "lucide-react";

interface StartInvestigationModalProps {
  incidentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function StartInvestigationModal({
  incidentId,
  open,
  onOpenChange,
}: StartInvestigationModalProps) {
  const { user } = useAuth();
  const { crew } = useCrew();
  const startInvestigation = useStartInvestigation();

  const [leadInvestigator, setLeadInvestigator] = useState(user?.id || "");
  const [method, setMethod] = useState("");
  const [targetDate, setTargetDate] = useState<Date | undefined>(undefined);

  const handleSubmit = () => {
    startInvestigation.mutate(
      {
        incidentId,
        leadInvestigator,
        investigationTeam: [],
        investigationMethod: method,
        targetCompletionDate: targetDate?.toISOString() || "",
      },
      {
        onSuccess: () => {
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Start Investigation</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Lead Investigator</Label>
            <Select value={leadInvestigator} onValueChange={setLeadInvestigator}>
              <SelectTrigger>
                <SelectValue placeholder="Select lead investigator" />
              </SelectTrigger>
              <SelectContent>
                {crew.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.first_name} {member.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Investigation Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger>
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                {INVESTIGATION_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Target Completion Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !targetDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {targetDate ? format(targetDate, "PPP") : "Select date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={targetDate}
                  onSelect={setTargetDate}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!leadInvestigator || !method || startInvestigation.isPending}
          >
            Start Investigation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
