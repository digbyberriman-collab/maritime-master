import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Home } from 'lucide-react';

const SOPsInteriorPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Interior SOPs"
      description="Standard operating procedures for interior department"
      icon={Home}
      sectionName="Interior SOPs"
      contentType="housekeeping procedures, guest services protocols, and interior operations documentation"
    />
  );
};

export default SOPsInteriorPage;
