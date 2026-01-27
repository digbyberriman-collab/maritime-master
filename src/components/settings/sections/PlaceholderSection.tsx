import React from 'react';
import { Construction } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon } from 'lucide-react';

interface PlaceholderSectionProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

const PlaceholderSection: React.FC<PlaceholderSectionProps> = ({ 
  title, 
  description,
  icon: Icon 
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{title}</h2>
        <p className="text-muted-foreground mt-1">{description}</p>
      </div>

      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <div className="p-4 rounded-full bg-muted mb-4">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Construction className="h-5 w-5" />
            <span className="font-medium">Coming Soon</span>
          </div>
          <p className="text-sm text-muted-foreground text-center max-w-md">
            This section is currently under development. Check back soon for updates.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default PlaceholderSection;
