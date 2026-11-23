import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { ArrowLeft, CheckCircle2, Link2Off, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { notify, normaliseError } from '@/shared/lib/notify';
import { AuthCard, AuthLayout } from '@/modules/auth/components/brand/AuthLayout';
import { FieldError, FormAlert, PasswordField, PasswordStrengthMeter } from '@/modules/auth/components/brand/AuthFields';
import { describedBy } from '@/modules/auth/components/brand/describedBy';
import { PASSWORD_MIN_LENGTH } from '@/modules/auth/components/brand/passwordStrength';

const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`);

/** How long to wait for Supabase to turn the email link into a session before calling the link unusable. */
export const RESET_LINK_TIMEOUT_MS = 5000;
/** Pause on "Password changed" before continuing into STORM. */
export const RESET_DONE_REDIRECT_MS = 2500;
const AFTER_RESET_PATH = '/dashboard';

type Status = 'checking' | 'ready' | 'invalid' | 'done';
type Field = 'password' | 'confirm';

const IDS = {
  password: 'reset-password',
  confirm: 'reset-confirm',
  strength: 'reset-password-strength',
  formError: 'reset-form-error',
} as const;
const errorIdFor = (field: Field) => `${IDS[field]}-error`;

/**
 * STORM's own sentence for each known link-error code Supabase puts in the
 * hash (or query) when a link is expired or used. The URL's
 * `error_description` is never shown: it is attacker-controlled text on an
 * auth page, so an unknown code (or only a description) gets the generic
 * sentence instead.
 */
const LINK_ERROR_COPY: Readonly<Record<string, string>> = Object.freeze({
  otp_expired: 'This reset link has expired or was already used.',
  flow_state_expired: 'This reset link has expired.',
  flow_state_not_found: 'This reset link is no longer valid.',
  access_denied: 'This reset link cannot be used.',
});
const GENERIC_LINK_ERROR = 'This reset link cannot be used.';

function linkErrorFromUrl(): string | null {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const code = hash.get('error_code') ?? query.get('error_code') ?? hash.get('error') ?? query.get('error');
  const hasError = code !== null || hash.has('error_description') || query.has('error_description');
  if (!hasError) return null;
  if (code && Object.prototype.hasOwnProperty.call(LINK_ERROR_COPY, code)) return LINK_ERROR_COPY[code];
  return GENERIC_LINK_ERROR;
}

const iconTile = (tone: 'critical' | 'success' | 'signal', icon: React.ReactNode) => (
  <span
    aria-hidden="true"
    className={
      tone === 'critical'
        ? 'mb-3 grid size-11 place-items-center rounded-full bg-critical-muted text-critical'
        : tone === 'success'
          ? 'mb-3 grid size-11 place-items-center rounded-full bg-success-muted text-success'
          : 'mb-3 grid size-11 place-items-center rounded-full bg-signal-muted text-primary'
    }
  >
    {icon}
  </span>
);

/**
 * Set a new password from the email link (BUILD-PLAN S6). The link signs the
 * user in with a recovery session; until that session exists the form is not
 * shown, and an expired or used link says so with a way to ask for another.
 */
const ResetPassword: React.FC = () => {
  const navigate = useNavigate();
  const [linkError] = useState<string | null>(linkErrorFromUrl);
  const [status, setStatus] = useState<Status>(() => (linkError ? 'invalid' : 'checking'));
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (linkError) return;
    let active = true;
    const accept = (session: Session | null, recovery = false) => {
      if (!active || (!session && !recovery)) return;
      if (session?.user?.email) setAccountEmail(session.user.email);
      // A late recovery event still rescues an "invalid" verdict from the timeout.
      setStatus((current) => (current === 'done' ? current : 'ready'));
    };
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') accept(session, true);
      else if (event === 'SIGNED_IN') accept(session);
    });
    supabase.auth
      .getSession()
      .then(({ data }) => accept(data.session))
      .catch(() => {
        /* the timeout below decides */
      });
    const timer = window.setTimeout(() => {
      if (active) setStatus((current) => (current === 'checking' ? 'invalid' : current));
    }, RESET_LINK_TIMEOUT_MS);
    return () => {
      active = false;
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, [linkError]);

  useEffect(() => {
    if (status !== 'done') return;
    const timer = window.setTimeout(() => navigate(AFTER_RESET_PATH, { replace: true }), RESET_DONE_REDIRECT_MS);
    return () => window.clearTimeout(timer);
  }, [status, navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const next: Partial<Record<Field, string>> = {};
    const result = newPasswordSchema.safeParse(password);
    if (!result.success) next.password = result.error.issues[0]?.message;
    if (!confirm) next.confirm = 'Enter the new password again';
    else if (password !== confirm) next.confirm = 'The two passwords do not match';
    setErrors(next);
    if (next.password) {
      passwordRef.current?.focus();
      return;
    }
    if (next.confirm) {
      confirmRef.current?.focus();
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        const message = normaliseError(error, 'The password could not be changed.').message;
        setFormError(message);
        notify.error(message, { title: 'Could not change the password', id: 'reset-password' });
        return;
      }
      setStatus('done');
      notify.success('Password changed');
    } catch (error) {
      const message = normaliseError(error, 'The password could not be changed.').message;
      setFormError(message);
      notify.error(message, { title: 'Could not change the password', id: 'reset-password' });
    } finally {
      setIsSaving(false);
    }
  };

  const clearOnEdit = (field: Field, setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  if (status === 'checking') {
    return (
      <AuthLayout>
        <AuthCard
          title="Checking your reset link"
          icon={iconTile('signal', <Loader2 className="size-5 animate-spin" />)}
          description={
            <p role="status" aria-busy="true">
              This takes a moment.
            </p>
          }
        />
      </AuthLayout>
    );
  }

  if (status === 'invalid') {
    return (
      <AuthLayout>
        <AuthCard
          title="This link can't be used"
          icon={iconTile('critical', <Link2Off className="size-5" />)}
          description={
            <p>
              {linkError ? `${linkError} ` : ''}Reset links work once and expire after a short time. Ask for a new one and use the
              latest email.
            </p>
          }
        >
          <div className="space-y-3">
            <Button
              type="button"
              variant="signal"
              className="w-full"
              onClick={() => navigate('/auth', { state: { mode: 'forgot-password' } })}
            >
              Request a new link
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={() => navigate('/auth')}>
              <ArrowLeft aria-hidden="true" />
              Back to sign in
            </Button>
          </div>
        </AuthCard>
      </AuthLayout>
    );
  }

  if (status === 'done') {
    return (
      <AuthLayout>
        <AuthCard
          title="Password changed"
          icon={iconTile('success', <CheckCircle2 className="size-5" />)}
          description={<p role="status">You're signed in with your new password. Taking you to STORM…</p>}
        >
          <Button type="button" variant="signal" className="w-full" onClick={() => navigate(AFTER_RESET_PATH, { replace: true })}>
            Continue to STORM
          </Button>
        </AuthCard>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <AuthCard
        title="Set a new password"
        description={
          accountEmail ? (
            <>
              For <span className="break-all font-medium text-foreground">{accountEmail}</span>. Use at least {PASSWORD_MIN_LENGTH}{' '}
              characters.
            </>
          ) : (
            `Use at least ${PASSWORD_MIN_LENGTH} characters.`
          )
        }
      >
        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-label="Set a new password"
          aria-busy={isSaving || undefined}
          aria-describedby={formError ? IDS.formError : undefined}
        >
          {/* Lets password managers file the new password under the right account. */}
          {accountEmail ? (
            <input
              type="email"
              name="username"
              autoComplete="username"
              value={accountEmail}
              readOnly
              hidden
            />
          ) : null}

          {formError ? <FormAlert id={IDS.formError}>{formError}</FormAlert> : null}

          <div className="space-y-1.5">
            <Label htmlFor={IDS.password}>New password</Label>
            <PasswordField
              ref={passwordRef}
              id={IDS.password}
              name="new-password"
              autoComplete="new-password"
              enterKeyHint="next"
              value={password}
              onChange={clearOnEdit('password', setPassword)}
              visible={visible}
              onToggleVisible={() => setVisible((v) => !v)}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={describedBy(errors.password && errorIdFor('password'), password && IDS.strength)}
            />
            <FieldError id={errorIdFor('password')}>{errors.password}</FieldError>
            <PasswordStrengthMeter id={IDS.strength} password={password} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={IDS.confirm}>Confirm new password</Label>
            <PasswordField
              ref={confirmRef}
              id={IDS.confirm}
              name="confirm-password"
              autoComplete="new-password"
              enterKeyHint="done"
              value={confirm}
              onChange={clearOnEdit('confirm', setConfirm)}
              visible={visible}
              onToggleVisible={() => setVisible((v) => !v)}
              aria-invalid={errors.confirm ? true : undefined}
              aria-describedby={describedBy(errors.confirm && errorIdFor('confirm'))}
            />
            <FieldError id={errorIdFor('confirm')}>{errors.confirm}</FieldError>
          </div>

          <Button type="submit" variant="signal" className="w-full" disabled={isSaving}>
            {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isSaving ? 'Saving…' : 'Save new password'}
          </Button>
        </form>
      </AuthCard>
    </AuthLayout>
  );
};

export default ResetPassword;
