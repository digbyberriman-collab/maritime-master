/**
 * M/Y DAGON engine room daily log sheet.
 *
 * Mirrors the vessel's existing "ENGINEROOM LOG DAGON" spreadsheet so the duty
 * engineer records the same readings, in the same order, as the paper sheet.
 * Every reading is stored in the logbook entry's flexible `data` column under
 * the key `${sectionId}.${rowKey}.${columnKey}`.
 */

export interface SheetColumn {
  key: string;
  label: string;
}

export interface SheetRow {
  key: string;
  label: string;
  /** Readings entered as two values separated by a slash, e.g. inlet/outlet. */
  paired?: boolean;
}

export type SheetSection =
  | {
      id: string;
      kind: 'grid';
      title: string;
      note?: string;
      columns: SheetColumn[];
      rows: SheetRow[];
    }
  | {
      id: string;
      kind: 'computed';
      title: string;
      note?: string;
      /** Two input columns; the third column is calculated as present - previous. */
      columns: [SheetColumn, SheetColumn];
      resultLabel: string;
      rows: SheetRow[];
    }
  | {
      id: string;
      kind: 'balance';
      title: string;
      note?: string;
      /** Previous ROB + loaded + made - used = present ROB (calculated). */
      rows: SheetRow[];
    };

export interface SheetTemplate {
  id: string;
  title: string;
  units: string;
  headerFields: SheetRow[];
  sections: SheetSection[];
  signatureFields: SheetRow[];
}

const col = (key: string, label: string): SheetColumn => ({ key, label });
const row = (key: string, label: string, paired = false): SheetRow => ({ key, label, paired });

const ENGINE_COLUMNS = [
  col('e1', 'No.1 Engine'),
  col('e2', 'No.2 Engine'),
  col('e3', 'No.3 Engine'),
  col('e4', 'No.4 Engine'),
  col('emergency', 'Emerg Geny'),
];

const PORT_STBD = [col('port', 'Port'), col('stbd', 'Stbd')];

export const BALANCE_COLUMNS: SheetColumn[] = [
  col('previous', 'Previous ROB'),
  col('used', 'Used'),
  col('loaded', 'Loaded'),
  col('made', 'Made'),
];

