import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Anchor,
  Gauge,
  Ship,
  Weight,
  Ruler,
  FileText,
  TrendingUp,
  Waves,
  Info,
} from "lucide-react";
import {
  principalParticulars as pp,
  grossTonnage,
  speedRange,
  equipmentNumber,
  loadingConditions,
  lightshipWeight,
  hullWeight,
  freeboard,
  navalArchDocuments,
} from "@/data/naval-architecture-data";
// ── Glossary of naval architecture terms ──
const glossary: Record<string, string> = {
  "LOA": "Length Overall — the maximum length of the vessel from bow to stern.",
  "LWL": "Length at Waterline — the length of the hull measured at the waterline.",
  "Beam": "The width of the vessel at its widest point.",
  "Beam (moulded)": "The maximum breadth of the hull measured to the inside of the shell plating.",
  "Hull depth": "Vertical distance from the baseline (keel) to the upper deck.",
  "Frame spacing": "The distance between consecutive transverse frames in the hull structure.",
  "SLWL": "Summer Load Waterline — the maximum draught permitted in summer conditions per load line rules.",
  "Displacement": "The total weight of water displaced by the vessel, equal to the vessel's total weight.",
  "Displacement (SLWL)": "Total vessel weight when loaded to the Summer Load Waterline draught.",
  "Displacement (HL)": "Displacement at Half Load — vessel weight with 50% consumables (fuel, water, stores).",
  "GT": "Gross Tonnage — a measure of the vessel's total internal volume, not weight. Defined by the International Convention on Tonnage Measurement.",
  "GT (incl. overhangs)": "Gross Tonnage including overhanging deck areas (swim platforms, balconies, etc.).",
  "GT (excl. overhangs)": "Gross Tonnage excluding overhanging deck areas.",
  "Lightship": "The weight of the vessel as built, without fuel, water, stores, crew, or passengers.",
  "Deadweight": "The total weight the vessel can carry — fuel, water, stores, crew, passengers, and cargo. Equals displacement minus lightship weight.",
  "Equipment Number": "A calculated value (per Lloyd's Register rules) that determines the required size of anchors, cables, and mooring lines based on the vessel's dimensions and windage area.",
  "Freeboard": "The vertical distance from the waterline to the upper edge of the deck. Minimum freeboard is required by international safety regulations.",
  "Gross Tonnage": "A unitless measure of the vessel's total enclosed volume. Used for regulations, port fees, and manning requirements.",
  "Top Speed": "Maximum speed achievable at 100% of the pod propulsion Maximum Continuous Rating (MCR).",
  "Range": "The maximum distance the vessel can travel at a given speed on a given fuel load.",
  "Complement": "Total number of people the vessel is designed to carry (crew + guests).",
  "Classification": "The classification society (e.g. Lloyd's Register) that certifies the vessel meets structural and safety standards.",
  "Δ": "Delta — displacement, the total weight of the vessel in tonnes for a given loading condition.",
  "T_LCF": "Draught at the Longitudinal Centre of Flotation — the effective mean draught of the vessel.",
  "Trim": "The difference in draught between bow and stern. Positive = stern deeper (by the stern).",
  "Heel": "The static transverse inclination of the vessel, measured in degrees.",
  "LCG": "Longitudinal Centre of Gravity — horizontal position of the vessel's centre of mass, measured from the aft perpendicular.",
  "VCG(f)": "Vertical Centre of Gravity (fluid) — height of the centre of mass above baseline, corrected for free surface effects of liquids in tanks.",
  "GMt(f)": "Transverse Metacentric Height (fluid) — a key measure of initial stability. Higher = stiffer (more resistant to rolling). Corrected for free surface effects.",
  "Roll": "Natural roll period — the time in seconds for one complete side-to-side oscillation. Related to stability and comfort.",
  "P_D": "Delivered Power — the total power delivered to the propulsors (pods), measured in kilowatts.",
  "MCR": "Maximum Continuous Rating — the maximum power output a propulsion system can sustain continuously.",
  "WHR": "Waste Heat Recovery — a system that captures engine exhaust heat to generate additional electrical power, reducing fuel consumption.",
  "Hotel load": "The electrical power consumed by all non-propulsion systems (lighting, HVAC, galley, entertainment, etc.).",
  "Hotel load (WHR)": "Hotel load with Waste Heat Recovery active — reduces the generator fuel consumption by recovering energy from engine exhaust.",
  "Pod": "An azimuthing propulsion unit mounted below the hull that can rotate 360°, combining propeller and electric motor in one steerable unit.",
  "Pods": "Azimuthing electric propulsion units mounted under the hull. They rotate 360° to steer and propel the vessel.",
  "Generators": "Diesel generator sets that produce electrical power for propulsion motors, hotel systems, and all onboard equipment.",
  "FLWL": "Full Load Waterline — the waterline when the vessel is at maximum displacement.",
  "Hull below FLWL": "The hull volume below the full-load waterline — the submerged portion.",
  "Loadline length": "The length used in freeboard calculations, measured per the International Convention on Load Lines.",
  "EN": "Equipment Number (Numeral) — see Equipment Number.",
  "Band": "Equipment Number Band — a classification range that determines the minimum required anchor and mooring equipment sizes.",
  "Profile area": "The projected lateral area of the vessel above the waterline, used in equipment number and wind load calculations.",
  "Class II": "Lloyd's Register structural class — defines the level of structural survey and scantling requirements.",
  "Density": "Structural density — the weight of steel per unit volume of hull, indicating how heavily built a section is.",
  "TCG": "Transverse Centre of Gravity — the lateral position of the centre of mass. Ideally 0 (centred).",
  "VCG": "Vertical Centre of Gravity — the height of the centre of mass above the baseline.",
  "Contract fuel load": "The fuel quantity specified in the build contract for performance guarantees.",
  "Max fuel capacity": "The maximum amount of fuel the vessel's tanks can physically hold.",
  "Guest cruise speed": "The typical cruising speed during owner/guest use, balancing comfort and fuel efficiency.",
  "Crew cruise speed": "The cruising speed during delivery or repositioning voyages with crew only (slightly higher due to lower displacement).",
  "ICLL": "International Convention on Load Lines (1966/88) — sets minimum freeboard requirements for seagoing vessels.",
  "MARIN": "Maritime Research Institute Netherlands — a world-leading hydrodynamic test facility where hull models are tested for resistance and propulsion.",
};

