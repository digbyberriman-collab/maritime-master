export interface ParticularsField {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface ParticularsSection {
  id: string;
  title: string;
  fields: ParticularsField[];
}

/**
 * Vessel Particulars schema — modelled on the standard yacht
 * "Vessel Particulars" sheet (e.g. Draak particulars).
 * All fields are free-text so values like "92.88 m / 304'72" ft" are preserved.
 */
export const VESSEL_PARTICULARS_SECTIONS: ParticularsSection[] = [
  {
    id: 'vessel_details',
    title: 'Vessel Details',
    fields: [
      { key: 'call_sign', label: 'Call Sign' },
      { key: 'mmsi_number', label: 'MMSI Number' },
      { key: 'port_of_registry', label: 'Port of Registry' },
      { key: 'official_number', label: 'Official Number' },
    ],
  },
  {
    id: 'tonnage_weights_crew',
    title: 'Tonnage, Weights & Crew',
    fields: [
      { key: 'net_tonnage', label: 'Net Tonnage' },
      { key: 'crew', label: 'Crew' },
      { key: 'design_deadweight', label: 'Design Deadweight' },
      { key: 'passengers', label: 'Passengers' },
      { key: 'displacement_load_line', label: 'Displacement (Load Line)' },
      { key: 'max_pob', label: 'Max POB' },
      { key: 'lightship', label: 'Lightship' },
      { key: 'summer_draught', label: 'Summer Draught' },
      { key: 'summer_freeboard', label: 'Summer Freeboard' },
    ],
  },
  {
    id: 'build_design',
    title: 'Build & Design',
    fields: [
      { key: 'ship_builder', label: 'Ship Builder' },
      { key: 'keel_laid', label: 'Keel Laid' },
      { key: 'ship_design', label: 'Ship Design' },
      { key: 'number_of_decks', label: 'Number of Decks' },
      { key: 'interior_design', label: 'Interior Design' },
      { key: 'hull_material', label: 'Hull Material' },
      { key: 'exterior_design', label: 'Exterior Design' },
      { key: 'superstructure', label: 'Superstructure' },
    ],
  },
  {
    id: 'dimensions',
    title: 'Dimensions',
    fields: [
      { key: 'length_overall', label: 'Length Overall' },
      { key: 'breadth_overall', label: 'Breadth Overall' },
      { key: 'length_at_waterline', label: 'Length at Water Line' },
      { key: 'depth_mould', label: 'Depth Mould' },
      { key: 'length_between_perpendiculars', label: 'Length Btwn Perp.' },
      { key: 'max_draft', label: 'Max Draft' },
      { key: 'propulsion_type', label: 'Propulsion Type' },
      { key: 'air_draft', label: 'Air Draft' },
    ],
  },
  {
    id: 'performance_fuel',
    title: 'Performance & Fuel',
    fields: [
      { key: 'cruising_speed', label: 'Cruising Speed' },
      { key: 'maximum_speed', label: 'Maximum Speed' },
      { key: 'range', label: 'Range' },
      { key: 'fuel_used', label: 'Fuel Used' },
      { key: 'fuel_oil_capacity', label: 'Fuel Oil Capacity' },
      { key: 'lube_oil_tank', label: 'Lube Oil Tank' },
      { key: 'dirty_lube_oil_tank', label: 'Dirty Lube Oil Tank' },
      { key: 'gear_oil', label: 'Gear Oil' },
    ],
  },
  {
    id: 'machinery',
    title: 'Machinery',
    fields: [
      { key: 'engines', label: 'Engines', multiline: true },
      { key: 'gearbox', label: 'Gearbox' },
      { key: 'generators', label: 'Generators', multiline: true },
      { key: 'bow_thruster', label: 'Bow Thruster' },
      { key: 'emergency_generator', label: 'Emergency Generator' },
      { key: 'stern_thruster', label: 'Stern Thruster' },
      { key: 'propellers', label: 'Propellers', multiline: true },
      { key: 'stabilizers', label: 'Stabilizers' },
    ],
  },
  {
    id: 'electrical',
    title: 'Electrical',
    fields: [
      { key: 'total_vessel_electrical_power', label: 'Total Vessel Electrical Power' },
      { key: 'shore_power_converter', label: 'Shore Power Converter' },
      { key: 'generator_power', label: 'Generator Power' },
      { key: 'electrical_distribution', label: 'Electrical Distribution' },
    ],
  },
  {
    id: 'water_systems',
    title: 'Water Systems',
    fields: [
      { key: 'water_makers', label: 'Water Makers' },
      { key: 'water_capacity', label: 'Water Capacity' },
    ],
  },
  {
    id: 'classification',
    title: 'Classification',
    fields: [
      { key: 'classification', label: 'Classification', multiline: true },
    ],
  },
  {
    id: 'ownership',
    title: 'Ownership',
    fields: [
      { key: 'registered_owner', label: 'Registered Owner', multiline: true },
      { key: 'management_company', label: 'Management Company', multiline: true },
    ],
  },
];