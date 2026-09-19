/**
 * Form builder schema. Stored as JSON on `legal_document_versions.form_schema`.
 */

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'heading'
  | 'paragraph'
  | 'signature'
  | 'reference';

export type ReferenceEntity = 'vessel' | 'crew';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  /** `select` options. */
  options?: string[];
  /** `reference` target entity. */
  referenceEntity?: ReferenceEntity;
}

export interface FormSchema {
  title: string;
  description?: string;
  fields: FormField[];
}

export interface SignatureValue {
  /** Typed full name. */
  name: string;
  /** Acknowledgement checkbox. */
  acknowledged: boolean;
  signedAt: string;
  /** Optional drawn signature as a PNG data URL. */
  image?: string | null;
}

export interface ReferenceValue {
  id: string;
  label: string;
}

export type FormValue = string | boolean | SignatureValue | ReferenceValue | null;
export type FormData = Record<string, FormValue>;

export interface FieldTypeDef {
  type: FormFieldType;
  label: string;
  description: string;
  /** Static content, never collects a value. */
  isStatic: boolean;
}

export const FIELD_TYPES: FieldTypeDef[] = [
  { type: 'text', label: 'Short text', description: 'Single line answer.', isStatic: false },
  { type: 'textarea', label: 'Long text', description: 'Multi-line answer.', isStatic: false },
  { type: 'checkbox', label: 'Checkbox', description: 'Yes / no confirmation.', isStatic: false },
  { type: 'date', label: 'Date', description: 'Calendar date.', isStatic: false },
  { type: 'select', label: 'Dropdown', description: 'Pick one of a list of options.', isStatic: false },
  { type: 'reference', label: 'Reference', description: 'Points at a vessel or crew member.', isStatic: false },
  { type: 'signature', label: 'Signature', description: 'Typed name, acknowledgement and optional drawn signature.', isStatic: false },
  { type: 'heading', label: 'Heading', description: 'Section title.', isStatic: true },
  { type: 'paragraph', label: 'Paragraph', description: 'Static information text.', isStatic: true },
];

export const fieldTypeDef = (type: string): FieldTypeDef | undefined => FIELD_TYPES.find((f) => f.type === type);
export const isStaticField = (field: Pick<FormField, 'type'>): boolean => fieldTypeDef(field.type)?.isStatic ?? false;