/** Renders text with a dotted underline and tooltip if found in glossary, plain text otherwise. */
let _showDefs = true;
function Term({ children }: { children: string }) {
  const def = glossary[children];
  if (!def || !_showDefs) return <>{children}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="underline decoration-dotted decoration-muted-foreground/50 underline-offset-2 cursor-help">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-sm">
        {def}
      </TooltipContent>
    </Tooltip>
  );
}

export default function NavalArchitecture() {
  const [activeTab, setActiveTab] = useState("overview");
  const [showDefinitions, setShowDefinitions] = useState(true);
  _showDefs = showDefinitions;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            Naval Architecture
          </h1>
          <p className="text-muted-foreground mt-1">
            Y727 — Lateral Naval Architects calculations & technical data
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowDefinitions((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${showDefinitions ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border hover:bg-accent"}`}
        >
          <Info className="h-3.5 w-3.5" />
          {showDefinitions ? "Definitions on" : "Definitions off"}
        </button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="loading">Loading Conditions</TabsTrigger>
          <TabsTrigger value="speed">Speed & Range</TabsTrigger>
          <TabsTrigger value="weight">Weight</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ── */}
        <TabsContent value="overview" className="space-y-6">
          {/* Key metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={Ship} label="LOA" value={`${pp.loa} m`} sub={`LWL ${pp.lwl} m`} />
            <MetricCard icon={Ruler} label="Beam" value={`${pp.beam_moulded} m`} sub={`Depth ${pp.hull_depth} m`} />
            <MetricCard icon={Gauge} label="Top Speed" value={`${speedRange.top_speed_kn} kn`} sub={`Contract ${speedRange.contract_top_speed_kn} kn`} />
            <MetricCard icon={TrendingUp} label="Range @ 13kn" value={`${speedRange.range_at_13kn_500t.toLocaleString()} nm`} sub={`${speedRange.contract_fuel_t}t fuel`} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard icon={Weight} label="Lightship" value={`${lightshipWeight.margined_t.toLocaleString()} t`} sub={`${lightshipWeight.margin_pct}% margin`} />
            <MetricCard icon={Anchor} label="Displacement (SLWL)" value={`${pp.displacement_slwl.toLocaleString()} t`} sub={`Draught ${pp.slwl_draught} m`} />
            <MetricCard
              icon={Waves}
              label="Gross Tonnage"
              value={grossTonnage.gt_incl_overhangs.toLocaleString()}
              sub={`Excl. overhang ${grossTonnage.gt_excl_overhangs.toLocaleString()}`}
            />
            <MetricCard
              icon={Anchor}
              label="Equipment Number"
              value={equipmentNumber.en.toString()}
              sub={`Band ${equipmentNumber.en_band}`}
            />
          </div>

          {/* Principal Particulars */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Principal Particulars</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 text-sm">
                <ParticularRow label="LOA" value={`${pp.loa} m`} />
                <ParticularRow label="LWL" value={`${pp.lwl} m`} />
                <ParticularRow label="Beam (moulded)" value={`${pp.beam_moulded} m`} />
                <ParticularRow label="Hull depth" value={`${pp.hull_depth} m`} />
                <ParticularRow label="Frame spacing" value={`${pp.frame_spacing} m`} />
                <ParticularRow label="SLWL draught" value={`${pp.slwl_draught} m`} />
                <ParticularRow label="Displacement (SLWL)" value={`${pp.displacement_slwl.toLocaleString()} t`} />
                <ParticularRow label="Displacement (HL)" value={`${pp.displacement_half_load.toLocaleString()} t`} />
                <ParticularRow label="GT (incl. overhangs)" value={pp.gt_incl_overhangs.toLocaleString()} />
                <ParticularRow label="GT (excl. overhangs)" value={pp.gt_excl_overhangs.toLocaleString()} />
                <ParticularRow label="Complement" value={`${pp.complement} (${pp.crew} crew + ${pp.guests} guests)`} />
                <ParticularRow label="Classification" value="Lloyd's Register" />
              </div>
            </CardContent>
          </Card>

          {/* Freeboard & Equipment Number side by side */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Waves className="h-4 w-4" /> <Term>Freeboard</Term>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Required freeboard</span>
                  <span className="font-mono font-medium">{freeboard.required_mm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Actual freeboard</span>
                  <span className="font-mono font-medium text-green-600">{freeboard.actual_mm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Margin</span>
                  <span className="font-mono font-medium text-green-600">+{freeboard.actual_mm - freeboard.required_mm} mm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><Term>Loadline length</Term></span>
                  <span className="font-mono">{freeboard.loadline_length} m</span>
                </div>
                <Badge variant="outline" className="text-xs mt-2">
                  {freeboard.report} · {freeboard.date}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Anchor className="h-4 w-4" /> <Term>Equipment Number</Term>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><Term>EN</Term> (LR Ship Rules)</span>
                  <span className="font-mono font-medium text-lg">{equipmentNumber.en}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><Term>Band</Term></span>
                  <Badge>{equipmentNumber.en_band}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground"><Term>Profile area</Term></span>
                  <span className="font-mono">{equipmentNumber.profile_area} m² (+{equipmentNumber.profile_area_margin})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Anchors</span>
                  <span className="font-mono">{equipmentNumber.anchors.number} × {equipmentNumber.anchors.mass_kg.toLocaleString()} kg</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mooring lines</span>
                  <span className="font-mono">{equipmentNumber.mooring_lines.number} × {equipmentNumber.mooring_lines.length_m} m</span>
                </div>
                <Badge variant="outline" className="text-xs mt-2">
                  {equipmentNumber.report} · {equipmentNumber.date}
                </Badge>
              </CardContent>
            </Card>
          </div>

          {/* GT Volume Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Waves className="h-4 w-4" /> <Term>Gross Tonnage</Term> Volume Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-medium text-sm mb-2">Hull ({grossTonnage.hull_volume.toLocaleString()} m³)</h4>
                  {grossTonnage.volumes.filter((_, i) => i < 4).map(v => (
                    <div key={v.name} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{v.name}</span>
                      <span className="font-mono">{v.value.toLocaleString()} m³</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-2">Superstructure ({grossTonnage.superstructure_volume.toLocaleString()} m³)</h4>
                  {grossTonnage.volumes.filter((_, i) => i >= 4 && i < 9).map(v => (
                    <div key={v.name} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{v.name}</span>
                      <span className="font-mono">{v.value.toLocaleString()} m³</span>
                    </div>
                  ))}
                </div>
                <div>
                  <h4 className="font-medium text-sm mb-2">Additional ({grossTonnage.additional_volume.toLocaleString()} m³)</h4>
                  {grossTonnage.volumes.filter((_, i) => i >= 9).map(v => (
                    <div key={v.name} className="flex justify-between text-xs py-1 border-b border-border/50">
                      <span className="text-muted-foreground">{v.name}</span>
                      <span className="font-mono">{v.value.toLocaleString()} m³</span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── LOADING CONDITIONS TAB ── */}
        <TabsContent value="loading" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Design Loading Conditions</CardTitle>
              <p className="text-sm text-muted-foreground">Report 833-59 Issue A · 27/03/2026 · Lateral Naval Architects</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Condition</TableHead>
                    <TableHead className="text-right"><Term>Δ</Term> [t]</TableHead>
                    <TableHead className="text-right"><Term>T_LCF</Term> [m]</TableHead>
                    <TableHead className="text-right"><Term>Trim</Term> [°]</TableHead>
                    <TableHead className="text-right"><Term>Heel</Term> [°]</TableHead>
                    <TableHead className="text-right"><Term>LCG</Term> [m]</TableHead>
                    <TableHead className="text-right"><Term>VCG(f)</Term> [m]</TableHead>
                    <TableHead className="text-right"><Term>GMt(f)</Term> [m]</TableHead>
                    <TableHead className="text-right"><Term>Roll</Term> [s]</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingConditions.map((lc) => (
                    <TableRow key={lc.name}>
                      <TableCell className="font-medium">{lc.name}</TableCell>
                      <TableCell className="text-right font-mono">{lc.displacement.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">{lc.draught.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.trim_deg.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.heel_deg.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.lcg.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.vcg_f.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.gmt_f.toFixed(3)}</TableCell>
                      <TableCell className="text-right font-mono">{lc.roll_period?.toFixed(1) ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Deck Heights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deck Heights (from Equipment Number)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  {equipmentNumber.deck_heights.map((dh) => (
                    <div key={dh.label} className="flex justify-between text-sm py-1.5 border-b border-border/50">
                      <span className="text-muted-foreground">{dh.label}</span>
                      <span className="font-mono">{dh.height.toFixed(3)} m</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm py-1.5 font-medium">
                    <span>Total height</span>
                    <span className="font-mono">{equipmentNumber.total_height.toFixed(3)} m</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── SPEED & RANGE TAB ── */}
        <TabsContent value="speed" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <MetricCard icon={Gauge} label="Top Speed" value={`${speedRange.top_speed_kn} kn`} sub="@ 100% Pod MCR" />
            <MetricCard icon={TrendingUp} label="Range (500t fuel)" value={`${speedRange.range_at_13kn_500t.toLocaleString()} nm`} sub="@ 13 kn with WHR" />
            <MetricCard icon={TrendingUp} label="Range (max fuel)" value={`${speedRange.range_at_13kn_max_fuel.toLocaleString()} nm`} sub={`@ 13 kn · ${speedRange.max_fuel_capacity_t}t fuel`} />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Speed-Power Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Speed–Power Curve</CardTitle>
                <p className="text-xs text-muted-foreground">Half Load = {pp.displacement_half_load.toLocaleString()}t · {speedRange.pods}</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Speed [kn]</TableHead>
                      <TableHead className="text-right"><Term>P_D</Term> [kW]</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speedRange.speed_power.map((sp) => (
                      <TableRow key={sp.speed}>
                        <TableCell className="font-mono">{sp.speed.toFixed(2)}</TableCell>
                        <TableCell className="text-right font-mono">{sp.power.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{sp.label ?? ""}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Range Table */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Range Prediction (500t fuel)</CardTitle>
                <p className="text-xs text-muted-foreground">Guest cruise with WHR ({speedRange.hotel_load_whr_kw} kW) · {speedRange.generators}</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Speed [kn]</TableHead>
                      <TableHead className="text-right">Range [nm]</TableHead>
                      <TableHead className="text-right">Fuel [L/hr]</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {speedRange.range_500t.map((rp) => (
                      <TableRow key={rp.speed} className={rp.speed === 13 ? "bg-primary/5 font-medium" : ""}>
                        <TableCell className="font-mono">{rp.speed.toFixed(1)}</TableCell>
                        <TableCell className="text-right font-mono">{rp.range.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-mono">{rp.fuel_consumption.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Propulsion info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Propulsion & Power</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <ParticularRow label="Pods" value={speedRange.pods} />
                <ParticularRow label="Generators" value={speedRange.generators} />
                <ParticularRow label="Hotel load (WHR)" value={`${speedRange.hotel_load_whr_kw} kW`} />
                <ParticularRow label="Contract fuel load" value={`${speedRange.contract_fuel_t} t`} />
                <ParticularRow label="Max fuel capacity" value={`${speedRange.max_fuel_capacity_t} t`} />
                <ParticularRow label="Fuel for 6,000nm" value={`${speedRange.fuel_for_6000nm_m3} m³ (399t)`} />
                <ParticularRow label="Guest cruise speed" value={`${speedRange.guest_cruise_speed} kn @ 77% MCR`} />
                <ParticularRow label="Crew cruise speed" value={`${speedRange.crew_cruise_speed} kn @ 79% MCR`} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WEIGHT TAB ── */}
        <TabsContent value="weight" className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <MetricCard icon={Weight} label="Lightship Weight" value={`${lightshipWeight.margined_t.toLocaleString()} t`} sub={`Unmargined ${lightshipWeight.unmargined_t.toLocaleString()}t · ${lightshipWeight.margin_pct}% margin`} />
            <MetricCard icon={Weight} label="Hull Steel (Class II)" value={`${hullWeight.class_2.margined_t.toLocaleString()} t`} sub={`Unmargined ${hullWeight.class_2.unmargined_t.toLocaleString()}t · ${hullWeight.class_2.margin_pct}% margin`} />
            <MetricCard icon={Weight} label="Deadweight (at SLWL)" value={`${(pp.displacement_slwl - lightshipWeight.margined_t).toLocaleString()} t`} sub="SLWL displacement − lightship" />
          </div>

          {/* Hull Weight Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hull Weight Breakdown (<Term>Class II</Term>)</CardTitle>
              <p className="text-sm text-muted-foreground">{hullWeight.report} · {hullWeight.date}</p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Unmargined [t]</TableHead>
                    <TableHead className="text-right">Margined [t]</TableHead>
                    <TableHead className="text-right"><Term>Density</Term> [kg/m³]</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hullWeight.breakdown.map((b) => (
                    <TableRow key={b.section}>
                      <TableCell className="font-medium">{b.section}</TableCell>
                      <TableCell className="text-right font-mono">{b.unmargined.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">{b.margined.toFixed(1)}</TableCell>
                      <TableCell className="text-right font-mono">{b.density}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2 font-medium">
                    <TableCell>Total</TableCell>
                    <TableCell className="text-right font-mono">{hullWeight.class_2.unmargined_t.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono">{hullWeight.class_2.margined_t.toFixed(1)}</TableCell>
                    <TableCell className="text-right font-mono">{hullWeight.class_2.density_kg_m3}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Weight COG */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Centres of Gravity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-sm">
                <div>
                  <h4 className="font-medium mb-2"><Term>Lightship</Term></h4>
                  <ParticularRow label="LCG" value={`${lightshipWeight.lcg} m`} />
                  <ParticularRow label="TCG" value={`${lightshipWeight.tcg} m`} />
                </div>
                <div>
                  <h4 className="font-medium mb-2">Hull Steel (<Term>Class II</Term>)</h4>
                  <ParticularRow label="LCG" value={`${hullWeight.class_2.lcg} m`} />
                  <ParticularRow label="VCG" value={`${hullWeight.class_2.vcg} m`} />
                  <ParticularRow label="TCG" value={`${hullWeight.class_2.tcg} m`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── DOCUMENTS TAB ── */}
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-4 w-4" /> Source Documents
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                All naval architecture data is sourced from the following Lateral Naval Architects reports for Y727.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {navalArchDocuments.map((doc) => (
                  <div
                    key={doc.id}
                    className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="rounded-md bg-primary/10 p-2 mt-0.5 shrink-0">
                          <FileText className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-medium leading-tight">{doc.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">{doc.description}</p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                            <span className="font-mono">{doc.oceanco_ref}</span>
                            <span>Report {doc.report}</span>
                            <span>{doc.author}</span>
                            <span>{doc.date}</span>
                          </div>
                        </div>
                      </div>
                      <Badge variant="outline" className="shrink-0">
                        Issue {doc.issue}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <Icon className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground"><Term>{label}</Term></p>
            <p className="text-xl font-bold font-mono leading-tight">{value}</p>
            <p className="text-xs text-muted-foreground truncate">{sub}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ParticularRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-border/40">
      <span className="text-muted-foreground"><Term>{label}</Term></span>
      <span className="font-mono text-right">{value}</span>
    </div>
  );
}
