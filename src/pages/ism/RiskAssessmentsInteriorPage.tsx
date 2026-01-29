import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Home } from 'lucide-react';

const RiskAssessmentsInteriorPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Interior Risk Assessments"
      description="Risk assessment forms for interior operations"
      icon={Home}
      sectionName="Interior Risk Assessments"
      contentType="housekeeping, guest services, and interior work risk assessments"
    />
  );
};

export default RiskAssessmentsInteriorPage;
