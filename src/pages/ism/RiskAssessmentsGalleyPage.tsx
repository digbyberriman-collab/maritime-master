import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Utensils } from 'lucide-react';

const RiskAssessmentsGalleyPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Galley Risk Assessments"
      description="Risk assessment forms for galley operations"
      icon={Utensils}
      sectionName="Galley Risk Assessments"
      contentType="food preparation, galley equipment, and kitchen safety risk assessments"
    />
  );
};

export default RiskAssessmentsGalleyPage;
