import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  BALANCE_COLUMNS, computeDifference, computePresentRob, sheetKey,
  type SheetSection, type SheetTemplate,
} from '@/modules/logbooks/lib/dagonEngineLog';

interface Props {
  template: SheetTemplate;
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  readOnly?: boolean;
}

const cellClass = 'h-8 rounded-sm px-2 text-center text-xs';

/** Renders a vessel-specific daily readings sheet as a set of compact grids. */
const LogbookSheetForm: React.FC<Props> = ({ template, values, onChange, readOnly }) => {
  const cell = (key: string, placeholder?: string) => (
    <Input
      className={cellClass}
      value={values[key] ?? ''}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(event) => onChange(key, event.target.value)}
    />
  );

  const renderSection = (section: SheetSection) => {
    const columns = section.kind === 'balance' ? BALANCE_COLUMNS : section.columns;
    const extraLabel = section.kind === 'computed'
      ? section.resultLabel
      : section.kind === 'balance' ? 'Present ROB' : null;

    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-56 border border-border bg-muted/50 px-2 py-1 text-left font-semibold">
                Reading
              </th>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className="border border-border bg-muted/50 px-2 py-1 text-center font-semibold"
                >
                  {column.label}
                </th>
              ))}
              {extraLabel && (
                <th className="border border-border bg-muted/50 px-2 py-1 text-center font-semibold">
                  {extraLabel}
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((sheetRow) => (
              <tr key={sheetRow.key}>
                <th className="border border-border px-2 py-1 text-left font-normal text-muted-foreground">
                  {sheetRow.label}
                </th>
                {columns.map((column) => (
                  <td key={column.key} className="border border-border p-1">
                    {cell(
                      sheetKey(section.id, sheetRow.key, column.key),
                      sheetRow.paired ? '– / –' : undefined,
                    )}
                  </td>
                ))}
                {extraLabel && (
                  <td className="border border-border bg-muted/30 p-1 text-center font-medium">
                    {section.kind === 'computed'
                      ? computeDifference(values, section.id, sheetRow.key) || '—'
                      : computePresentRob(values, section.id, sheetRow.key) || '—'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-4 rounded-md border border-border p-4">
      <div>
        <p className="text-sm font-semibold text-foreground">{template.title}</p>
        <p className="text-xs text-muted-foreground">{template.units}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {template.headerFields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs" htmlFor={`sheet-header-${field.key}`}>{field.label}</Label>
            <Input
              id={`sheet-header-${field.key}`}
              className="h-8 text-xs"
              value={values[`header.${field.key}`] ?? ''}
              readOnly={readOnly}
              onChange={(event) => onChange(`header.${field.key}`, event.target.value)}
            />
          </div>
        ))}
      </div>

      <Accordion type="multiple" defaultValue={[template.sections[0]?.id ?? '']}>
        {template.sections.map((section) => (
          <AccordionItem key={section.id} value={section.id}>
            <AccordionTrigger className="py-2 text-sm">
              <span className="flex flex-col items-start text-left">
                <span className="font-semibold">{section.title}</span>
                {section.note && (
                  <span className="text-xs font-normal text-muted-foreground">{section.note}</span>
                )}
              </span>
            </AccordionTrigger>
            <AccordionContent>{renderSection(section)}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>

      <div className="grid gap-3 sm:grid-cols-2">
        {template.signatureFields.map((field) => (
          <div key={field.key} className="space-y-1">
            <Label className="text-xs" htmlFor={`sheet-sign-${field.key}`}>{field.label}</Label>
            <Input
              id={`sheet-sign-${field.key}`}
              className="h-8 text-xs"
              placeholder="Name"
              value={values[`signature.${field.key}`] ?? ''}
              readOnly={readOnly}
              onChange={(event) => onChange(`signature.${field.key}`, event.target.value)}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

export default LogbookSheetForm;
