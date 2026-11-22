/**
 * Refit tables that the Refit pages use but that are not in the generated
 * types (gap/00 D2; DECISIONS D-01). No `rf_*` migration exists in this
 * repository yet: the Refit schema import is its own stream (gap/00 §5,
 * migration block 11). Until it lands and `types.ts` is regenerated, these
 * shapes are the only declaration of the tables, and every call against
 * them can fail with "relation does not exist" on a database that lacks
 * them. Classify that with `isMissingRelation` (the one helper, in
 * src/integrations/supabase/missingRelation.ts; re-exported from
 * `@/integrations/supabase/pending` and as `isMissingRelationError` from
 * `@/shared/lib/notify`).
 *
 * The client typed with these is `refitDb` (../lib/db.ts). When the import
 * lands and the types are regenerated, src/test/config/pendingTables.test.ts
 * fails for every table listed here that `types.ts` now knows: delete it.
 *
 * Row shapes are the ones the ported pages were written against. Insert
 * requirements are the columns the pages always send; confirm them against
 * the Refit migration when it is written.
 */
import type { PendingTable, PendingView, UndeclaredRow } from '@/integrations/supabase/pending';

export type Department = { id: string; code: string; name: string };
export type VesselArea = {
  id: string;
  vessel_id: string;
  code: string;
  name: string;
  parent_id: string | null;
};
export type CostCode = { id: string; code: string; name: string; parent_id: string | null };

