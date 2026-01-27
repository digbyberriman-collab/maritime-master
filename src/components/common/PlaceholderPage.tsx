import React from 'react';
import { Construction, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface PlaceholderPageProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  features?: string[];
  expectedRelease?: string;
  showBackButton?: boolean;
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({
  title,
  description = 'This feature is currently under development.',
  icon,
  features = [],
  expectedRelease,
  showBackButton = true,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md text-center">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-6">
          {icon || <Construction className="w-8 h-8 text-primary" />}
        </div>
        
        <div className="flex items-center justify-center gap-2 mb-2">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <Badge variant="secondary">Coming Soon</Badge>
        </div>
        
        <p className="text-muted-foreground mb-6">{description}</p>

        {features.length > 0 && (
          <Card className="mb-6">
            <CardContent className="pt-4 text-left">
              <h3 className="font-medium text-sm text-foreground mb-3">
                Planned Features:
              </h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                {features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <span className="text-primary mt-0.5">•</span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {expectedRelease && (
          <p className="text-sm text-muted-foreground mb-6">
            Expected: <span className="font-medium text-foreground">{expectedRelease}</span>
          </p>
        )}

        {showBackButton && (
          <Button
            variant="ghost"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        )}
      </div>
    </div>
  );
};

export default PlaceholderPage;
