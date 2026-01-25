import { useState } from "react";
import { format, addDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useCrew } from "@/hooks/useCrew";
import { useCreateCorrectedAction } from "@/hooks/useCorrectiveActions";
import { ACTION_TYPES } from "@/lib/incidentConstants";
import { CalendarIcon } from "lucide-react";

interface AddCAPAModalProps {
  incidentId: string;
  incidentSeverity: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddCAPAModal({
  incidentId,
  incidentSeverity,
  open,
  onOpenChange,
}: AddCAPAModalProps) {
  const { crew } = useCrew();
  const createCAPA = useCreateCorrectedAction();

  const [description, setDescription] = useState("");
  const [actionType, setActionType] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined);

  const handleActionTypeChange = (type: string) => {
    setActionType(type);
    // Set suggested due date based on type
    const today = new Date();
    if (type === "Immediate") {
      setDueDate(addDays(today, 7));
    } else if (type === "Corrective") {
      setDueDate(addDays(today, 30));
    } else if (type === "Preventive") {
      setDueDate(addDays(today, 90));
    }
  };

  const handleSubmit = () => {
    if (!dueDate) return;

    createCAPA.mutate(
      {
        incident_id: incidentId,
        description,
        action_type: actionType,
        assigned_to: assignedTo,
        due_date: dueDate.toISOString().split("T")[0],
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setDescription("");
          setActionType("");
          setAssignedTo("");
          setDueDate(undefined);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Corrective Action</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Action Description</Label>
            <Textarea
              placeholder="Describe the corrective action to be taken..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Action Type</Label>
            <Select value={actionType} onValueChange={handleActionTypeChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select action type" />
              </SelectTrigger>
              <SelectContent>
                {ACTION_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <div className="font-medium">{type.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {type.description}
                      </div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Assigned To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select assignee" />
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
            <Label>Due Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dueDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dueDate ? format(dueDate, "PPP") : "Select due date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={dueDate}
                  onSelect={setDueDate}
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
            disabled={!description || !actionType || !assignedTo || !dueDate || createCAPA.isPending}
          >
            Create CAPA
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
