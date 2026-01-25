import { cn } from '@/lib/utils';
import { getRiskMatrixColor } from '@/lib/riskAssessmentConstants';

interface RiskMatrixProps {
  selectedLikelihood?: number;
  selectedSeverity?: number;
  onCellClick?: (likelihood: number, severity: number) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const RiskMatrix = ({
  selectedLikelihood,
  selectedSeverity,
  onCellClick,
  className,
  size = 'md',
}: RiskMatrixProps) => {
  const severityLabels = ['', 'Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
  const likelihoodLabels = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];

  const getCellSize = () => {
    switch (size) {
      case 'sm':
        return 'w-8 h-8 text-xs';
      case 'lg':
        return 'w-14 h-14 text-base';
      default:
        return 'w-10 h-10 text-sm';
    }
  };

  const cellSize = getCellSize();

  return (
    <div className={cn('inline-block', className)}>
      {/* Header row with severity labels */}
      <div className="flex items-end mb-2">
        <div className={cn(cellSize, 'shrink-0')} />
        {[1, 2, 3, 4, 5].map((severity) => (
          <div
            key={severity}
            className={cn(
              cellSize,
              'flex items-center justify-center text-center shrink-0'
            )}
          >
            <span className="text-[10px] text-muted-foreground leading-tight">
              {severity}
            </span>
          </div>
        ))}
      </div>

      {/* Severity label */}
      <div className="flex items-center justify-center mb-1">
        <div className={cn(cellSize, 'shrink-0')} />
        <span className="text-[10px] text-muted-foreground font-medium">
          SEVERITY →
        </span>
      </div>

      {/* Matrix rows */}
      {[5, 4, 3, 2, 1].map((likelihood) => (
        <div key={likelihood} className="flex items-center">
          <div className={cn(cellSize, 'flex items-center justify-center shrink-0')}>
            <span className="text-[10px] text-muted-foreground">{likelihood}</span>
          </div>
          {[1, 2, 3, 4, 5].map((severity) => {
            const score = likelihood * severity;
            const isSelected = selectedLikelihood === likelihood && selectedSeverity === severity;
            
            return (
              <button
                key={severity}
                onClick={() => onCellClick?.(likelihood, severity)}
                disabled={!onCellClick}
                className={cn(
                  cellSize,
                  'flex items-center justify-center font-medium shrink-0',
                  'border border-background',
                  'transition-all duration-150',
                  getRiskMatrixColor(likelihood, severity),
                  'text-white',
                  isSelected && 'ring-2 ring-offset-2 ring-primary scale-110 z-10',
                  onCellClick && 'cursor-pointer hover:opacity-80 hover:scale-105',
                  !onCellClick && 'cursor-default'
                )}
              >
                {score}
              </button>
            );
          })}
        </div>
      ))}

      {/* Likelihood label on left side */}
      <div className="flex items-center mt-1">
        <span className="text-[10px] text-muted-foreground font-medium transform -rotate-90 origin-center whitespace-nowrap">
          LIKELIHOOD ↑
        </span>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-4 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-green-500 rounded" />
          <span>Low (1-6)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-yellow-500 rounded" />
          <span>Medium (7-12)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 bg-red-500 rounded" />
          <span>High (13-25)</span>
        </div>
      </div>
    </div>
  );
};

export default RiskMatrix;
