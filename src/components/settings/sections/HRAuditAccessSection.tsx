import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Shield, 
  Eye, 
  EyeOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock
} from 'lucide-react';
import { HR_FIELD_ACCESS_LEVELS } from '@/lib/compliance/types';

export const HRAuditAccessSection: React.FC = () => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground">HR Audit Access Controls</h2>
        <p className="text-muted-foreground mt-1">
          Configure what HR data external auditors can access. Default: NO ACCESS.
        </p>
      </div>

      {/* Default Access Alert */}
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Lock className="w-5 h-5" />
            Default: HR Access Denied
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            By default, external auditors have NO access to HR data. Access must be explicitly granted 
            for each audit session and is limited to non-sensitive employment information only.
          </p>
        </CardContent>
      </Card>

      {/* Access Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            HR Access Levels
          </CardTitle>
          <CardDescription>
            Available access levels for exceptional audit access grants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* None */}
            <div className="p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">None (Default)</h4>
                <Badge variant="destructive">Recommended</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Auditor cannot access any HR data. This is the default and most secure setting.
              </p>
            </div>

            {/* Employment Only */}
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Employment Only</h4>
                <Badge variant="outline">Minimal</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Confirms employment existence and contract validity without exposing details.
              </p>
              <div className="flex flex-wrap gap-2">
                {HR_FIELD_ACCESS_LEVELS.employment_only.map((field) => (
                  <Badge key={field} variant="secondary" className="text-xs">
                    {field.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Limited */}
            <div className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium">Limited</h4>
                <Badge variant="outline">Extended</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Includes employment details plus basic contract information.
              </p>
              <div className="flex flex-wrap gap-2">
                {HR_FIELD_ACCESS_LEVELS.limited.map((field) => (
                  <Badge key={field} variant="secondary" className="text-xs">
                    {field.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Always Denied Fields */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="w-5 h-5" />
            Always Denied Fields
          </CardTitle>
          <CardDescription>
            These fields are NEVER accessible to external auditors, regardless of access level
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {HR_FIELD_ACCESS_LEVELS.always_denied.map((field) => (
              <div 
                key={field} 
                className="flex items-center gap-2 p-2 rounded bg-destructive/5 text-destructive"
              >
                <EyeOff className="w-4 h-4" />
                <span className="text-sm">{field.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Redaction Behavior */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Redaction Behavior
          </CardTitle>
          <CardDescription>
            How sensitive data appears to auditors when access is granted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded bg-muted/50">
              <span className="text-sm">Salary</span>
              <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">[REDACTED]</code>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-muted/50">
              <span className="text-sm">Disciplinary Records</span>
              <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">[REDACTED]</code>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-muted/50">
              <span className="text-sm">Welfare Notes</span>
              <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">[REDACTED]</code>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-muted/50">
              <span className="text-sm">Medical Records</span>
              <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">[REDACTED]</code>
            </div>
            <div className="flex items-center justify-between p-3 rounded bg-muted/50">
              <span className="text-sm">Bank Details</span>
              <code className="text-xs bg-destructive/10 text-destructive px-2 py-1 rounded">[REDACTED]</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logging Notice */}
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <h4 className="font-medium">Comprehensive Audit Logging</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Every access event to HR data is logged, including:
              </p>
              <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
                <li>User ID and role</li>
                <li>Accessed entity and fields</li>
                <li>Timestamp and IP address</li>
                <li>Whether access was granted or denied</li>
                <li>Audit session ID (if in audit mode)</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Grant Access Button (Placeholder) */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">Grant Exceptional HR Access</h4>
              <p className="text-sm text-muted-foreground">
                Create a time-limited HR access grant for an existing audit session.
              </p>
            </div>
            <Button variant="outline" disabled>
              Grant Access (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default HRAuditAccessSection;
