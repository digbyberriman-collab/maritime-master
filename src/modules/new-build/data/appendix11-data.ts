/**
 * Pre-parsed data from Y727 Appendix 11 — Owner's Decision & Deliverables Schedule Rev. E
 * Each item represents a line from the schedule tables.
 */
export interface Appendix11Item {
  chapter_number: number;
  chapter_name: string;
  description: string;
  builder_info_date: string | null;
  owner_decision_date: string | null;
  delivery_by_owner: string | null;
  sort_order: number;
}

export const appendix11Data: Appendix11Item[] = [
  // Ch 1 — General Arrangement
  { chapter_number: 1, chapter_name: "General Arrangement", description: "Conclusion of the GA in relation to minor structural partitions and location of exterior staircases", builder_info_date: "Defined under interior design – Nett Space", owner_decision_date: "Defined under interior design – Nett Space", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 1, chapter_name: "General Arrangement", description: "Conclusion of the GA in relation to sanitary location", builder_info_date: "Defined under interior design – Phase 1", owner_decision_date: "Defined under interior design – Phase 1", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 1, chapter_name: "General Arrangement", description: "Conclusion of interior furniture layout of luxury spaces", builder_info_date: null, owner_decision_date: "Defined under interior design – Phase 3", delivery_by_owner: null, sort_order: 3 },

  // Ch 2 — Specification
  { chapter_number: 2, chapter_name: "Specification", description: "Conclusion of the Logic Plus System diagrams", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 2, chapter_name: "Specification", description: "Tank plan", builder_info_date: "Done", owner_decision_date: "Wk16-2026", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 2, chapter_name: "Specification", description: "Functional descriptions — Batch 1", builder_info_date: "Wk18-2026", owner_decision_date: "Wk20-2026", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 2, chapter_name: "Specification", description: "Functional descriptions — Batch 2", builder_info_date: "Wk20-2026", owner_decision_date: "Wk22-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 2, chapter_name: "Specification", description: "Functional descriptions — Batch 3", builder_info_date: "Wk22-2026", owner_decision_date: "Wk24-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 2, chapter_name: "Specification", description: "Functional descriptions — Batch 4", builder_info_date: "Wk24-2026", owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 2, chapter_name: "Specification", description: "System diagram — package 1: 710, 720, 810-01, 810-02, 857", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 7 },
  { chapter_number: 2, chapter_name: "Specification", description: "System diagram — package 2: 730, 735, 750, 764 & 780", builder_info_date: "Done", owner_decision_date: "Wk16-2026", delivery_by_owner: null, sort_order: 8 },
  { chapter_number: 2, chapter_name: "Specification", description: "System diagram — package 3: 760, 765, 770, 870, 875 & 880", builder_info_date: "Wk16-2026", owner_decision_date: "Wk18-2026", delivery_by_owner: null, sort_order: 9 },
  { chapter_number: 2, chapter_name: "Specification", description: "System diagram — package 4: 890-02", builder_info_date: "Wk20-2026", owner_decision_date: "Wk22-2026", delivery_by_owner: null, sort_order: 10 },
  { chapter_number: 2, chapter_name: "Specification", description: "System diagram — package 4: 890-01", builder_info_date: "Wk28-2026", owner_decision_date: "Wk29-2026", delivery_by_owner: null, sort_order: 11 },
  { chapter_number: 2, chapter_name: "Specification", description: "HVAC diagram & technical specification 360 & 363", builder_info_date: "Done", owner_decision_date: "Wk16-2026", delivery_by_owner: null, sort_order: 12 },
  { chapter_number: 2, chapter_name: "Specification", description: "Yard Standards selection", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 13 },

  // Ch 3 — Outfit Development Concept Studies and Arrangements
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Anchor and mooring (CTW)", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Special features: Tender Cranes and cradles (allowance)", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Special features: Yacht to yacht & Passarelle (WtW) (allowance)", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Special features: Xiphias tender pole (allowance)", builder_info_date: "Done", owner_decision_date: "Done", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Special features: Hyperbaric chamber — requirements & specification", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 3, chapter_name: "Outfit Development", description: "Special features: Hyperbaric Chamber — Equipment and Arrangement", builder_info_date: "Wk21-2026", owner_decision_date: "Wk23-2026", delivery_by_owner: null, sort_order: 6 },

  // Ch 4 — Interior Design (Allowance)
  { chapter_number: 4, chapter_name: "Interior Design", description: "Interior Designer selection", builder_info_date: null, owner_decision_date: "CS", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Tank deck — Equipment plan Nett space", builder_info_date: "Wk7-2026", owner_decision_date: "Wk9-2026", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Tank deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk9-2026", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Tank deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk24-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Tank deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk44-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Tank deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk04-2027", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Lower deck — Equipment plan Nett space", builder_info_date: "Wk8-2026", owner_decision_date: "Wk10-2026", delivery_by_owner: null, sort_order: 7 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Lower deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk10-2026", delivery_by_owner: null, sort_order: 8 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Lower deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 9 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Lower deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk46-2026", delivery_by_owner: null, sort_order: 10 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Lower deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk04-2027", delivery_by_owner: null, sort_order: 11 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Main deck — Equipment plan Nett space", builder_info_date: "Wk10-2026", owner_decision_date: "Wk12-2026", delivery_by_owner: null, sort_order: 12 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Main deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk12-2026", delivery_by_owner: null, sort_order: 13 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Main deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk28-2026", delivery_by_owner: null, sort_order: 14 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Main deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk48-2026", delivery_by_owner: null, sort_order: 15 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Main deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk04-2027", delivery_by_owner: null, sort_order: 16 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Upper deck — Equipment plan Nett space", builder_info_date: "Wk13-2026", owner_decision_date: "Wk15-2026", delivery_by_owner: null, sort_order: 17 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Upper deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk15-2026", delivery_by_owner: null, sort_order: 18 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Upper deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk29-2026", delivery_by_owner: null, sort_order: 19 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Upper deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk51-2026", delivery_by_owner: null, sort_order: 20 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Upper deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk10-2027", delivery_by_owner: null, sort_order: 21 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Officers deck — Equipment plan Nett space", builder_info_date: "Wk15-2026", owner_decision_date: "Wk17-2026", delivery_by_owner: null, sort_order: 22 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Officers deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk17-2026", delivery_by_owner: null, sort_order: 23 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Officers deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk37-2026", delivery_by_owner: null, sort_order: 24 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Officers deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk01-2027", delivery_by_owner: null, sort_order: 25 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Officers deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk10-2027", delivery_by_owner: null, sort_order: 26 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Bridge deck — Equipment plan Nett space", builder_info_date: "Wk17-2026", owner_decision_date: "Wk19-2026", delivery_by_owner: null, sort_order: 27 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Bridge deck — Phase 1 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk19-2026", delivery_by_owner: null, sort_order: 28 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Bridge deck — Phase 2 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk37-2026", delivery_by_owner: null, sort_order: 29 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Bridge deck — Phase 3 (Studio Liaigre)", builder_info_date: null, owner_decision_date: "Wk05-2027", delivery_by_owner: null, sort_order: 30 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Bridge deck — Start Interior workshop drawings", builder_info_date: null, owner_decision_date: "Wk10-2027", delivery_by_owner: null, sort_order: 31 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Crew cabin material mock-up — Selection of cabin & main materials", builder_info_date: null, owner_decision_date: "Wk18-2026", delivery_by_owner: null, sort_order: 32 },
  { chapter_number: 4, chapter_name: "Interior Design", description: "Crew cabin material mock-up — Final material selection", builder_info_date: null, owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 33 },

  // Ch 5 — Deck Finishing
  { chapter_number: 5, chapter_name: "Deck Finishing", description: "Confirmation on application exterior deck finishing and required thickness", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 5, chapter_name: "Deck Finishing", description: "Deck Design incl. gutter location", builder_info_date: "Defined under Exterior Design 3D Model rev J", owner_decision_date: "Defined under Exterior Design 3D Model rev J", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 5, chapter_name: "Deck Finishing", description: "Exterior design pattern within deck finishing and samples", builder_info_date: "TBD", owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 3 },

  // Ch 6 — Exterior Fixed and Loose Furniture (Allowance)
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Confirmation on position, dimensions and shape of exterior furniture for foundations (incl. piping & electrical)", builder_info_date: "Wk45-2026", owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Material definition and design of fixed exterior and integrated furniture", builder_info_date: null, owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Material definition and design of loose exterior furniture", builder_info_date: null, owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Pool outfitting and finishing", builder_info_date: "Wk45-2026", owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Pool system", builder_info_date: "Wk18-2026", owner_decision_date: "Wk20-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Selection of suppliers and conclusion of allowance (YBA)", builder_info_date: null, owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 6, chapter_name: "Exterior Furniture", description: "Design of exterior cushions and covers", builder_info_date: null, owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 7 },

  // Ch 7 — Entertainment, IT & VoIP System
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "System requirements — definition of functionality and requirements", builder_info_date: null, owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Supplier Selection", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Conclusion allowance (pre-engineering package)", builder_info_date: null, owner_decision_date: "Wk40-2026", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Interior: AV items — general type selected (for spaces reservation)", builder_info_date: null, owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Exterior: AV items — general type selected (for spaces reservation)", builder_info_date: null, owner_decision_date: "Wk41-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Final model selection on speakers and subwoofers", builder_info_date: null, owner_decision_date: "2027 (TBD)", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Final TV and consumer equipment model selection", builder_info_date: null, owner_decision_date: "2029 (TBD)", delivery_by_owner: null, sort_order: 7 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "Decision on type of touch-panels (part of contract)", builder_info_date: null, owner_decision_date: "Wk38-2026", delivery_by_owner: null, sort_order: 8 },
  { chapter_number: 7, chapter_name: "Entertainment, IT & VoIP", description: "GUI Proposal for touch-panels", builder_info_date: "2029 (TBD)", owner_decision_date: "2029 (TBD)", delivery_by_owner: null, sort_order: 9 },

  // Ch 8 — Navigation & Communication System
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Equipment selection bottom elements", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "System requirements — definition of functionality and requirements", builder_info_date: null, owner_decision_date: "Wk20-2026", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Supplier Selection", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Conclusion Allowance (pre-engineering package)", builder_info_date: null, owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Exterior: NavCom items", builder_info_date: null, owner_decision_date: "Wk41-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Interior: NavCom items", builder_info_date: null, owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Wheelhouse console arrangement (input for Interior Design)", builder_info_date: "Wk44-2026", owner_decision_date: "Wk46-2026", delivery_by_owner: null, sort_order: 7 },
  { chapter_number: 8, chapter_name: "Navigation & Communication", description: "Mast equipment arrangement proposal", builder_info_date: "Wk44-2026", owner_decision_date: "Wk46-2026", delivery_by_owner: null, sort_order: 8 },

  // Ch 9 — Security System
  { chapter_number: 9, chapter_name: "Security System", description: "System requirements — definition of functionality and requirements", builder_info_date: null, owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 9, chapter_name: "Security System", description: "Supplier Selection", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 9, chapter_name: "Security System", description: "Conclusion allowance (pre-engineering package)", builder_info_date: null, owner_decision_date: "Wk37-2026", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 9, chapter_name: "Security System", description: "Interior: Security items — cameras etc. general type selected", builder_info_date: null, owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 9, chapter_name: "Security System", description: "Exterior: Security items — cameras etc. general type selected", builder_info_date: null, owner_decision_date: "Wk41-2026", delivery_by_owner: null, sort_order: 5 },

  // Ch 14 — Paint Application
  { chapter_number: 14, chapter_name: "Paint Application", description: "Confirmation of colour scheme for HVAC design purpose", builder_info_date: null, owner_decision_date: "Done", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 14, chapter_name: "Paint Application", description: "Confirmation of exterior paint plan", builder_info_date: "Wk09-2027", owner_decision_date: "Wk11-2027", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 14, chapter_name: "Paint Application", description: "Decision for exterior paint applicator as per makers list selection", builder_info_date: "TBD", owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 14, chapter_name: "Paint Application", description: "Conclude exterior paint inspection and approval procedures", builder_info_date: "TBD", owner_decision_date: "TBD", delivery_by_owner: null, sort_order: 4 },

  // Ch 15 — Exterior Design
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev H — Windows, portholes, skylights, Crow's Nest roof, MES, Bridge Deck bulkhead, staircases, bulwark, galley ducts", builder_info_date: "Wk10-2026", owner_decision_date: "Wk12-2026", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev J — Main Deck aft lounge, Wintergarden, Wheelhouse, Bridge Deck roof, Crow's Nest deckhouse, fairleads, deck design, staircases, ventilation, transom, swim platform", builder_info_date: "Wk19-2026", owner_decision_date: "Wk23-2026", delivery_by_owner: null, sort_order: 2 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev K — Observation lounge, ship's name & logo, LSA, passarelle, exterior ceilings, staircases, showers, rubrails, sailtracks, flag staff, helicopter deck", builder_info_date: "Wk28-2026", owner_decision_date: "Wk29-2026", delivery_by_owner: null, sort_order: 3 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev L — Observation lounge, exterior ceilings, basketball windscreens, wind breaks, sun awnings (fixed & removable)", builder_info_date: "Wk37-2026", owner_decision_date: "Wk40-2026", delivery_by_owner: null, sort_order: 4 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev M — Exterior furniture (position, dimensions, foundations), navigation lights, jack staff", builder_info_date: "Wk45-2026", owner_decision_date: "Wk49-2026", delivery_by_owner: null, sort_order: 5 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev N — Railing / glass railing details, fwd mast design", builder_info_date: "Wk50-2026", owner_decision_date: "Wk02-2027", delivery_by_owner: null, sort_order: 6 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev P — Funnel, aft mast, ship's name/logo details, pillar cladding & lighting, flag staff details", builder_info_date: "Wk09-2027", owner_decision_date: "Wk11-2027", delivery_by_owner: null, sort_order: 7 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "3D Model rev Q — Deck pattern design", builder_info_date: "Wk19-2027", owner_decision_date: "Wk21-2027", delivery_by_owner: null, sort_order: 8 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Railing design — design intent (stanchion positions, glass recesses, bulwark extension) & technical details", builder_info_date: "Wk28-2026", owner_decision_date: "Wk29-2026", delivery_by_owner: null, sort_order: 9 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Gutter in dodger details", builder_info_date: "Wk44-2026", owner_decision_date: "Wk46-2026", delivery_by_owner: null, sort_order: 10 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Pool design (dimensions, stairs, seating, gutter)", builder_info_date: "Wk37-2026", owner_decision_date: "Wk39-2026", delivery_by_owner: null, sort_order: 11 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Life raft storage implemented in the design", builder_info_date: "Wk24-2026", owner_decision_date: "Wk26-2026", delivery_by_owner: null, sort_order: 12 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Side navigation lights design integration", builder_info_date: "Wk40-2026", owner_decision_date: "Wk42-2026", delivery_by_owner: null, sort_order: 13 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Remaining exterior outfitting — hot work-related hull", builder_info_date: "Wk09-2027", owner_decision_date: "Wk11-2027", delivery_by_owner: null, sort_order: 14 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Remaining exterior outfitting — hot work-related superstructure", builder_info_date: "Wk09-2027", owner_decision_date: "Wk11-2027", delivery_by_owner: null, sort_order: 15 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Renderings of exterior design incl. typical exterior details booklet", builder_info_date: "Wk19-2027", owner_decision_date: "Wk21-2027", delivery_by_owner: null, sort_order: 16 },
  { chapter_number: 15, chapter_name: "Exterior Design", description: "Helicopter deck layout — securing arrangement", builder_info_date: "Wk28-2026", owner_decision_date: "Wk29-2026", delivery_by_owner: null, sort_order: 17 },

  // Ch 16 — Mast / Casing Development
  { chapter_number: 16, chapter_name: "Mast / Casing Development", description: "Approval of mast design for wind tunnel testing", builder_info_date: "Wk09-2027", owner_decision_date: "Wk11-2027", delivery_by_owner: null, sort_order: 1 },
  { chapter_number: 16, chapter_name: "Mast / Casing Development", description: "Approval final shape for construction engineering", builder_info_date: "4 wks after windtunnel test", owner_decision_date: "8 wks after windtunnel test", delivery_by_owner: null, sort_order: 2 },
];

/**
 * Parse "WkNN-YYYY" or "WkN-YYYY" into a Date (Monday of that ISO week).
 * Returns null if not parseable.
 */
export function parseWeekDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.match(/[Ww]k\s?(\d{1,2})-(\d{4})/);
  if (!m) return null;
  const week = parseInt(m[1], 10);
  const year = parseInt(m[2], 10);
  // ISO week 1 contains Jan 4
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Mon=1..Sun=7
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
  return monday;
}
