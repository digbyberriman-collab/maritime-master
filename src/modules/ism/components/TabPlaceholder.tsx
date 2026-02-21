import React from 'react';
import { FileText, type LucideIcon } from 'lucide-react';

interface TabPlaceholderProps {
  title: string;
  description: string;
  icon?: LucideIcon;
}

const TabPlaceholder: React.FC<TabPlaceholderProps> = ({ 
  title, 
  description,
  icon: Icon = FileText 
}) => {
  return (
    <div className="bg-card border border-border rounded-lg p-8 text-center">
      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
        <Icon className="w-6 h-6 text-primary" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">
        {title}
      </h3>
      <p className="text-muted-foreground mb-4">
        {description}
      </p>
      <button 
        disabled
        className="px-4 py-2 bg-muted text-muted-foreground rounded-lg cursor-not-allowed text-sm"
      >
        Add Template (Coming Soon)
      </button>
    </div>
  );
};

export default TabPlaceholder;
