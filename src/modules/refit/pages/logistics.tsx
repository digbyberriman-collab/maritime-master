import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDateTime, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { LogisticsItem } from "@/modules/refit/lib/db";

const KINDS = [
  "crew_travel",
  "contractor_travel",
  "yard_access",
  "delivery",
  "shipment",
  "customs",
  "courier",
  "accommodation",
  "transport",
  "crane",
  "dock",
  "tug",
  "pilot",
  "linesmen",
  "fuel",
  "waste",
  "provisioning",
  "guest",
  "other",
];

