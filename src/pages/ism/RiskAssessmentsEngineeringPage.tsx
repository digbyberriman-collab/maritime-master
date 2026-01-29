import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Cog } from 'lucide-react';

const RiskAssessmentsEngineeringPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Engineering Risk Assessments"
      description="Risk assessment forms for engineering operations"
      icon={Cog}
      sectionName="Engineering Risk Assessments"
      contentType="machinery operation, maintenance, and engine room work risk assessments"
    />
  );
};

export default RiskAssessmentsEngineeringPage;
