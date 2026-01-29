import React from 'react';
import { Eye, EyeOff, Clock, Shield, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AuditModeIndicatorProps {
  isActive: boolean;
  auditorType?: 'flag' | 'class' | 'insurance' | 'hr';
  expiresAt?: Date;
  visibleFields?: string[];
  hiddenFields?: string[];
}

const AuditModeIndicator: React.FC<AuditModeIndicatorProps> = ({
  isActive,
  auditorType = 'flag',
  expiresAt,
  visibleFields = [],
  hiddenFields = [],
}) => {
  if (!isActive) {
    return null;
  }

  const timeRemaining = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000)) : null;

  return (
    <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
      <Eye className="h-4 w-4 text-amber-600" />
      <AlertDescription className="text-amber-800 dark:text-amber-200">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Audit Mode Active
              <Badge variant="outline" className="ml-2 capitalize">
                {auditorType} Auditor
              </Badge>
            </span>
            {timeRemaining !== null && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {timeRemaining} min remaining
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2 text-xs">
            {/* Visible Fields */}
            {visibleFields.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1 mb-1">
                  <Eye className="w-3 h-3" />
                  Visible to Auditor:
                </p>
                <div className="flex flex-wrap gap-1">
                  {visibleFields.map((field) => (
                    <Badge key={field} variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Hidden Fields */}
            {hiddenFields.length > 0 && (
              <div>
                <p className="font-medium flex items-center gap-1 mb-1">
                  <EyeOff className="w-3 h-3" />
                  Hidden from Auditor:
                </p>
                <div className="flex flex-wrap gap-1">
                  {hiddenFields.map((field) => (
                    <Badge key={field} variant="outline" className="text-xs bg-red-50 dark:bg-red-900/20">
                      {field}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs mt-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            All access events are being logged for compliance.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
};

export default AuditModeIndicator;
