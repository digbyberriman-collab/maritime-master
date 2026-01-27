import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface SettingsHeaderProps {
  title?: string;
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({ title = 'Settings' }) => {
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <div className="flex items-center h-14 px-4 gap-4">
        <Link to="/dashboard">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">Back to Dashboard</span>
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-primary">STORM</span>
          <span className="text-muted-foreground">|</span>
          <span className="font-medium text-foreground">{title}</span>
        </div>
      </div>
    </header>
  );
};

export default SettingsHeader;