export const DAGON_ENGINE_LOG: SheetTemplate = {
  id: 'dagon_er_log',
  title: 'Engine Room Log — DAGON',
  units: 'Temperatures in °C · Pressures in Bar · Volumes in USG unless otherwise stated',
  headerFields: [
    row('from', 'From'),
    row('to', 'To'),
    row('location', 'Location'),
    row('page_no', 'Page No.'),
  ],
  signatureFields: [
    row('ums_engineer', 'UMS Duty Engineer'),
    row('chief_engineer', 'Chief Engineer'),
  ],
  sections: [
    {
      id: 'main_engines',
      kind: 'grid',
      title: 'Main Engines',
      note: 'Readings taken at 20:00',
      columns: ENGINE_COLUMNS,
      rows: [
        row('rpm', 'RPM'),
        row('sw_inlet_press', 'SW Inlet Press — Local'),
        row('fo_press', 'FO Press'),
        row('lo_press', 'LO Press'),
        row('jw_press', 'JW Press'),
        row('sw_inlet_outlet_temp', 'SW Inlet / Outlet Temp', true),
        row('lo_into_cooler', 'LO Into Engine Cooler'),
        row('lo_out_cooler', 'LO Out from Eng Cooler'),
        row('jw_into_eng', 'JW Into Eng Temp'),
        row('jw_out_eng', 'JW Out from Eng Temp'),
        row('cyl_exh_lowest', 'CYL Exhaust Lowest Temp'),
        row('cyl_exh_lowest_no', 'CYL Exhaust — CYL No.'),
        row('cyl_exh_highest', 'CYL Exhaust Highest Temp'),
        row('cyl_exh_highest_no', 'CYL Exhaust — CYL No.'),
        row('sump_level', 'Sump Level %'),
      ],
    },
    {
      id: 'alternators',
      kind: 'grid',
      title: 'Alternators',
      note: 'Readings taken at 20:00',
      columns: [
        col('g1', 'Generator No.1'),
        col('g2', 'Generator No.2'),
        col('g3', 'Generator No.3'),
        col('g4', 'Generator No.4'),
        col('emergency', 'Emerg Geny'),
      ],
      rows: [
        row('volts_ac', 'Volts AC'),
        row('line_amps', 'Line Amps'),
        row('active_power', 'Active Power kW'),
        row('reactive_power', 'Reactive Power kVAr'),
        row('frequency', 'Frequency'),
        row('stator_temp', 'Stator Temp — Highest'),
      ],
    },
    {
      id: 'main_propulsion',
      kind: 'grid',
      title: 'Main Propulsion',
      note: 'Readings taken at 20:00',
      columns: PORT_STBD,
      rows: [
        row('arm_volts', 'Arm Volts DC'),
        row('arm_amps', 'Arm Amps'),
        row('field_volts', 'Field Volts DC'),
        row('field_amps', 'Field Amps DC'),
        row('fwd_jrn_brg_temp', 'Fwd Jrn. Brg. Temp'),
        row('air_cool_temp', 'Air Cool Temp'),
        row('shunt_field_temp', 'Shunt Field Temp'),
        row('comm_field_temp', 'Comm Field Temp'),
        row('aft_jrn_brg_temp', 'Aft Jrn. Brg. Temp'),
        row('fwd_thrust_brg_temp', 'FWD Thrust Brg. Temp'),
        row('aft_thrust_brg_temp', 'Aft Thrust Brg. Temp'),
        row('motor_lo_press', 'Motor Lub Oil Press'),
        row('lo_diff_press', 'LO Diff Press — Local'),
        row('con_feedback_load', 'Con. Feedback Load'),
        row('prop_shaft_rpm', 'RPM Prop. Shaft'),
      ],
    },
    {
      id: 'transformers',
      kind: 'grid',
      title: 'Transformers 600V — 440V',
      note: 'Readings taken at 20:00',
      columns: [col('t1', 'No.1'), col('t2', 'No.2'), col('t3', 'No.3')],
      rows: [
        row('kilowatts', 'Kilowatts'),
        row('volts', 'Volts'),
        row('amps', 'Amps'),
      ],
    },
    {
      id: 'bow_thruster',
      kind: 'grid',
      title: 'Bow Thruster',
      note: 'Readings taken at 20:00',
      columns: [col('value', 'Reading')],
      rows: [
        row('a_volts', 'A. Volts'),
        row('a_amps', 'A. Amps'),
        row('f_volts', 'F. Volts'),
        row('f_amps', 'F. Amps'),
        row('lo_hdr_tk', 'LO Hdr Tk'),
        row('sw_press', 'SW Press'),
      ],
    },
    {
      id: 'steering_stern_tube',
      kind: 'grid',
      title: 'Steering Gear & Stern Tube',
      note: 'Readings taken at 20:00',
      columns: PORT_STBD,
      rows: [
        row('steering_oil_temp', 'Steering Gear Oil Temp'),
        row('steer_lo_tank_level', 'Steer LO Tank Level %'),
        row('stube_lo_tank_level', 'S. Tube LO Tank Level'),
        row('stube_diff_press', 'S. Tube Diff Press'),
        row('stube_lo_temp', 'S. Tube LO Temp'),
        row('stube_lo_press', 'S. Tube LO Press'),
        row('seal_lo_tank_level', 'Seal LO Tank Level'),
        row('strut_brg_temp', 'Strut Brg Temp'),
      ],
    },
    {
      id: 'evaporator',
      kind: 'grid',
      title: 'Evaporator Water Maker',
      note: 'Readings taken at 20:00; flowmeter at 08:00',
      columns: PORT_STBD,
      rows: [
        row('sw_feed_press', 'SW Feed Pressure'),
        row('vacuum', 'Vacuum'),
        row('chamber_temp', 'Chamber Temp'),
        row('fw_distillate_press', 'FW Distillate Press'),
        row('salinity', 'Salinity'),
        row('flowmeter_previous', 'Flowmeter Previous'),
        row('flowmeter_present', 'Flowmeter @ 08:00'),
        row('water_made', 'Water Made'),
      ],
    },
    {
      id: 'ro_plant',
      kind: 'grid',
      title: 'RO Plant — Upper / Lower',
      note: 'Readings taken at 20:00',
      columns: [col('upper', 'Upper'), col('lower', 'Lower')],
      rows: [
        row('feed_press', 'Feed Press.'),
        row('membrane_press', 'Membrane Press.'),
        row('salinity', 'Salinity'),
        row('flowmeter', 'Flowmeter'),
        row('water_made', 'Water Made @ 08:00'),
      ],
    },
    {
      id: 'air_pressures',
      kind: 'grid',
      title: 'Air Pressures',
      note: 'Readings taken at 20:00',
      columns: [col('value', 'Reading')],
      rows: [
        row('starting_air', 'Starting Air Press'),
        row('service_air', 'Service Air Press'),
      ],
    },
    {
      id: 'ac_refrigeration',
      kind: 'grid',
      title: 'AC / Refrigeration',
      note: 'Readings taken at 20:00',
      columns: [col('value', 'Reading')],
      rows: [
        row('ac1_suction_press', 'Main AC Comp. 1 Suction Press.'),
        row('ac1_discharge_press', 'Main AC Comp. 1 Disch. Press.'),
        row('ac1_oil_press', 'Main AC Comp. 1 Oil Press'),
        row('ac2_suction_press', 'Main AC Comp. 2 Suction Press.'),
        row('ac2_discharge_press', 'Main AC Comp. 2 Disch. Press.'),
        row('ac2_oil_press', 'Main AC Comp. 2 Oil Press'),
        row('chilled_water_temp', 'Chilled Water Temp In / Out', true),
        row('chilled_water_press_out', 'Chilled Water Press Out'),
        row('chilled_water_pump', 'Chilled Water Pump in Use'),
        row('chilled_buffer', 'Chilled Water Buffer Tk Press / Level', true),
        row('fridge_suction_press', 'Fridge Comp. Suction Press'),
        row('fridge_discharge_press', 'Fridge Comp. Disch. Press.'),
        row('freezer_room_temp', 'Freezer Room Temp.'),
        row('chiller_room_temp', 'Chiller Room Temp.'),
        row('ac_fridge_sw_press', 'AC / Fridge SW Press.'),
        row('sw_supply_temp', 'SW Supply Temp.'),
        row('propulsion_sw_press', 'Propulsion SW Pressure'),
      ],
    },
    {
      id: 'fuel_tanks',
      kind: 'grid',
      title: 'Fuel Tank Levels',
      note: 'Soundings at 08:00',
      columns: [col('value', 'Level')],
      rows: [
        row('p_4_12_0', 'P 4.12.0'),
        row('p_4_12_1', 'P 4.12.1'),
        row('p_4_12_2', 'P 4.12.2'),
        row('p_4_18_0', 'P 4-18-0'),
        row('p_4_52_0', 'P 4-52-0'),
        row('p_4_52_1', 'P 4-52-1'),
        row('p_4_52_2', 'P 4-52-2'),
        row('p_4_72_1', 'P 4-72-1'),
        row('p_4_72_2', 'P 4-72-2'),
        row('p_4_72_3', 'P 4-72-3'),
        row('p_4_72_4', 'P 4-72-4'),
        row('p_4_80_1', 'P 4-80-1'),
        row('p_4_80_2', 'P 4-80-2'),
        row('stbd_service', 'Stbd. Service'),
        row('port_service', 'Port Service'),
      ],
    },
    {
      id: 'water_waste_lo_tanks',
      kind: 'grid',
      title: 'Fresh Water, Waste & LO Tanks',
      note: 'Soundings at 08:00',
      columns: [col('value', 'Level')],
      rows: [
        row('fw_main', 'Fresh Water — Main'),
        row('fw_auxiliary', 'Fresh Water — Auxiliary'),
        row('port_wo_tk', 'Port WO Tk'),
        row('stbd_bilge_tk', 'Stbd Bilge Tk'),
        row('sewage_tk', 'Sewage Tk'),
        row('port_me_lo', 'Port ME LO'),
        row('stbd_me_lo', 'Stbd ME LO'),
        row('steering_gear_lo', 'Steering Gear'),
        row('stern_tube_lo', 'Stern Tube'),
      ],
    },
    {
      id: 'running_hours',
      kind: 'computed',
      title: 'Running Hours',
      note: 'Counter readings at 08:00',
      columns: [col('previous', 'Previous'), col('present', 'Present')],
      resultLabel: 'Hrs Run',
      rows: [
        row('dg1', 'DG1'),
        row('dg2', 'DG2'),
        row('dg3', 'DG3'),
        row('dg4', 'DG4'),
        row('port_prop', 'Port Prop'),
        row('stbd_prop', 'Stbd Prop'),
        row('fridge_comp_1', 'Fridge Comp 1'),
        row('fridge_comp_2', 'Fridge Comp 2'),
        row('start_air_comp_1', 'Start Air Comp 1'),
        row('start_air_comp_2', 'Start Air Comp 2'),
        row('work_air_comp_1', 'Work Air Comp 1'),
        row('work_air_comp_2', 'Work Air Comp 2'),
      ],
    },
    {
      id: 'dg_flow_meter',
      kind: 'computed',
      title: 'DG Flow Meters',
      note: 'Counter readings at 08:00',
      columns: [col('previous', 'Previous'), col('present', 'Present')],
      resultLabel: 'Used',
      rows: [
        row('dg1', 'DG1'),
        row('dg2', 'DG2'),
        row('dg3', 'DG3'),
        row('dg4', 'DG4'),
      ],
    },
    {
      id: 'midnight_figures',
      kind: 'balance',
      title: 'Midnight Figures',
      note: 'Present ROB is calculated as previous + loaded + made − used',
      rows: [
        row('fuel', 'Fuel'),
        row('water', 'Water'),
        row('me_lube_oil', 'Main Engine Lub. Oil'),
        row('stern_tube', 'Stern Tube'),
        row('crane_hyd_oil', 'Crane Hyd. Oil'),
        row('steering_hyd_oil', 'Steering Hyd. Oil'),
      ],
    },
  ],
};

