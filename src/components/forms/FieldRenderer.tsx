import React from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type { FormField } from '@/lib/formConstants';

interface FieldRendererProps {
  field: FormField;
  value: unknown;
  onChange: (fieldId: string, value: unknown) => void;
  disabled?: boolean;
  allValues?: Record<string, unknown>;
}

const FieldRenderer: React.FC<FieldRendererProps> = ({
  field,
  value,
  onChange,
  disabled = false,
  allValues = {},
}) => {
  // Check conditional visibility
  if (field.conditionalOn) {
    const conditionValue = allValues[field.conditionalOn.fieldId];
    const operator = field.conditionalOn.operator || 'equals';
    const targetValue = field.conditionalOn.value;

    let shouldShow = false;
    switch (operator) {
      case 'equals':
        shouldShow = conditionValue === targetValue;
        break;
      case 'not_equals':
        shouldShow = conditionValue !== targetValue;
        break;
      case 'contains':
        shouldShow = String(conditionValue).includes(targetValue);
        break;
    }

    if (!shouldShow) return null;
  }

  const handleChange = (newValue: unknown) => {
    onChange(field.id, newValue);
  };

  // Section header
  if (field.type === 'section') {
    return (
      <div className="col-span-2 border-b border-border pb-2 mb-4 pt-4 first:pt-0">
        <h3 className="text-lg font-semibold text-foreground">{field.label}</h3>
        {field.helpText && (
          <p className="text-sm text-muted-foreground mt-1">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Text input
  if (field.type === 'text') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          value={(value as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Text area
  if (field.type === 'textarea') {
    return (
      <div className="space-y-2 col-span-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Textarea
          id={field.id}
          value={(value as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
          rows={4}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Number input
  if (field.type === 'number') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type="number"
          value={(value as number) ?? ''}
          onChange={(e) => handleChange(e.target.valueAsNumber || '')}
          placeholder={field.placeholder}
          disabled={disabled}
          required={field.required}
          min={field.validation?.min}
          max={field.validation?.max}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Date input
  if (field.type === 'date') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type="date"
          value={(value as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // DateTime input
  if (field.type === 'datetime') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type="datetime-local"
          value={(value as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Time input
  if (field.type === 'time') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type="time"
          value={(value as string) || ''}
          onChange={(e) => handleChange(e.target.value)}
          disabled={disabled}
          required={field.required}
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Checkbox
  if (field.type === 'checkbox') {
    return (
      <div className="flex items-center gap-3 py-2">
        <Checkbox
          id={field.id}
          checked={(value as boolean) || false}
          onCheckedChange={(checked) => handleChange(checked)}
          disabled={disabled}
        />
        <Label htmlFor={field.id} className="cursor-pointer">
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
      </div>
    );
  }

  // Yes/No
  if (field.type === 'yes_no') {
    return (
      <div className="space-y-2">
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <RadioGroup
          value={(value as string) || ''}
          onValueChange={(v) => handleChange(v)}
          disabled={disabled}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${field.id}-yes`} />
            <Label htmlFor={`${field.id}-yes`} className="cursor-pointer">Yes</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${field.id}-no`} />
            <Label htmlFor={`${field.id}-no`} className="cursor-pointer">No</Label>
          </div>
        </RadioGroup>
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Yes/No/NA
  if (field.type === 'yes_no_na') {
    return (
      <div className="space-y-2">
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <RadioGroup
          value={(value as string) || ''}
          onValueChange={(v) => handleChange(v)}
          disabled={disabled}
          className="flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="yes" id={`${field.id}-yes`} />
            <Label htmlFor={`${field.id}-yes`} className="cursor-pointer">Yes</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="no" id={`${field.id}-no`} />
            <Label htmlFor={`${field.id}-no`} className="cursor-pointer">No</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="na" id={`${field.id}-na`} />
            <Label htmlFor={`${field.id}-na`} className="cursor-pointer">N/A</Label>
          </div>
        </RadioGroup>
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Dropdown
  if (field.type === 'dropdown') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Select
          value={(value as string) || ''}
          onValueChange={(v) => handleChange(v)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {field.options?.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Table/Grid
  if (field.type === 'table') {
    const tableData = (value as Array<Record<string, unknown>>) || [];
    const columns = field.tableConfig?.columns || [];

    const addRow = () => {
      const newRow: Record<string, unknown> = {};
      columns.forEach(col => {
        newRow[col.id] = col.type === 'checkbox' ? false : '';
      });
      handleChange([...tableData, newRow]);
    };

    const updateRow = (rowIndex: number, colId: string, newValue: unknown) => {
      const updated = [...tableData];
      updated[rowIndex] = { ...updated[rowIndex], [colId]: newValue };
      handleChange(updated);
    };

    const removeRow = (rowIndex: number) => {
      const updated = tableData.filter((_, i) => i !== rowIndex);
      handleChange(updated);
    };

    return (
      <div className="space-y-2 col-span-2">
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Card>
          <CardContent className="p-4">
            {/* Table Header */}
            <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 40px` }}>
              {columns.map(col => (
                <div key={col.id} className="text-sm font-medium text-muted-foreground">
                  {col.label}
                </div>
              ))}
              <div />
            </div>

            {/* Table Rows */}
            {tableData.map((row, rowIndex) => (
              <div 
                key={rowIndex} 
                className="grid gap-2 mb-2 items-center" 
                style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr) 40px` }}
              >
                {columns.map(col => (
                  <div key={col.id}>
                    {col.type === 'checkbox' ? (
                      <Checkbox
                        checked={(row[col.id] as boolean) || false}
                        onCheckedChange={(checked) => updateRow(rowIndex, col.id, checked)}
                        disabled={disabled}
                      />
                    ) : col.type === 'number' ? (
                      <Input
                        type="number"
                        value={(row[col.id] as number) ?? ''}
                        onChange={(e) => updateRow(rowIndex, col.id, e.target.valueAsNumber || '')}
                        disabled={disabled}
                        className="h-8"
                      />
                    ) : col.type === 'date' ? (
                      <Input
                        type="date"
                        value={(row[col.id] as string) || ''}
                        onChange={(e) => updateRow(rowIndex, col.id, e.target.value)}
                        disabled={disabled}
                        className="h-8"
                      />
                    ) : (
                      <Input
                        value={(row[col.id] as string) || ''}
                        onChange={(e) => updateRow(rowIndex, col.id, e.target.value)}
                        disabled={disabled}
                        className="h-8"
                      />
                    )}
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeRow(rowIndex)}
                  disabled={disabled}
                  className="h-8 w-8"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            {/* Add Row */}
            {!disabled && (
              <Button
                variant="outline"
                size="sm"
                onClick={addRow}
                className="mt-2"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Row
              </Button>
            )}
          </CardContent>
        </Card>
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // File upload placeholder
  if (field.type === 'file') {
    return (
      <div className="space-y-2">
        <Label htmlFor={field.id}>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Input
          id={field.id}
          type="file"
          disabled={disabled}
          className="cursor-pointer"
        />
        {field.helpText && (
          <p className="text-xs text-muted-foreground">{field.helpText}</p>
        )}
      </div>
    );
  }

  // Signature placeholder - actual capture in SignaturePad component
  if (field.type === 'signature') {
    return (
      <div className="space-y-2 col-span-2">
        <Label>
          {field.label}
          {field.required && <span className="text-destructive ml-1">*</span>}
        </Label>
        <Card className="border-2 border-dashed border-border">
          <CardContent className="py-8 text-center text-muted-foreground">
            <span className="text-sm">Signature captured during submission workflow</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      <Input
        id={field.id}
        value={(value as string) || ''}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled}
      />
    </div>
  );
};

export default FieldRenderer;
