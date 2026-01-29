import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { AlertTriangle, Navigation, Anchor, Cog, Home, Utensils } from 'lucide-react';

const RiskAssessmentsLandingPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Risk Assessments"
      description="Departmental risk assessment forms and templates"
      icon={AlertTriangle}
      sectionName="Risk Assessments"
      contentType="risk assessment templates and completed assessments"
      cards={[
        {
          title: 'Bridge',
          description: 'Navigation and bridge operation risk assessments.',
          href: '/ism/risk-assessments/bridge',
          icon: Navigation,
        },
        {
          title: 'Deck',
          description: 'Deck operations and external work risk assessments.',
          href: '/ism/risk-assessments/deck',
          icon: Anchor,
        },
        {
          title: 'Engineering',
          description: 'Engine room and machinery risk assessments.',
          href: '/ism/risk-assessments/engineering',
          icon: Cog,
        },
        {
          title: 'Interior',
          description: 'Interior department and housekeeping risk assessments.',
          href: '/ism/risk-assessments/interior',
          icon: Home,
        },
        {
          title: 'Galley',
          description: 'Galley and food service risk assessments.',
          href: '/ism/risk-assessments/galley',
          icon: Utensils,
        },
      ]}
    />
  );
};

export default RiskAssessmentsLandingPage;
