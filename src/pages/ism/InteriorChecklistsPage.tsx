import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Home } from 'lucide-react';

const InteriorChecklistsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Interior Checklists"
      description="Interior department service and safety checklists"
      icon={Home}
      sectionName="Interior Checklists"
      contentType="interior department checklists, guest services forms, and housekeeping safety documentation"
    />
  );
};

export default InteriorChecklistsPage;
