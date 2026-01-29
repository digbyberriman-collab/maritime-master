import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Navigation } from 'lucide-react';

const RiskAssessmentsBridgePage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Bridge Risk Assessments"
      description="Risk assessment forms for bridge operations"
      icon={Navigation}
      sectionName="Bridge Risk Assessments"
      contentType="navigation risk assessments, passage planning risk analysis, and bridge operation safety forms"
    />
  );
};

export default RiskAssessmentsBridgePage;
