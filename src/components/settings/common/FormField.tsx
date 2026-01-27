import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
  // Input-specific props
  type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'textarea';
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  rows?: number;
}

const FormField: React.FC<FormFieldProps> = ({
  id,
  label,
  hint,
  error,
  required = false,
  disabled = false,
  className,
  children,
  type = 'text',
  placeholder,
  value,
  defaultValue,
  onChange,
  rows = 3,
}) => {
  const hasError = Boolean(error);

  const renderInput = () => {
    if (children) return children;

    const commonProps = {
      id,
      placeholder,
      value,
      defaultValue,
      onChange,
      disabled,
      className: cn(
        hasError && 'border-destructive focus-visible:ring-destructive',
        disabled && 'bg-muted cursor-not-allowed'
      ),
    };

    if (type === 'textarea') {
      return <Textarea {...commonProps} rows={rows} />;
    }

    return <Input {...commonProps} type={type} />;
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Label 
        htmlFor={id} 
        className={cn(
          'text-sm font-medium',
          hasError && 'text-destructive'
        )}
      >
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      
      {renderInput()}
      
      {hint && !error && (
        <p className="text-xs text-muted-foreground">{hint}</p>
      )}
      
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
};

export default FormField;
