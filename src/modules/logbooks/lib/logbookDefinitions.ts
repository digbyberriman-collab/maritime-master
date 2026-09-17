import {
  Anchor, Bell, Droplets, Radio, Trash2, Users, Wind, Wrench,
} from 'lucide-react';

export type LogbookTypeKey =
  | 'deck_log'
  | 'engine_log'
  | 'bell_book'
  | 'radio_log'
  | 'oil_record_book'
  | 'garbage_record_book'
  | 'ballast_water_record'
  | 'visitor_log';

export type LogbookFieldType = 'text' | 'textarea' | 'number' | 'time' | 'select';

export interface LogbookField {
  key: string;
  label: string;
  type: LogbookFieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
}

export interface LogbookDefinition {
  slug: string;
  type: LogbookTypeKey;
  label: string;
  description: string;
  icon: React.ElementType;
  statutory: boolean;
  /** Extra fields stored in the entry's flexible details column. */
  fields: LogbookField[];
  /** Whether a position (lat/long) is normally recorded. */
  usesPosition: boolean;
}

export const LOGBOOK_DEFINITIONS: LogbookDefinition[] = [
  {
    slug: 'deck-log',
    type: 'deck_log',
    label: 'Deck Log',
    description: 'Daily navigational record: watches, position, course, weather and events.',
    icon: Anchor,
    statutory: true,
    usesPosition: true,
    fields: [
      { key: 'course', label: 'Course', type: 'text', placeholder: '090T' },
      { key: 'speed', label: 'Speed', type: 'number', unit: 'kn' },
      { key: 'wind', label: 'Wind', type: 'text', placeholder: 'NE 4' },
      { key: 'sea_state', label: 'Sea state', type: 'text', placeholder: 'Slight' },
      { key: 'visibility', label: 'Visibility', type: 'text', placeholder: 'Good' },
      { key: 'barometer', label: 'Barometer', type: 'number', unit: 'hPa' },
      { key: 'officer_of_watch', label: 'Officer of the watch', type: 'text' },
    ],
  },
  {
    slug: 'engine-log',
    type: 'engine_log',
    label: 'Engine Log',
    description: 'Machinery running hours, fuel and lube consumption, tank soundings.',
    icon: Wrench,
    statutory: true,
    usesPosition: false,
    fields: [
      { key: 'me_port_hours', label: 'Main engine (port) hours', type: 'number', unit: 'h' },
      { key: 'me_stbd_hours', label: 'Main engine (stbd) hours', type: 'number', unit: 'h' },
      { key: 'generator_hours', label: 'Generator hours', type: 'number', unit: 'h' },
      { key: 'fuel_consumed', label: 'Fuel consumed', type: 'number', unit: 'L' },
      { key: 'fuel_rob', label: 'Fuel remaining on board', type: 'number', unit: 'L' },
      { key: 'lube_oil_added', label: 'Lube oil added', type: 'number', unit: 'L' },
      { key: 'fresh_water_rob', label: 'Fresh water remaining', type: 'number', unit: 'L' },
      { key: 'engineer_on_watch', label: 'Engineer on watch', type: 'text' },
    ],
  },
  {
    slug: 'bell-book',
    type: 'bell_book',
    label: 'Bell Book',
    description: 'Manoeuvring record of engine and helm orders during pilotage and berthing.',
    icon: Bell,
    statutory: false,
    usesPosition: false,
    fields: [
      { key: 'order', label: 'Order', type: 'text', placeholder: 'Half ahead' },
      { key: 'rudder', label: 'Rudder', type: 'text', placeholder: 'Port 10' },
      { key: 'given_by', label: 'Order given by', type: 'text' },
      { key: 'executed_by', label: 'Executed by', type: 'text' },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'Approach channel' },
    ],
  },
  {
    slug: 'radio-log',
    type: 'radio_log',
    label: 'Radio Log',
    description: 'GMDSS communications, distress traffic and equipment tests.',
    icon: Radio,
    statutory: true,
    usesPosition: false,
    fields: [
      {
        key: 'traffic_type', label: 'Traffic type', type: 'select',
        options: ['Routine', 'Safety', 'Urgency', 'Distress', 'Equipment test'],
      },
      { key: 'station', label: 'Station / vessel', type: 'text' },
      { key: 'frequency', label: 'Frequency / channel', type: 'text', placeholder: 'VHF Ch 16' },
      { key: 'operator', label: 'Operator', type: 'text' },
    ],
  },
  {
    slug: 'oil-record-book',
    type: 'oil_record_book',
    label: 'Oil Record Book',
    description: 'MARPOL Annex I transfers, bunkering, sludge and bilge water disposal.',
    icon: Droplets,
    statutory: true,
    usesPosition: true,
    fields: [
      {
        key: 'operation', label: 'Operation', type: 'select',
        options: ['Bunkering', 'Internal transfer', 'Sludge disposal ashore', 'Bilge water discharge', 'Incineration', 'Other'],
      },
      { key: 'oil_type', label: 'Oil type', type: 'text', placeholder: 'MGO' },
      { key: 'quantity', label: 'Quantity', type: 'number', unit: 'm³' },
      { key: 'tank', label: 'Tank(s)', type: 'text' },
      { key: 'receipt_reference', label: 'Receipt / reference', type: 'text' },
      { key: 'officer_in_charge', label: 'Officer in charge', type: 'text' },
    ],
  },
  {
    slug: 'garbage-record-book',
    type: 'garbage_record_book',
    label: 'Garbage Record Book',
    description: 'MARPOL Annex V waste categories, landings and incineration.',
    icon: Trash2,
    statutory: true,
    usesPosition: true,
    fields: [
      {
        key: 'category', label: 'Waste category', type: 'select',
        options: ['A - Plastics', 'B - Food waste', 'C - Domestic waste', 'D - Cooking oil', 'E - Incinerator ash', 'F - Operational waste', 'G - Animal carcasses', 'H - Fishing gear', 'I - E-waste', 'J - Cargo residues'],
      },
      {
        key: 'disposal_method', label: 'Disposal method', type: 'select',
        options: ['Landed ashore', 'Discharged to sea', 'Incinerated', 'Transferred to other ship'],
      },
      { key: 'quantity', label: 'Estimated quantity', type: 'number', unit: 'm³' },
      { key: 'port_or_facility', label: 'Port / reception facility', type: 'text' },
      { key: 'receipt_reference', label: 'Receipt reference', type: 'text' },
      { key: 'officer_in_charge', label: 'Officer in charge', type: 'text' },
    ],
  },
  {
    slug: 'ballast-water-record',
    type: 'ballast_water_record',
    label: 'Ballast Water Record',
    description: 'Ballast uptake, exchange and discharge under the BWM Convention.',
    icon: Wind,
    statutory: true,
    usesPosition: true,
    fields: [
      {
        key: 'operation', label: 'Operation', type: 'select',
        options: ['Uptake', 'Exchange', 'Discharge', 'Internal transfer', 'Treatment system bypass'],
      },
      { key: 'tank', label: 'Tank(s)', type: 'text' },
      { key: 'volume', label: 'Volume', type: 'number', unit: 'm³' },
      { key: 'salinity', label: 'Salinity', type: 'number', unit: 'PSU' },
      { key: 'treatment_used', label: 'Treatment system used', type: 'text' },
      { key: 'officer_in_charge', label: 'Officer in charge', type: 'text' },
    ],
  },
  {
    slug: 'visitor-log',
    type: 'visitor_log',
    label: 'Visitor & Guest Log',
    description: 'ISPS record of visitors, contractors and guests boarding the vessel.',
    icon: Users,
    statutory: false,
    usesPosition: false,
    fields: [
      { key: 'visitor_name', label: 'Visitor name', type: 'text' },
      { key: 'company', label: 'Company / affiliation', type: 'text' },
      {
        key: 'visitor_type', label: 'Visitor type', type: 'select',
        options: ['Guest', 'Contractor', 'Surveyor', 'Official', 'Crew family', 'Delivery', 'Other'],
      },
      { key: 'id_checked', label: 'ID checked (type / number)', type: 'text' },
      { key: 'time_on_board', label: 'Time on board', type: 'time' },
      { key: 'time_ashore', label: 'Time ashore', type: 'time' },
      { key: 'escorted_by', label: 'Escorted by', type: 'text' },
    ],
  },
];

export const getLogbookBySlug = (slug?: string): LogbookDefinition | undefined =>
  LOGBOOK_DEFINITIONS.find((book) => book.slug === slug);

export const getLogbookByType = (type: string): LogbookDefinition | undefined =>
  LOGBOOK_DEFINITIONS.find((book) => book.type === type);
