import React from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { passwordStrength } from './passwordStrength';

/**
 * Form pieces shared by the sign-in and reset screens. Controls take their
 * height from `--control-h` (D-35: 44 px on coarse pointers in every
 * density); inline errors are linked to their field with `aria-describedby`
 * and the field carries `aria-invalid`.
 */

/** An inline field error. Renders nothing without a message. */
export function FieldError({ id, children }: { id: string; children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="flex items-start gap-1.5 type-body-sm text-destructive" data-field-error="">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** A form-level error or notice (role=alert, so it is announced when it appears). */
export function FormAlert({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      role="alert"
      className="flex items-start gap-2 rounded-md border border-critical/40 bg-critical-muted px-3 py-2.5 type-body-sm text-critical"
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

interface PasswordFieldProps extends Omit<React.ComponentProps<typeof Input>, 'type'> {
  id: string;
  visible: boolean;
  onToggleVisible: () => void;
}

/** Password input with a show/hide toggle that is a full control-height target. */
export const PasswordField = React.forwardRef<HTMLInputElement, PasswordFieldProps>(
  ({ id, visible, onToggleVisible, className, ...props }, ref) => (
    <div className="relative">
      <Input
        ref={ref}
        id={id}
        type={visible ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={cn('pr-[var(--control-h)] aria-[invalid=true]:border-destructive', className)}
        {...props}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label="Show password"
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0 right-0 inline-flex w-[var(--control-h)] items-center justify-center rounded-r-md text-muted-foreground transition-colors duration-quick ease-tide hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        {visible ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
      </button>
    </div>
  ),
);
PasswordField.displayName = 'PasswordField';

const STRENGTH_TONE = {
  weak: { bar: 'bg-destructive', text: 'text-destructive' },
  medium: { bar: 'bg-warning', text: 'text-warning' },
  strong: { bar: 'bg-success', text: 'text-success' },
} as const;

/** Strength hint under a new password. Renders nothing until something is typed. */
export function PasswordStrengthMeter({ id, password }: { id: string; password: string }) {
  if (!password) return null;
  const strength = passwordStrength(password);
  const tone = STRENGTH_TONE[strength.level];
  return (
    <div id={id} className="space-y-1.5" data-password-strength={strength.level}>
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn('h-1 flex-1 rounded-full transition-colors duration-quick ease-tide', step <= strength.score ? tone.bar : 'bg-border')}
          />
        ))}
      </div>
      <p className="type-caption text-muted-foreground" aria-live="polite">
        Strength: <span className={tone.text}>{strength.label}</span>
      </p>
    </div>
  );
}
