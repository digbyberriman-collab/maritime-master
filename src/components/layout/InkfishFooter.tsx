import React from 'react';
import inkfishLogo from '@/assets/inkfish-logo.png';

const InkfishFooter: React.FC = () => {
  return (
    <footer className="h-8 bg-background/50 border-t border-border flex items-center justify-end px-4 lg:px-6">
      <div className="flex items-center gap-2 opacity-40 select-none pointer-events-none">
        <span className="text-xs text-muted-foreground font-normal">
          Powered by
        </span>
        <img 
          src={inkfishLogo} 
          alt="Inkfish" 
          className="h-4 object-contain grayscale opacity-70"
          draggable={false}
        />
      </div>
    </footer>
  );
};

export default InkfishFooter;