/** Data key used for a single reading. */
export const sheetKey = (sectionId: string, rowKey: string, columnKey: string): string =>
  `${sectionId}.${rowKey}.${columnKey}`;

const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/** present − previous, blank when either side is missing. */
export const computeDifference = (
  data: Record<string, unknown>, sectionId: string, rowKey: string,
): string => {
  const previous = num(data[sheetKey(sectionId, rowKey, 'previous')]);
  const present = num(data[sheetKey(sectionId, rowKey, 'present')]);
  if (previous === null || present === null) return '';
  return String(Math.round((present - previous) * 100) / 100);
};

/** previous + loaded + made − used, blank when nothing has been entered. */
export const computePresentRob = (
  data: Record<string, unknown>, sectionId: string, rowKey: string,
): string => {
  const parts = BALANCE_COLUMNS.map((column) => num(data[sheetKey(sectionId, rowKey, column.key)]));
  if (parts.every((part) => part === null)) return '';
  const [previous, used, loaded, made] = parts.map((part) => part ?? 0);
  return String(Math.round((previous + loaded + made - used) * 100) / 100);
};

/** Template used for a vessel's logbook, when that vessel has a bespoke sheet. */
export const getSheetTemplate = (
  logbookSlug: string | undefined, vesselName: string | null | undefined,
): SheetTemplate | undefined => {
  if (logbookSlug !== 'engine-log') return undefined;
  if (!vesselName || !/dagon/i.test(vesselName)) return undefined;
  return DAGON_ENGINE_LOG;
};

