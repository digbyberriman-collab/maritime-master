import React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { CheckCircle } from 'lucide-react';

interface FormProgressBarProps {
  currentPage: number;
  totalPages: number;
  completedFields: number;
  totalFields: number;
  pageLabels?: string[];
  className?: string;
}

const FormProgressBar: React.FC<FormProgressBarProps> = ({
  currentPage,
  totalPages,
  completedFields,
  totalFields,
  pageLabels,
  className,
}) => {
  const progressPercent = totalFields > 0 ? Math.round((completedFields / totalFields) * 100) : 0;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Page indicator */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Array.from({ length: totalPages }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium transition-colors',
                  index + 1 === currentPage
                    ? 'bg-primary text-primary-foreground'
                    : index + 1 < currentPage
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-muted text-muted-foreground'
                )}
              >
                {index + 1 < currentPage ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  index + 1
                )}
              </div>
            ))}
          </div>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}

      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Form Completion</span>
          <span className="font-medium">{progressPercent}%</span>
        </div>
        <Progress value={progressPercent} className="h-2" />
        <p className="text-xs text-muted-foreground">
          {completedFields} of {totalFields} fields completed
        </p>
      </div>

      {/* Page label */}
      {pageLabels && pageLabels[currentPage - 1] && (
        <div className="pt-2">
          <h3 className="text-lg font-semibold">{pageLabels[currentPage - 1]}</h3>
        </div>
      )}
    </div>
  );
};

export default FormProgressBar;
