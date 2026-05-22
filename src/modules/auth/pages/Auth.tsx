import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { z } from 'zod';
import InkfishWatermark from '@/shared/components/InkfishWatermark';
import { lovable } from '@/integrations/lovable';

type AuthMode = 'login' | 'register' | 'forgot-password';

const emailSchema = z.string().trim().email('Invalid email address');
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters');

const roles = [
  { value: 'master', label: 'Master' },
  { value: 'chief_engineer', label: 'Chief Engineer' },
  { value: 'chief_officer', label: 'Chief Officer' },
  { value: 'crew', label: 'Crew' },
  { value: 'dpa', label: 'DPA' },
  { value: 'shore_management', label: 'Shore Management' },
] as const;

const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
  let strength = 0;
  if (password.length >= 8) strength++;
  if (password.length >= 12) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^A-Za-z0-9]/.test(password)) strength++;

  if (strength <= 2) return { strength, label: 'Weak', color: 'bg-destructive' };
  if (strength <= 3) return { strength, label: 'Medium', color: 'bg-yellow-500' };
  return { strength, label: 'Strong', color: 'bg-success' };
};

const Auth: React.FC = () => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState<typeof roles[number]['value']>('crew');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { signIn, signUp, resetPassword, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth('google', {
        redirect_uri: window.location.origin,
        extraParams: {
          hd: 'ink.fish',
          prompt: 'select_account',
        },
      });
      if (result.error) {
        toast({
          title: 'Google sign-in failed',
          description: result.error.message ?? 'Please try again.',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
      if (result.redirected) return;
      navigate('/dashboard');
    } catch (err) {
      toast({
        title: 'Google sign-in failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    try {
      emailSchema.parse(email);
    } catch (e) {
      if (e instanceof z.ZodError) {
        newErrors.email = e.errors[0].message;
      }
    }

    if (mode !== 'forgot-password') {
      try {
        passwordSchema.parse(password);
      } catch (e) {
        if (e instanceof z.ZodError) {
          newErrors.password = e.errors[0].message;
        }
      }
    }

    if (mode === 'register') {
      if (!firstName.trim()) newErrors.firstName = 'First name is required';
      if (!lastName.trim()) newErrors.lastName = 'Last name is required';
      if (!companyName.trim()) newErrors.companyName = 'Company name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await signIn(email, password);
        if (error) {
          toast({
            title: 'Login failed',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Welcome back!',
            description: 'You have successfully logged in.',
          });
          navigate('/dashboard');
        }
      } else if (mode === 'register') {
        const { error } = await signUp({
          email,
          password,
          firstName,
          lastName,
          companyName,
          role,
        });
        if (error) {
          toast({
            title: 'Registration failed',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Account created!',
            description: 'Welcome to STORM.',
          });
          navigate('/dashboard');
        }
      } else if (mode === 'forgot-password') {
        const { error } = await resetPassword(email);
        if (error) {
          toast({
            title: 'Error',
            description: error.message,
            variant: 'destructive',
          });
        } else {
          toast({
            title: 'Email sent',
            description: 'Check your inbox for password reset instructions.',
          });
          setMode('login');
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const passwordStrength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      {/* Inkfish watermark - renders behind all content */}
      <InkfishWatermark />
      
      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo */}
        <div className="flex flex-col items-center justify-center mb-8">
          <span className="text-4xl font-black tracking-tight text-primary">STORM</span>
          <span className="text-xs text-muted-foreground tracking-widest uppercase mt-1">
            Superyacht Technical Operations, Research & Management
          </span>
        </div>

        <Card className="shadow-card">
          <CardHeader className="text-center">
            <CardTitle>
              {mode === 'login' && 'Welcome back'}
              {mode === 'register' && 'Create your account'}
              {mode === 'forgot-password' && 'Reset password'}
            </CardTitle>
            <CardDescription>
              {mode === 'login' && 'Sign in to your STORM account'}
              {mode === 'register' && 'Get started with yacht management'}
              {mode === 'forgot-password' && "Enter your email and we'll send you a reset link"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="captain@yacht.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={errors.email ? 'border-destructive' : ''}
                />
                {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
              </div>

              {/* Password */}
              {mode !== 'forgot-password' && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                  
                  {/* Password strength indicator */}
                  {mode === 'register' && password && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div
                            key={i}
                            className={`h-1 flex-1 rounded-full transition-colors ${
                              i <= passwordStrength.strength ? passwordStrength.color : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">{passwordStrength.label}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Registration fields */}
              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="firstName">First Name</Label>
                      <Input
                        id="firstName"
                        placeholder="John"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className={errors.firstName ? 'border-destructive' : ''}
                      />
                      {errors.firstName && <p className="text-sm text-destructive">{errors.firstName}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="lastName">Last Name</Label>
                      <Input
                        id="lastName"
                        placeholder="Doe"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className={errors.lastName ? 'border-destructive' : ''}
                      />
                      {errors.lastName && <p className="text-sm text-destructive">{errors.lastName}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      placeholder="Blue Ocean Yachts"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      className={errors.companyName ? 'border-destructive' : ''}
                    />
                    {errors.companyName && <p className="text-sm text-destructive">{errors.companyName}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="role">Role</Label>
                    <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your role" />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {roles.map((r) => (
                          <SelectItem key={r.value} value={r.value}>
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              {/* Forgot password link */}
              {mode === 'login' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot-password')}
                  className="text-sm text-secondary hover:underline"
                >
                  Forgot password?
                </button>
              )}

              {/* Submit button */}
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {mode === 'login' && 'Sign in'}
                {mode === 'register' && 'Create account'}
                {mode === 'forgot-password' && 'Send reset link'}
              </Button>

              {mode !== 'forgot-password' && (
                <>
                  <div className="relative my-2">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleGoogleSignIn}
                    disabled={isLoading}
                  >
                    <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    Continue with Google
                  </Button>
                </>
              )}

              {/* Mode switch */}
              <div className="text-center text-sm text-muted-foreground">
                {mode === 'login' && (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('register')}
                      className="text-secondary hover:underline font-medium"
                    >
                      Sign up
                    </button>
                  </>
                )}
                {mode === 'register' && (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => setMode('login')}
                      className="text-secondary hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </>
                )}
                {mode === 'forgot-password' && (
                  <button
                    type="button"
                    onClick={() => setMode('login')}
                    className="text-secondary hover:underline font-medium"
                  >
                    Back to login
                  </button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
