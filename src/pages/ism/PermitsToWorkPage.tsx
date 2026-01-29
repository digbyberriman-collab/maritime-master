import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { HardHat } from 'lucide-react';

const PermitsToWorkPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Permits to Work"
      description="Formal authorization forms for hazardous activities"
      icon={HardHat}
      sectionName="Permits to Work"
      contentType="Hot Work Permits, Confined Space Entry Permits, Working Aloft Permits, Electrical Isolation Permits, and other PTW forms"
    />
  );
};

export default PermitsToWorkPage;
