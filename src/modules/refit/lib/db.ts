/**
 * Light typed wrappers over the Supabase client.
 *
 * The generated `Database` type in `integrations/supabase/types.ts` was
 * authored before the new module tables were added (change_orders,
 * crew_requests, purchase_orders, invoices, contractors, logistics_items,
 * inventory_items, meetings, meeting_actions, risks, departments,
 * vessel_areas, cost_codes, request_comments, attachments, role_permissions).
 *
 * Until the type file is regenerated against the live schema, we use loose
 * casts here so module code can stay fully typed at the call-site.
 */

import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = supabase as unknown as any;

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