/** Flattens a saved entry's sheet readings into printable "label: value" lines. */
export const sheetSummaryLines = (
  template: SheetTemplate, data: Record<string, unknown>,
): string[] => {
  const lines: string[] = [];
  template.sections.forEach((section) => {
    const sectionLines: string[] = [];
    section.rows.forEach((sheetRow) => {
      const columns: SheetColumn[] = section.kind === 'balance'
        ? BALANCE_COLUMNS
        : [...section.columns];
      const values = columns
        .map((column) => {
          const value = data[sheetKey(section.id, sheetRow.key, column.key)];
          if (value === null || value === undefined || value === '') return null;
          return columns.length === 1 ? String(value) : `${column.label} ${String(value)}`;
        })
        .filter((value): value is string => value !== null);
      if (section.kind === 'computed') {
        const diff = computeDifference(data, section.id, sheetRow.key);
        if (diff !== '') values.push(`${section.resultLabel} ${diff}`);
      }
      if (section.kind === 'balance') {
        const rob = computePresentRob(data, section.id, sheetRow.key);
        if (rob !== '') values.push(`Present ROB ${rob}`);
      }
      if (values.length > 0) sectionLines.push(`${sheetRow.label}: ${values.join(', ')}`);
    });
    if (sectionLines.length > 0) {
      lines.push(section.title.toUpperCase());
      lines.push(...sectionLines);
    }
  });
  return lines;
};