let seq = 0;
export const newFieldId = (): string => {
  seq += 1;
  return `f_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
};

const DEFAULT_LABEL: Record<FormFieldType, string> = {
  text: 'Short answer',
  textarea: 'Long answer',
  checkbox: 'I confirm',
  date: 'Date',
  select: 'Choose an option',
  heading: 'Section heading',
  paragraph: 'Information for the person filling in this form.',
  signature: 'Signature',
  reference: 'Vessel',
};

export function createField(type: FormFieldType): FormField {
  const field: FormField = { id: newFieldId(), type, label: DEFAULT_LABEL[type] };
  if (type === 'select') field.options = ['Option 1', 'Option 2'];
  if (type === 'reference') field.referenceEntity = 'vessel';
  if (type === 'signature') field.required = true;
  return field;
}

export const emptySchema = (title = ''): FormSchema => ({ title, fields: [] });

const FIELD_TYPE_SET = new Set<string>(FIELD_TYPES.map((f) => f.type));

/** Defensive parse of the jsonb column: unknown → schema or null. */
export function parseFormSchema(json: unknown): FormSchema | null {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
  const obj = json as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return null;
  const fields: FormField[] = [];
  for (const raw of obj.fields) {
    if (!raw || typeof raw !== 'object') continue;
    const f = raw as Record<string, unknown>;
    if (typeof f.type !== 'string' || !FIELD_TYPE_SET.has(f.type)) continue;
    const field: FormField = {
      id: typeof f.id === 'string' && f.id ? f.id : newFieldId(),
      type: f.type as FormFieldType,
      label: typeof f.label === 'string' ? f.label : '',
    };
    if (typeof f.required === 'boolean') field.required = f.required;
    if (typeof f.placeholder === 'string') field.placeholder = f.placeholder;
    if (typeof f.helpText === 'string') field.helpText = f.helpText;
    if (Array.isArray(f.options)) field.options = f.options.filter((o): o is string => typeof o === 'string');
    if (f.referenceEntity === 'vessel' || f.referenceEntity === 'crew') field.referenceEntity = f.referenceEntity;
    fields.push(field);
  }
  return {
    title: typeof obj.title === 'string' ? obj.title : '',
    ...(typeof obj.description === 'string' ? { description: obj.description } : {}),
    fields,
  };
}

export function moveField(schema: FormSchema, index: number, direction: -1 | 1): FormSchema {
  const target = index + direction;
  if (index < 0 || index >= schema.fields.length || target < 0 || target >= schema.fields.length) return schema;
  const fields = [...schema.fields];
  [fields[index], fields[target]] = [fields[target], fields[index]];
  return { ...schema, fields };
}

export function duplicateField(schema: FormSchema, index: number): FormSchema {
  const source = schema.fields[index];
  if (!source) return schema;
  const copy: FormField = { ...source, id: newFieldId(), label: `${source.label} (copy)`, options: source.options ? [...source.options] : undefined };
  if (copy.options === undefined) delete copy.options;
  const fields = [...schema.fields];
  fields.splice(index + 1, 0, copy);
  return { ...schema, fields };
}

export function removeField(schema: FormSchema, index: number): FormSchema {
  if (!schema.fields[index]) return schema;
  return { ...schema, fields: schema.fields.filter((_, i) => i !== index) };
}

export function updateField(schema: FormSchema, index: number, patch: Partial<FormField>): FormSchema {
  if (!schema.fields[index]) return schema;
  return { ...schema, fields: schema.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)) };
}

export function addField(schema: FormSchema, type: FormFieldType, atIndex?: number): FormSchema {
  const fields = [...schema.fields];
  const field = createField(type);
  if (atIndex === undefined || atIndex < 0 || atIndex >= fields.length) fields.push(field);
  else fields.splice(atIndex + 1, 0, field);
  return { ...schema, fields };
}

export const isSignatureValue = (v: unknown): v is SignatureValue =>
  Boolean(v) && typeof v === 'object' && typeof (v as SignatureValue).name === 'string' && typeof (v as SignatureValue).acknowledged === 'boolean';

export const isReferenceValue = (v: unknown): v is ReferenceValue =>
  Boolean(v) && typeof v === 'object' && typeof (v as ReferenceValue).id === 'string' && typeof (v as ReferenceValue).label === 'string';

export const isEmptyValue = (field: FormField, value: FormValue | undefined): boolean => {
  if (value === null || value === undefined) return true;
  switch (field.type) {
    case 'checkbox':
      return value !== true;
    case 'signature':
      return !isSignatureValue(value) || value.name.trim() === '' || !value.acknowledged;
    case 'reference':
      return !isReferenceValue(value) || value.id === '';
    default:
      return typeof value !== 'string' || value.trim() === '';
  }
};

/** Required-field validation. Returns a map of field id → message. */
export function validateSubmission(schema: FormSchema, data: FormData): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of schema.fields) {
    if (isStaticField(field)) continue;
    const value = data[field.id];
    if (field.required && isEmptyValue(field, value)) {
      errors[field.id] =
        field.type === 'signature' ? 'Type your name and tick the acknowledgement' : field.type === 'checkbox' ? 'This must be ticked' : 'This field is required';
      continue;
    }
    if (field.type === 'select' && typeof value === 'string' && value && field.options && !field.options.includes(value)) {
      errors[field.id] = 'Choose one of the listed options';
    }
    if (field.type === 'date' && typeof value === 'string' && value && Number.isNaN(new Date(value).getTime())) {
      errors[field.id] = 'Enter a valid date';
    }
  }
  return errors;
}

/** Human-readable value for summaries and PDFs. */
export function summariseValue(field: FormField, value: FormValue | undefined): string {
  if (value === null || value === undefined) return '—';
  switch (field.type) {
    case 'checkbox':
      return value === true ? 'Yes' : 'No';
    case 'signature':
      return isSignatureValue(value) && value.name ? `${value.name}${value.acknowledged ? ' (acknowledged)' : ''}` : '—';
    case 'reference':
      return isReferenceValue(value) ? value.label : '—';
    default:
      return typeof value === 'string' && value.trim() ? value : '—';
  }
}

/** Fields that collect values, in order. */
export const answerFields = (schema: FormSchema): FormField[] => schema.fields.filter((f) => !isStaticField(f));

/** Short human reference for a submission id. */
export const submissionReference = (id: string): string => `SUB-${id.slice(0, 8).toUpperCase()}`;
