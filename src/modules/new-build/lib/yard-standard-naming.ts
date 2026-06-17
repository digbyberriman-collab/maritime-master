/**
 * Oceanco Yard Standard Document Numbering Scheme
 * Reference: 999-000-WIS-EN-002 Rev W
 *
 * Structure: [Type]-[Element(3)]-[Material(2)]-[Seq(3)]-[Sheet(2)][Rev(1)]
 * Example:   S-323-04-001-01A
 *
 * When used in a project context, the yard number is prepended:
 *   Y719-S-323-04-001-01
 */

export const DOC_TYPE_CODES: Record<string, string> = {
  S: "Yard Standard drawing",
  C: "Calculation",
  B: "Certificate",
  D: "Datasheet / other document",
};

export const MATERIAL_CODES: Record<string, string> = {
  "01": "No material defined",
  "02": "Steel",
  "03": "Aluminium",
  "04": "Stainless Steel",
  "05": "Copper",
  "06": "Cunifer",
  "07": "Synthetic",
  "08": "Brass / Bronze",
  "09": "Triclad",
  "10": "Other material",
  "11": "Penetrations",
  "12": "Reserve",
  "13": "Clamps",
  "14": "Shore connections",
  "15": "Supporting Documents",
};

export interface ParsedYardStandard {
  document_number: string;
  doc_type_code: string;
  element_code: string;
  material_code: string;
  seq_code: string;
  sheet_number: string;
  revision: string;
}

/**
 * Parse an Oceanco Yard Standard filename/number.
 *
 * Accepts patterns like:
 *   S-323-04-001-01A          (library form)
 *   Y719-S-323-04-001-01      (project form)
 *   S-323-04-001-01A.pdf      (with extension)
 *   999-000-WIS-EN-002.pdf    (work instruction – won't match YS pattern)
 *
 * Returns null if the filename doesn't match the Yard Standard pattern.
 */
export function parseYardStandardNumber(filename: string): ParsedYardStandard | null {
  // Strip file extension
  const name = filename.replace(/\.[^.]+$/, "").trim();

  // Pattern 1: Library form – S-323-04-001-01A
  // [S|C|B|D]-[3 digits]-[2 digits]-[3 digits]-[2 digits][optional rev letter]
  const libraryPattern = /^([SCBD])-(\d{3})-(\d{2})-(\d{3})-(\d{2})([A-Z])?$/i;

  // Pattern 2: Project form – Y719-S-323-04-001-01
  const projectPattern = /^[YP]\w{2,4}-([SCBD])-(\d{3})-(\d{2})-(\d{3})-(\d{2})([A-Z])?$/i;

  let match = name.match(libraryPattern) || name.match(projectPattern);

  if (!match) return null;

  const [, docType, element, material, seq, sheet, rev] = match;

  const docTypeUpper = docType.toUpperCase();
  const document_number = `${docTypeUpper}-${element}-${material}-${seq}-${sheet}${rev ? rev.toUpperCase() : ""}`;

  return {
    document_number,
    doc_type_code: docTypeUpper,
    element_code: element,
    material_code: material,
    seq_code: seq,
    sheet_number: sheet,
    revision: rev ? rev.toUpperCase() : "",
  };
}

/**
 * Build a human-readable title from parsed naming components.
 */
export function buildTitleFromParsed(parsed: ParsedYardStandard): string {
  const typeName = DOC_TYPE_CODES[parsed.doc_type_code] || "Document";
  const materialName = MATERIAL_CODES[parsed.material_code] || "";
  const parts = [typeName];
  if (materialName && parsed.material_code !== "01") {
    parts.push(`(${materialName})`);
  }
  parts.push(`Element ${parsed.element_code}`);
  return parts.join(" ");
}

/**
 * Get material label from code.
 */
export function getMaterialLabel(code: string): string {
  return MATERIAL_CODES[code] || code;
}

/**
 * Get doc type label from code.
 */
export function getDocTypeLabel(code: string): string {
  return DOC_TYPE_CODES[code] || code;
}
