import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Utensils } from 'lucide-react';

const SOPsGalleyPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Galley SOPs"
      description="Standard operating procedures for galley department"
      icon={Utensils}
      sectionName="Galley SOPs"
      contentType="food preparation procedures, kitchen safety protocols, and galley operations documentation"
    />
  );
};

export default SOPsGalleyPage;
