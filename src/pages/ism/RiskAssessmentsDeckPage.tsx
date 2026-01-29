import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Anchor } from 'lucide-react';

const RiskAssessmentsDeckPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Deck Risk Assessments"
      description="Risk assessment forms for deck operations"
      icon={Anchor}
      sectionName="Deck Risk Assessments"
      contentType="anchoring, mooring, tender operations, and deck work risk assessments"
    />
  );
};

export default RiskAssessmentsDeckPage;