export type ChangeOrder = {
  id: string;
  vessel_id: string;
  reference: string;
  title: string;
  description: string | null;
  reason: string | null;
  technical_impact: string | null;
  risk_impact: string | null;
  department_id: string | null;
  vessel_area_id: string | null;
  cost_code_id: string | null;
  cost_estimate: number | null;
  approved_cost: number | null;
  schedule_impact_days: number | null;
  priority: "low" | "medium" | "high" | "critical";
  status:
    | "draft"
    | "submitted"
    | "under_review"
    | "more_info_required"
    | "approved"
    | "rejected"
    | "in_progress"
    | "completed"
    | "closed"
    | "cancelled";
  current_stage: string | null;
  required_stages: string[];
  raised_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ChangeOrderApproval = {
  id: string;
  change_order_id: string;
  stage: "captain" | "owner_rep" | "yard" | "finance" | "technical" | "class_flag";
  approver_id: string | null;
  decision: "pending" | "approved" | "rejected" | "more_info" | "delegated" | "skipped";
  comment: string | null;
  decided_at: string | null;
  created_at: string;
};

export type CrewRequest = {
  id: string;
  vessel_id: string;
  reference: string;
  title: string;
  description: string | null;
  kind: string;
  department_id: string | null;
  vessel_area_id: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status:
    | "new"
    | "triaged"
    | "assigned"
    | "in_progress"
    | "blocked"
    | "awaiting_approval"
    | "completed"
    | "rejected"
    | "closed";
  requested_by: string | null;
  assigned_to: string | null;
  due_date: string | null;
  cost_impact: number | null;
  schedule_impact_days: number | null;
  safety_impact: string | null;
  linked_change_order_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_currency: string | null;
  invoice_file_path: string | null;
  invoice_uploaded_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrder = {
  id: string;
  vessel_id: string;
  reference: string;
  title: string;
  description: string | null;
  contractor_id: string | null;
  cost_code_id: string | null;
  department_id: string | null;
  amount: number;
  currency: string;
  status:
    | "draft"
    | "submitted"
    | "approved"
    | "rejected"
    | "sent"
    | "received"
    | "closed"
    | "cancelled";
  linked_change_order_id: string | null;
  required_by: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Invoice = {
  id: string;
  vessel_id: string;
  reference: string;
  purchase_order_id: string | null;
  contractor_id: string | null;
  amount: number;
  currency: string;
  status: "received" | "approved" | "disputed" | "paid" | "cancelled";
  received_at: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
};

export type Contractor = {
  id: string;
  name: string;
  trade: string | null;
  scope: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contract_value: number | null;
  insurance_expires_at: string | null;
  certifications: string | null;
  notes: string | null;
  status: "prospect" | "approved" | "active" | "suspended" | "terminated";
};

export type LogisticsItem = {
  id: string;
  vessel_id: string;
  kind: string;
  title: string;
  details: string | null;
  scheduled_at: string | null;
  responsible_id: string | null;
  contractor_id: string | null;
  status: "planned" | "booked" | "in_transit" | "arrived" | "completed" | "cancelled";
  cost: number | null;
  notes: string | null;
};

export type InventoryItem = {
  id: string;
  vessel_id: string;
  name: string;
  category: string | null;
  department_id: string | null;
  vessel_area_id: string | null;
  location: string | null;
  quantity: number;
  uom: string | null;
  min_quantity: number | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  warranty_expires_at: string | null;
  certificate_expires_at: string | null;
  status: "in_stock" | "low_stock" | "reorder" | "on_order" | "out_of_stock" | "retired";
  replacement_cost: number | null;
};

export type Meeting = {
  id: string;
  vessel_id: string;
  kind: string;
  title: string;
  scheduled_at: string | null;
  location: string | null;
  agenda: string | null;
  minutes: string | null;
  attendees: string | null;
};

export type MeetingAction = {
  id: string;
  meeting_id: string;
  vessel_id: string;
  title: string;
  detail: string | null;
  owner_id: string | null;
  due_date: string | null;
  status: "open" | "in_progress" | "blocked" | "done" | "cancelled";
};

export type Risk = {
  id: string;
  vessel_id: string;
  title: string;
  description: string | null;
  category: string | null;
  likelihood: number | null;
  impact: number | null;
  rating: number | null;
  mitigation: string | null;
  owner_id: string | null;
  due_date: string | null;
  status: "open" | "mitigating" | "accepted" | "closed";
  cost_impact: number | null;
  schedule_impact_days: number | null;
};

export type Comment = {
  id: string;
  parent_type: string;
  parent_id: string;
  vessel_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
};

export type Notification = {
  id: string;
  recipient_id: string;
  notification_type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  priority: "low" | "medium" | "high" | "critical" | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
};

/** A file version attached to a change order (`change_order_attachments`). */
export type ChangeOrderAttachment = {
  id: string;
  change_order_id: string;
  vessel_id: string;
  version: number;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  note: string | null;
  is_current: boolean;
  uploaded_by: string | null;
  created_at: string;
};

/** One row of the `v_pending_approvals` view: an item waiting on an approver. */
export type PendingApproval = {
  entity_type: "change_order" | "crew_request" | "purchase_order";
  entity_id: string;
  vessel_id: string;
  reference: string;
  title: string;
  stage: string;
  approver_id: string | null;
  priority: "low" | "medium" | "high" | "critical";
  cost_value: number | null;
  schedule_days: number | null;
  due_date: string | null;
  submitted_at: string;
};

/** Every pending Refit table, in the generated types' shape. */
export type RefitPendingTables = {
  rf_departments: PendingTable<Department, "code" | "name">;
  rf_vessel_areas: PendingTable<VesselArea, "vessel_id" | "code" | "name">;
  rf_cost_codes: PendingTable<CostCode, "code" | "name">;
  rf_change_orders: PendingTable<ChangeOrder, "vessel_id" | "reference" | "title">;
  rf_change_order_approvals: PendingTable<ChangeOrderApproval, "change_order_id" | "stage">;
  rf_crew_requests: PendingTable<CrewRequest, "vessel_id" | "reference" | "title">;
  rf_purchase_orders: PendingTable<PurchaseOrder, "vessel_id" | "reference" | "title">;
  rf_invoices: PendingTable<Invoice, "vessel_id" | "reference">;
  rf_contractors: PendingTable<Contractor, "name">;
  rf_logistics_items: PendingTable<LogisticsItem, "vessel_id" | "title">;
  rf_inventory_items: PendingTable<InventoryItem, "vessel_id" | "name">;
  rf_meetings: PendingTable<Meeting, "vessel_id" | "title">;
  rf_meeting_actions: PendingTable<MeetingAction, "meeting_id" | "vessel_id" | "title">;
  rf_risks: PendingTable<Risk, "vessel_id" | "title">;
  rf_request_comments: PendingTable<Comment, "parent_type" | "parent_id" | "author_id" | "body">;
  rf_notifications: PendingTable<Notification, "recipient_id" | "notification_type" | "title">;
  change_order_attachments: PendingTable<
    ChangeOrderAttachment,
    "change_order_id" | "vessel_id" | "version" | "file_path" | "file_name"
  >;
  // Read and written by the pages, columns not declared yet (UndeclaredRow).
  rf_activity_feed: PendingTable<UndeclaredRow>;
  rf_audit_log: PendingTable<UndeclaredRow>;
  rf_auth_diagnostics: PendingTable<UndeclaredRow>;
  rf_budget_items: PendingTable<UndeclaredRow>;
  rf_certifications: PendingTable<UndeclaredRow>;
  rf_documents: PendingTable<UndeclaredRow>;
  rf_drawing_revisions: PendingTable<UndeclaredRow>;
  rf_drawings: PendingTable<UndeclaredRow>;
  rf_milestones: PendingTable<UndeclaredRow>;
  rf_profiles: PendingTable<UndeclaredRow>;
  rf_schedule_items: PendingTable<UndeclaredRow>;
  rf_snags: PendingTable<UndeclaredRow>;
  rf_vessels: PendingTable<UndeclaredRow>;
  rf_works_orders: PendingTable<UndeclaredRow>;
};

/** Every pending Refit view. */
export type RefitPendingViews = {
  v_pending_approvals: PendingView<PendingApproval>;
};

/** Every pending Refit RPC. */
export type RefitPendingFunctions = {
  /** The next human-readable reference for a Refit record (`CO-…`, `CR-…`). */
  next_reference: {
    Args: { _vessel_id: string; _prefix: string; _table: string };
    Returns: string;
  };
};
