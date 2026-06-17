import { SimpleModulePage } from "@/modules/refit/components/SimpleModule";
import { StatusBadge, fmtDate, fmtMoney } from "@/modules/refit/components/ui-kit";
import type { InventoryItem } from "@/modules/refit/lib/db";

const CATEGORIES = [
  "spare",
  "tool",
  "consumable",
  "equipment",
  "lsa",
  "ffe",
  "av_it",
  "engineering",
  "deck",
  "interior",
  "galley",
  "medical",
  "dive",
];

