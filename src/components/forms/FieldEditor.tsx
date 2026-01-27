import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { 
  GripVertical, Trash2, ChevronDown, ChevronUp, Plus, X
} from 'lucide-react';
import type { FormField } from '@/pages/ism/forms/CreateTemplate';

const FIELD_TYPES = [
  { value: 'text', label: 'Text Input', icon: '📝' },
  { value: 'textarea', label: 'Text Area', icon: '📄' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑️' },
  { value: 'yes_no', label: 'Yes / No', icon: '✓✗' },
  { value: 'yes_no_na', label: 'Yes / No / N/A', icon: '✓✗−' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'datetime', label: 'Date & Time', icon: '🕐' },
  { value: 'time', label: 'Time Only', icon: '⏰' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'dropdown', label: 'Dropdown', icon: '▼' },
  { value: 'signature', label: 'Signature', icon: '✍️' },
  { value: 'table', label: 'Table Grid', icon: '▦' },
  { value: 'file', label: 'File Upload', icon: '📎' },
  { value: 'section', label: 'Section Header', icon: '§' }
];

interface FieldEditorProps {
  field: FormField;
  index: number;
  totalFields: number;
  allFields: FormField[];
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
}

const FieldEditor: React.FC<FieldEditorProps> = ({
  field,
  index,
  totalFields,
  allFields,
  onUpdate,
  onDelete,
  onMove
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const typeInfo = FIELD_TYPES.find(t => t.value === field.type);

  const addOption = () => {
    const options = [...(field.options || []), `Option ${(field.options?.length || 0) + 1}`];
    onUpdate({ options });
  };

  const updateOption = (optIndex: number, value: string) => {
    const options = [...(field.options || [])];
    options[optIndex] = value;
    onUpdate({ options });
  };

  const removeOption = (optIndex: number) => {
    const options = (field.options || []).filter((_, i) => i !== optIndex);
    onUpdate({ options });
  };

  const addTableColumn = () => {
    const columns = [
      ...(field.tableConfig?.columns || []),
      { id: `col_${Date.now()}`, label: 'New Column', type: 'text' }
    ];
    onUpdate({ tableConfig: { ...field.tableConfig, columns } });
  };

  const updateTableColumn = (colIndex: number, updates: Partial<{ label: string; type: string }>) => {
    const columns = [...(field.tableConfig?.columns || [])];
    columns[colIndex] = { ...columns[colIndex], ...updates };
    onUpdate({ tableConfig: { ...field.tableConfig, columns } });
  };

  const removeTableColumn = (colIndex: number) => {
    const columns = (field.tableConfig?.columns || []).filter((_, i) => i !== colIndex);
    onUpdate({ tableConfig: { ...field.tableConfig, columns } });
  };

  return (
    <Card className="border">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <div className="flex items-center gap-3 p-4">
          {/* Drag Handle */}
          <div className="flex flex-col gap-0.5 text-muted-foreground cursor-move">
            {index > 0 && (
              <button onClick={() => onMove(index, index - 1)} className="hover:text-foreground">
                <ChevronUp className="h-4 w-4" />
              </button>
            )}
            <GripVertical className="h-4 w-4" />
            {index < totalFields - 1 && (
              <button onClick={() => onMove(index, index + 1)} className="hover:text-foreground">
                <ChevronDown className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Field Icon & Label */}
          <span className="text-xl">{typeInfo?.icon || '📝'}</span>
          <div className="flex-1">
            <Input
              value={field.label}
              onChange={(e) => onUpdate({ label: e.target.value })}
              className="font-medium border-0 p-0 h-auto focus-visible:ring-0"
              placeholder="Field label"
            />
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="secondary" className="text-xs">
                {typeInfo?.label || field.type}
              </Badge>
              {field.required && (
                <Badge variant="destructive" className="text-xs">Required</Badge>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <Button variant="ghost" size="sm" onClick={onDelete}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        <CollapsibleContent>
          <CardContent className="pt-0 border-t">
            <div className="grid grid-cols-2 gap-4 pt-4">
              {/* Field Type */}
              <div>
                <Label>Field Type</Label>
                <Select value={field.type} onValueChange={(value) => onUpdate({ type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.icon} {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Required Toggle */}
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.required}
                  onCheckedChange={(checked) => onUpdate({ required: checked })}
                />
                <Label>Required field</Label>
              </div>

              {/* Placeholder (for text fields) */}
              {['text', 'textarea', 'number'].includes(field.type) && (
                <div className="col-span-2">
                  <Label>Placeholder</Label>
                  <Input
                    value={field.placeholder || ''}
                    onChange={(e) => onUpdate({ placeholder: e.target.value })}
                    placeholder="Placeholder text..."
                  />
                </div>
              )}

              {/* Options (for dropdown) */}
              {field.type === 'dropdown' && (
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Options</Label>
                    <Button variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-3 w-3 mr-1" /> Add
                    </Button>
                  </div>
                  {field.options?.map((option, optIndex) => (
                    <div key={optIndex} className="flex items-center gap-2">
                      <Input
                        value={option}
                        onChange={(e) => updateOption(optIndex, e.target.value)}
                      />
                      <Button variant="ghost" size="sm" onClick={() => removeOption(optIndex)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Table Configuration */}
              {field.type === 'table' && (
                <div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Table Columns</Label>
                    <Button variant="outline" size="sm" onClick={addTableColumn}>
                      <Plus className="h-3 w-3 mr-1" /> Add Column
                    </Button>
                  </div>
                  {field.tableConfig?.columns?.map((col, colIndex) => (
                    <div key={col.id} className="flex items-center gap-2">
                      <Input
                        value={col.label}
                        onChange={(e) => updateTableColumn(colIndex, { label: e.target.value })}
                        placeholder="Column label"
                        className="flex-1"
                      />
                      <Select
                        value={col.type}
                        onValueChange={(value) => updateTableColumn(colIndex, { type: value })}
                      >
                        <SelectTrigger className="w-[120px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                          <SelectItem value="checkbox">Checkbox</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" onClick={() => removeTableColumn(colIndex)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Conditional Logic */}
              <div className="col-span-2">
                <Label>Conditional Display</Label>
                <Select
                  value={field.conditionalOn?.fieldId || 'none'}
                  onValueChange={(value) => {
                    if (value === 'none') {
                      onUpdate({ conditionalOn: undefined });
                    } else {
                      onUpdate({ conditionalOn: { fieldId: value, value: '' } });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Always show" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Always show</SelectItem>
                    {allFields
                      .filter(f => f.id !== field.id && ['yes_no', 'yes_no_na', 'dropdown', 'checkbox'].includes(f.type))
                      .map(f => (
                        <SelectItem key={f.id} value={f.id}>
                          Show if "{f.label}" is...
                        </SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
                {field.conditionalOn?.fieldId && (
                  <Input
                    className="mt-2"
                    value={field.conditionalOn.value}
                    onChange={(e) => onUpdate({ 
                      conditionalOn: { ...field.conditionalOn!, value: e.target.value } 
                    })}
                    placeholder="...equal to this value"
                  />
                )}
              </div>

              {/* Number Validation */}
              {field.type === 'number' && (
                <>
                  <div>
                    <Label>Minimum Value</Label>
                    <Input
                      type="number"
                      value={field.validation?.min || ''}
                      onChange={(e) => onUpdate({ 
                        validation: { ...field.validation, min: parseInt(e.target.value) } 
                      })}
                    />
                  </div>
                  <div>
                    <Label>Maximum Value</Label>
                    <Input
                      type="number"
                      value={field.validation?.max || ''}
                      onChange={(e) => onUpdate({ 
                        validation: { ...field.validation, max: parseInt(e.target.value) } 
                      })}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default FieldEditor;
