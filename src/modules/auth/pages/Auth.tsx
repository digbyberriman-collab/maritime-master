import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MailCheck } from 'lucide-react';
import { z } from 'zod';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify, normaliseError } from '@/shared/lib/notify';
import { lovable } from '@/integrations/lovable';
import { supabase } from '@/integrations/supabase/client';
import { AuthCard, AuthLayout } from '@/modules/auth/components/brand/AuthLayout';
import { FieldError, FormAlert, PasswordField, PasswordStrengthMeter } from '@/modules/auth/components/brand/AuthFields';
import { describedBy } from '@/modules/auth/components/brand/describedBy';
import { PASSWORD_MIN_LENGTH } from '@/modules/auth/components/brand/passwordStrength';
import googleMark from '@/modules/auth/components/brand/google-g.svg';
import { afterSignInPath, initialAuthMode, type AuthMode } from './authRedirect';

const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('Enter a valid email address, like name@company.com');
const newPasswordSchema = z.string().min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`);

const roles = [
  { value: 'master', label: 'Master' },
  { value: 'chief_engineer', label: 'Chief Engineer' },
  { value: 'chief_officer', label: 'Chief Officer' },
  { value: 'crew', label: 'Crew' },
  { value: 'dpa', label: 'DPA' },
  { value: 'shore_management', label: 'Shore Management' },
] as const;

type FieldName = 'email' | 'password' | 'firstName' | 'lastName' | 'companyName';
type FieldErrors = Partial<Record<FieldName, string>>;

/** DOM order, so the first invalid field gets focus. */
const FIELD_IDS: Record<FieldName, string> = {
  email: 'auth-email',
  password: 'auth-password',
  firstName: 'auth-first-name',
  lastName: 'auth-last-name',
  companyName: 'auth-company',
};
const FIELD_ORDER = Object.keys(FIELD_IDS) as FieldName[];
const errorIdFor = (field: FieldName) => `${FIELD_IDS[field]}-error`;
const FORM_ERROR_ID = 'auth-form-error';

const COPY: Record<AuthMode, { title: string; description: string; submit: string; busy: string }> = {
  login: {
    title: 'Sign in',
    description: 'Welcome back. Use your STORM account to continue.',
    submit: 'Sign in',
    busy: 'Signing in…',
  },
  register: {
    title: 'Create your account',
    description: 'Set up STORM for your fleet.',
    submit: 'Create account',
    busy: 'Creating account…',
  },
  'forgot-password': {
    title: 'Reset your password',
    description: "Enter your account email and we'll send you a link to set a new password.",
    submit: 'Send reset link',
    busy: 'Sending…',
  },
};

/** Auth API messages, reworded where the raw text does not say what to do. */
function signInErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/invalid login credentials/i.test(raw)) {
    return 'That email and password do not match an account. Check the email address, or use "Forgot password?" to set a new password.';
  }
  if (/email not confirmed/i.test(raw)) {
    return 'This account has not been confirmed yet. Check your inbox for the confirmation email.';
  }
  return normaliseError(error, 'Sign-in failed. Try again.').message;
}

/** A text button that is a 44 px target on touch screens (D-35). */
const textButtonClass =
  'inline-flex items-center gap-1.5 rounded-sm type-body-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card [@media(pointer:coarse)]:min-h-11';

interface AuthProps {
  /** Opens the screen in this mode (tests, and `state.mode` from other screens). */
  initialMode?: AuthMode;
}

/**
 * Sign-in screen (BUILD-PLAN S6, gap/10 DS22): Abyss hero, STORM wordmark,
 * one card. Self-registration is closed (accounts come by invitation, see the
 * sign-up backstop migration); the register mode stays for `initialMode`.
 */
const Auth: React.FC<AuthProps> = ({ initialMode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn, signUp, resetPassword, user } = useAuth();

  const [mode, setMode] = useState<AuthMode>(() => initialAuthMode(location.state, initialMode ?? 'login'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<(typeof roles)[number]['value']>('crew');
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);

  const fieldRefs = useRef<Partial<Record<FieldName, HTMLInputElement | null>>>({});
  const focusEmailOnModeChange = useRef(false);
  const afterSignIn = afterSignInPath(location.state);
  const copy = COPY[mode];

  useEffect(() => {
    if (user) navigate(afterSignIn, { replace: true });
  }, [user, navigate, afterSignIn]);

  useEffect(() => {
    if (!focusEmailOnModeChange.current) return;
    focusEmailOnModeChange.current = false;
    fieldRefs.current.email?.focus();
  }, [mode, resetSentTo]);

  const switchMode = (next: AuthMode) => {
    focusEmailOnModeChange.current = true;
    setMode(next);
    setFieldErrors({});
    setFormError(null);
    setResetSentTo(null);
  };

  const setRef = (field: FieldName) => (el: HTMLInputElement | null) => {
    fieldRefs.current[field] = el;
  };

  /** Clears a field's error as soon as the user edits it. */
  const edit = (field: FieldName, setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setter(event.target.value);
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fieldA11y = (field: FieldName, ...extra: Array<string | false | undefined>) => ({
    'aria-invalid': fieldErrors[field] ? true : undefined,
    'aria-describedby': describedBy(fieldErrors[field] && errorIdFor(field), ...extra),
  });

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) next.email = emailResult.error.issues[0]?.message;
    if (mode === 'login' && !password) next.password = 'Enter your password';
    if (mode === 'register') {
      const passwordResult = newPasswordSchema.safeParse(password);
      if (!passwordResult.success) next.password = passwordResult.error.issues[0]?.message;
      if (!firstName.trim()) next.firstName = 'Enter your first name';
      if (!lastName.trim()) next.lastName = 'Enter your last name';
      if (!companyName.trim()) next.companyName = 'Enter your company name';
    }
    return next;
  };

  const fail = (message: string, title: string, id: string) => {
    setFormError(message);
    notify.error(message, { title, id });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const errors = validate();
    setFieldErrors(errors);
    const firstInvalid = FIELD_ORDER.find((field) => errors[field]);
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }

    setIsLoading(true);
    try {
      if (mode === 'login') {
        const { error } = await signIn(email.trim(), password);
        if (error) {
          fail(signInErrorMessage(error), 'Sign-in failed', 'auth-sign-in');
          return;
        }
        navigate(afterSignIn, { replace: true });
      } else if (mode === 'register') {
        const { error } = await signUp({ email: email.trim(), password, firstName, lastName, companyName, role });
        if (error) {
          fail(normaliseError(error, 'The account could not be created.').message, 'Could not create the account', 'auth-register');
          return;
        }
        notify.success('Account created', { description: 'Welcome to STORM.' });
        navigate(afterSignIn, { replace: true });
      } else {
        const { error } = await resetPassword(email.trim());
        if (error) {
          fail(normaliseError(error, 'The reset link could not be sent.').message, 'Could not send the reset link', 'auth-reset');
          return;
        }
        setResetSentTo(email.trim());
        notify.success('Reset link sent', { description: 'Check your inbox for an email from STORM.' });
      }
    } catch (error) {
      fail(normaliseError(error).message, 'Something went wrong', 'auth-unexpected');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setFormError(null);
    const failGoogle = (message: string) => {
      fail(message, 'Google sign-in failed', 'auth-google');
      setIsLoading(false);
    };
    try {
      // Watchdog: if the Google flow neither redirects nor answers, stop
      // spinning and say so instead of hanging on the loading state.
      const timeout = new Promise<'timeout'>((resolve) => window.setTimeout(() => resolve('timeout'), 20000));
      const result = await Promise.race([
        lovable.auth.signInWithOAuth('google', {
          redirect_uri: window.location.origin,
          extraParams: { prompt: 'select_account' },
        }),
        timeout,
      ]);
      if (result === 'timeout') {
        failGoogle('Google sign-in did not respond. Check that pop-ups are allowed, or sign in with your email and password.');
        return;
      }
      if (result.error) {
        failGoogle(normaliseError(result.error, 'Please try again.').message);
        return;
      }
      if (result.redirected) return;

      // No redirect and no error: confirm a session exists before navigating,
      // or the protected route bounces straight back here.
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        failGoogle('Google did not return a signed-in session. Try again, or sign in with your email and password.');
        return;
      }
      navigate(afterSignIn, { replace: true });
    } catch (error) {
      failGoogle(normaliseError(error, 'Please try again.').message);
    }
  };

  if (mode === 'forgot-password' && resetSentTo) {
    return (
      <AuthLayout>
        <AuthCard
          title="Check your inbox"
          icon={
            <span className="mb-3 grid size-11 place-items-center rounded-full bg-signal-muted text-primary" aria-hidden="true">
              <MailCheck className="size-5" />
            </span>
          }
          description={
            <p role="status">
              If an account exists for <span className="break-all font-medium text-foreground">{resetSentTo}</span>, a link to set a
              new password is on its way. It can take a few minutes to arrive.
            </p>
          }
        >
          {/* The form is gone, so focus moves to the one action left. */}
          <Button type="button" variant="outline" className="w-full" onClick={() => switchMode('login')} autoFocus>
            <ArrowLeft aria-hidden="true" />
            Back to sign in
          </Button>
        </AuthCard>
      </AuthLayout>
    );
  }

  const isNewPassword = mode === 'register';

  return (
    <AuthLayout>
      <AuthCard title={copy.title} description={copy.description}>
        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4"
          aria-label={copy.title}
          aria-busy={isLoading || undefined}
          aria-describedby={formError ? FORM_ERROR_ID : undefined}
        >
          {formError ? <FormAlert id={FORM_ERROR_ID}>{formError}</FormAlert> : null}

          <div className="space-y-1.5">
            <Label htmlFor={FIELD_IDS.email}>Email</Label>
            <Input
              ref={setRef('email')}
              id={FIELD_IDS.email}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={mode === 'forgot-password' ? 'send' : 'next'}
              placeholder="name@company.com"
              value={email}
              onChange={edit('email', setEmail)}
              className="aria-[invalid=true]:border-destructive"
              {...fieldA11y('email')}
            />
            <FieldError id={errorIdFor('email')}>{fieldErrors.email}</FieldError>
          </div>

          {mode !== 'forgot-password' ? (
            <div className="space-y-1.5">
              <div className="flex min-h-5 items-center justify-between gap-2">
                <Label htmlFor={FIELD_IDS.password}>Password</Label>
                {mode === 'login' ? (
                  <button type="button" onClick={() => switchMode('forgot-password')} className={textButtonClass}>
                    Forgot password?
                  </button>
                ) : null}
              </div>
              <PasswordField
                ref={setRef('password')}
                id={FIELD_IDS.password}
                name="password"
                autoComplete={isNewPassword ? 'new-password' : 'current-password'}
                enterKeyHint={isNewPassword ? 'next' : 'go'}
                value={password}
                onChange={edit('password', setPassword)}
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                {...fieldA11y('password', isNewPassword && password ? 'auth-password-strength' : undefined)}
              />
              <FieldError id={errorIdFor('password')}>{fieldErrors.password}</FieldError>
              {isNewPassword ? <PasswordStrengthMeter id="auth-password-strength" password={password} /> : null}
            </div>
          ) : null}

          {mode === 'register' ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={FIELD_IDS.firstName}>First name</Label>
                  <Input
                    ref={setRef('firstName')}
                    id={FIELD_IDS.firstName}
                    name="given-name"
                    autoComplete="given-name"
                    enterKeyHint="next"
                    value={firstName}
                    onChange={edit('firstName', setFirstName)}
                    className="aria-[invalid=true]:border-destructive"
                    {...fieldA11y('firstName')}
                  />
                  <FieldError id={errorIdFor('firstName')}>{fieldErrors.firstName}</FieldError>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={FIELD_IDS.lastName}>Last name</Label>
                  <Input
                    ref={setRef('lastName')}
                    id={FIELD_IDS.lastName}
                    name="family-name"
                    autoComplete="family-name"
                    enterKeyHint="next"
                    value={lastName}
                    onChange={edit('lastName', setLastName)}
                    className="aria-[invalid=true]:border-destructive"
                    {...fieldA11y('lastName')}
                  />
                  <FieldError id={errorIdFor('lastName')}>{fieldErrors.lastName}</FieldError>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={FIELD_IDS.companyName}>Company</Label>
                <Input
                  ref={setRef('companyName')}
                  id={FIELD_IDS.companyName}
                  name="organization"
                  autoComplete="organization"
                  enterKeyHint="next"
                  value={companyName}
                  onChange={edit('companyName', setCompanyName)}
                  className="aria-[invalid=true]:border-destructive"
                  {...fieldA11y('companyName')}
                />
                <FieldError id={errorIdFor('companyName')}>{fieldErrors.companyName}</FieldError>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="auth-role">Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger id="auth-role">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : null}

          <Button type="submit" variant="signal" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {isLoading ? copy.busy : copy.submit}
          </Button>

          {mode === 'forgot-password' ? (
            <div className="flex justify-center">
              <button type="button" onClick={() => switchMode('login')} className={textButtonClass}>
                <ArrowLeft aria-hidden="true" className="size-4" />
                Back to sign in
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3" aria-hidden="true">
                <span className="h-px flex-1 bg-border" />
                <span className="type-caption text-muted-foreground">or</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button type="button" variant="outline" className="w-full bg-transparent" onClick={handleGoogleSignIn} disabled={isLoading}>
                <img src={googleMark} alt="" aria-hidden="true" className="size-4" />
                Continue with Google
              </Button>
            </>
          )}

          {mode === 'register' ? (
            <p className="text-center type-body-sm text-muted-foreground">
              Already have an account?{' '}
              <button type="button" onClick={() => switchMode('login')} className={textButtonClass}>
                Sign in
              </button>
            </p>
          ) : null}
        </form>
      </AuthCard>

      {mode === 'login' ? (
        <p className="mt-6 text-balance text-center type-body-sm text-muted-foreground">
          Need an account? Ask your DPA or fleet administrator for an invitation.
        </p>
      ) : null}
    </AuthLayout>
  );
};

export default Auth;
