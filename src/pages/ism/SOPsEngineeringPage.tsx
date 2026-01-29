import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Cog } from 'lucide-react';

const SOPsEngineeringPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Engineering SOPs"
      description="Standard operating procedures for engineering department"
      icon={Cog}
      sectionName="Engineering SOPs"
      contentType="machinery operation procedures, maintenance protocols, and engine room documentation"
    />
  );
};

export default SOPsEngineeringPage;
