import React, { useState, useEffect } from 'react';
import { Shield, Key, Smartphone, History, AlertTriangle, Download, Monitor, MapPin, Clock, X, Check, QrCode, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/shared/hooks/use-toast';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';
import { z } from 'zod';

interface Session {
  id: string;
  device_info: string | null;
  browser: string | null;
  location: string | null;
  last_active_at: string;
  is_current: boolean;
  created_at: string;
}

interface LoginEvent {
  id: string;
  created_at: string;
  device_info: string | null;
  location: string | null;
  status: string;
}

const passwordSchema = z.object({
  current: z.string().min(1, 'Current password is required'),
  new: z.string().min(8, 'Password must be at least 8 characters'),
  confirm: z.string()
}).refine(data => data.new === data.confirm, {
  message: 'Passwords do not match',
  path: ['confirm']
});

const SecuritySection: React.FC = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Password state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [passwordErrors, setPasswordErrors] = useState<Record<string, string>>({});
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const [lastPasswordChange] = useState<Date | null>(null); // Would come from user metadata
  
  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(false);
  const [mfaSetup, setMfaSetup] = useState<{ id: string; secret: string; qrCode: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [showDisableMfaDialog, setShowDisableMfaDialog] = useState(false);
  
  // Sessions state
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  
  // Login history state
  const [loginHistory, setLoginHistory] = useState<LoginEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Data export state
  const [requestingExport, setRequestingExport] = useState(false);

  useEffect(() => {
    if (user) {
      loadSessions();
      loadLoginHistory();
      checkMfaStatus();
    }
  }, [user]);

  const checkMfaStatus = async () => {
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const totpFactors = data?.totp || [];
      setMfaEnabled(totpFactors.some(f => f.status === 'verified'));
    } catch (error) {
      console.error('Error checking MFA status:', error);
    }
  };

  const loadSessions = async () => {
    if (!user) return;
    setLoadingSessions(true);
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .eq('user_id', user.id)
        .is('revoked_at', null)
        .order('last_active_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const loadLoginHistory = async () => {
    if (!user) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('login_history')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setLoginHistory(data || []);
    } catch (error) {
      console.error('Error loading login history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordErrors({});
    
    try {
      passwordSchema.parse(passwords);
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors: Record<string, string> = {};
        err.errors.forEach(e => {
          if (e.path[0]) errors[e.path[0] as string] = e.message;
        });
        setPasswordErrors(errors);
        return;
      }
    }

    setUpdatingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new
      });

      if (error) throw error;

      toast({
        title: 'Password Updated',
        description: 'Your password has been changed successfully.',
      });
      setShowPasswordForm(false);
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (error: any) {
      toast({
        title: 'Failed to Update Password',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleEnableMFA = async () => {
    setMfaLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: 'totp'
      });

      if (error) throw error;

      if (data) {
        setMfaSetup({
          id: data.id,
          secret: data.totp.secret,
          qrCode: data.totp.qr_code
        });
      }
    } catch (error: any) {
      toast({
        title: 'Failed to Enable MFA',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setMfaLoading(false);
    }
  };

  const handleVerifyMFA = async () => {
    if (!mfaSetup) return;
    
    setMfaLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
        factorId: mfaSetup.id
      });

      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId: mfaSetup.id,
        challengeId: challengeData.id,
        code: verificationCode
      });

      if (verifyError) throw verifyError;

      setMfaEnabled(true);
      setMfaSetup(null);
      setVerificationCode('');
      toast({
        title: 'Two-Factor Authentication Enabled',
        description: 'Your account is now protected with 2FA.',
      });
    } catch (error: any) {
      toast({
        title: 'Verification Failed',
        description: error.message || 'Invalid verification code',
        variant: 'destructive',
      });
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMFA = async () => {
    setMfaLoading(true);
    try {
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const activeFactor = factors?.totp?.find(f => f.status === 'verified');
      
      if (activeFactor) {
        const { error } = await supabase.auth.mfa.unenroll({
          factorId: activeFactor.id
        });

        if (error) throw error;
      }

      setMfaEnabled(false);
      setShowDisableMfaDialog(false);
      toast({
        title: 'Two-Factor Authentication Disabled',
        description: '2FA has been removed from your account.',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to Disable MFA',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    } finally {
      setMfaLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      loadSessions();
      toast({
        title: 'Session Revoked',
        description: 'The session has been terminated.',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to Revoke Session',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const revokeAllOtherSessions = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('user_sessions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('is_current', false);

      if (error) throw error;

      loadSessions();
      toast({
        title: 'Sessions Revoked',
        description: 'All other sessions have been terminated.',
      });
    } catch (error: any) {
      toast({
        title: 'Failed to Revoke Sessions',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleRequestDataExport = async () => {
    setRequestingExport(true);
    // Simulate data export request
    await new Promise(resolve => setTimeout(resolve, 2000));
    setRequestingExport(false);
    toast({
      title: 'Export Requested',
      description: 'You will receive an email with your data within 48 hours.',
    });
  };

  const getDeviceIcon = (deviceInfo: string | null) => {
    if (!deviceInfo) return <Monitor className="h-4 w-4" />;
    const lower = deviceInfo.toLowerCase();
    if (lower.includes('mobile') || lower.includes('iphone') || lower.includes('android')) {
      return <Smartphone className="h-4 w-4" />;
    }
    return <Monitor className="h-4 w-4" />;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Security</h2>
        <p className="text-muted-foreground mt-1">Manage your account security settings</p>
      </div>

      {/* Change Password */}
      <Card>
        <Collapsible open={showPasswordForm} onOpenChange={setShowPasswordForm}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Key className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-lg">Password</CardTitle>
                  <CardDescription>
                    {lastPasswordChange 
                      ? `Last changed ${formatDistanceToNow(lastPasswordChange)} ago`
                      : 'Update your password regularly for better security'
                    }
                  </CardDescription>
                </div>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="outline">
                  {showPasswordForm ? (
                    <>
                      <ChevronUp className="h-4 w-4 mr-2" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Change Password
                    </>
                  )}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input 
                  id="currentPassword" 
                  type="password" 
                  placeholder="Enter current password"
                  value={passwords.current}
                  onChange={(e) => setPasswords(prev => ({ ...prev, current: e.target.value }))}
                />
                {passwordErrors.current && (
                  <p className="text-xs text-destructive">{passwordErrors.current}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input 
                  id="newPassword" 
                  type="password" 
                  placeholder="Enter new password (min. 8 characters)"
                  value={passwords.new}
                  onChange={(e) => setPasswords(prev => ({ ...prev, new: e.target.value }))}
                />
                {passwordErrors.new && (
                  <p className="text-xs text-destructive">{passwordErrors.new}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input 
                  id="confirmPassword" 
                  type="password" 
                  placeholder="Confirm new password"
                  value={passwords.confirm}
                  onChange={(e) => setPasswords(prev => ({ ...prev, confirm: e.target.value }))}
                />
                {passwordErrors.confirm && (
                  <p className="text-xs text-destructive">{passwordErrors.confirm}</p>
                )}
              </div>
              <div className="flex gap-2">
                <Button onClick={handlePasswordChange} disabled={updatingPassword}>
                  {updatingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
                <Button variant="ghost" onClick={() => {
                  setShowPasswordForm(false);
                  setPasswords({ current: '', new: '', confirm: '' });
                  setPasswordErrors({});
                }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Smartphone className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Two-Factor Authentication</CardTitle>
                <CardDescription>Add an extra layer of security to your account</CardDescription>
              </div>
            </div>
            {!mfaSetup && (
              <div className="flex items-center gap-4">
                {mfaEnabled && (
                  <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                    <Check className="h-3 w-3 mr-1" />
                    Enabled
                  </Badge>
                )}
                <Switch
                  checked={mfaEnabled}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      handleEnableMFA();
                    } else {
                      setShowDisableMfaDialog(true);
                    }
                  }}
                  disabled={mfaLoading}
                />
              </div>
            )}
          </div>
        </CardHeader>
        
        {mfaSetup && (
          <CardContent className="space-y-4">
            <div className="bg-muted/50 p-4 rounded-lg space-y-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <QrCode className="h-4 w-4" />
                Scan QR Code with Authenticator App
              </div>
              
              <div className="flex justify-center">
                <img 
                  src={mfaSetup.qrCode} 
                  alt="MFA QR Code" 
                  className="w-48 h-48 rounded-lg border bg-white"
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Or enter this code manually:</Label>
                <code className="block p-2 bg-background rounded text-sm font-mono text-center break-all">
                  {mfaSetup.secret}
                </code>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="verificationCode">Verification Code</Label>
                <Input
                  id="verificationCode"
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
              </div>
              
              <div className="flex gap-2">
                <Button onClick={handleVerifyMFA} disabled={verificationCode.length !== 6 || mfaLoading}>
                  {mfaLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Enable'
                  )}
                </Button>
                <Button variant="ghost" onClick={() => {
                  setMfaSetup(null);
                  setVerificationCode('');
                }}>
                  Cancel
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Active Sessions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Active Sessions</CardTitle>
                <CardDescription>Manage your active login sessions</CardDescription>
              </div>
            </div>
            {sessions.length > 1 && (
              <Button variant="outline" size="sm" onClick={revokeAllOtherSessions}>
                <X className="h-4 w-4 mr-2" />
                Revoke All Others
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active sessions found</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div 
                  key={session.id} 
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-background rounded-lg flex items-center justify-center">
                      {getDeviceIcon(session.device_info)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">
                          {session.browser || 'Unknown Browser'}
                        </p>
                        {session.is_current && (
                          <Badge className="bg-primary/10 text-primary hover:bg-primary/10 text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {session.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {session.location}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(session.last_active_at))} ago
                        </span>
                      </div>
                    </div>
                  </div>
                  {!session.is_current && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => revokeSession(session.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Login History */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Login History</CardTitle>
              <CardDescription>Recent login attempts to your account</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : loginHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No login history available</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Device</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loginHistory.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm">
                        {format(new Date(event.created_at), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {event.device_info || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {event.location || 'Unknown'}
                      </TableCell>
                      <TableCell>
                        {event.status === 'success' ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            <Check className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                            <X className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data Export (GDPR) */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Download className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle className="text-lg">Download My Data</CardTitle>
              <CardDescription>Export a copy of your personal data stored in STORM</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={handleRequestDataExport} disabled={requestingExport}>
            {requestingExport ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Requesting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Request Data Export
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Disable MFA Confirmation Dialog */}
      <Dialog open={showDisableMfaDialog} onOpenChange={setShowDisableMfaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Disable Two-Factor Authentication?
            </DialogTitle>
            <DialogDescription>
              This will remove the extra layer of security from your account. 
              You can re-enable it at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDisableMfaDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDisableMFA} disabled={mfaLoading}>
              {mfaLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Disabling...
                </>
              ) : (
                'Disable 2FA'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SecuritySection;
