import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ChevronDown, ChevronUp, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";

export type RaidItemType = "decision" | "assumption" | "risk" | "issue" | "key_project_risk";
export type RaidStatus = "current" | "accepted" | "closed" | "superseded" | "action" | "rejected" | "question_asked";

export const itemTypeLabels: Record<RaidItemType, string> = {
  decision: "Decision",
  assumption: "Assumption",
  risk: "Risk",
  issue: "Issue",
  key_project_risk: "Key Project Risk",
};

export const itemTypeColors: Record<RaidItemType, string> = {
  decision: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  assumption: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  risk: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  issue: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  key_project_risk: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300",
};

export const raidStatusLabels: Record<RaidStatus, string> = {
  current: "Current",
  accepted: "Accepted",
  closed: "Closed",
  superseded: "Superseded",
  action: "Action",
  rejected: "Rejected",
  question_asked: "Question Asked",
};

export const raidStatusColors: Record<RaidStatus, string> = {
  current: "bg-primary/15 text-primary",
  accepted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  closed: "bg-muted text-muted-foreground",
  superseded: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  action: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  rejected: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  question_asked: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400",
};

interface RaidItemCardProps {
  item: any;
  isExpanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onValidate?: () => void;
}

export function RaidItemCard({ item, isExpanded, onToggle, onEdit, onDelete, onValidate }: RaidItemCardProps) {
  const isPending = item.pending_validation;

  return (
    <Card className={`hover:shadow-md transition-shadow ${isPending ? "opacity-60 border-dashed" : ""}`}>
      <CardHeader className="cursor-pointer pb-2" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              {item.mdal_number && (
                <span className="text-xs font-mono text-muted-foreground">{item.mdal_number}</span>
              )}
              <CardTitle className="text-base">{item.title}</CardTitle>
              <Badge className={itemTypeColors[item.item_type as RaidItemType]}>
                {itemTypeLabels[item.item_type as RaidItemType]}
              </Badge>
              {item.raid_status && (
                <Badge className={raidStatusColors[item.raid_status as RaidStatus]}>
                  {raidStatusLabels[item.raid_status as RaidStatus]}
                </Badge>
              )}
              {item.areas?.name && (
                <Badge variant="outline" className="text-xs">{item.areas.name}</Badge>
              )}
              {isPending && (
                <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-600 dark:text-yellow-400">
                  <Clock className="h-3 w-3 mr-1" /> Pending Validation
                </Badge>
              )}
            </div>
            {item.decision_text && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{item.decision_text}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {item.date && (
              <span className="text-xs text-muted-foreground mr-2">
                {format(new Date(item.date), "MMM d, yyyy")}
              </span>
            )}
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-3">
          {item.decision_text && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Description</p>
              <p className="text-sm">{item.decision_text}</p>
            </div>
          )}
          {item.reasoning && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Reasoning</p>
              <p className="text-sm">{item.reasoning}</p>
            </div>
          )}
          {item.background && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Background / Mitigation</p>
              <p className="text-sm">{item.background}</p>
            </div>
          )}
          {item.reviewer_comment && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Reviewer Comment</p>
              <p className="text-sm">{item.reviewer_comment}</p>
            </div>
          )}
          {item.source_reference && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Source</p>
              <p className="text-sm">{item.source_reference}</p>
            </div>
          )}
          {item.assigned_owner && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Owner</p>
              <p className="text-sm">{item.assigned_owner}</p>
            </div>
          )}
          {item.notes && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes</p>
              <p className="text-sm">{item.notes}</p>
            </div>
          )}
          {item.tags && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1">Tags</p>
              <p className="text-sm">{item.tags}</p>
            </div>
          )}
          <div className="flex gap-2 pt-2 flex-wrap">
            {isPending && onValidate && (
              <Button size="sm" variant="default" onClick={onValidate}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Validate
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
