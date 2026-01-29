import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { AlertCircle, ListChecks, FileWarning, HeartHandshake } from 'lucide-react';

const ERMPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Emergency Response Manual"
      description="Structure and checklists for emergency response procedures"
      icon={AlertCircle}
      sectionName="ERM"
      contentType="emergency response procedures and checklists"
      cards={[
        {
          title: 'Emergency Checklists',
          description: 'Quick-reference checklists for emergency situations including fire, flooding, and abandon ship procedures.',
          href: '/ism/erm/emergency-checklists',
          icon: ListChecks,
        },
        {
          title: 'Other Emergencies & Detailed Guidance',
          description: 'Comprehensive guidance for various emergency scenarios not covered by standard checklists.',
          href: '/ism/erm/other-emergencies',
          icon: FileWarning,
        },
        {
          title: 'People & Welfare Issues',
          description: 'Procedures for crew welfare, medical emergencies, and personnel-related incidents.',
          href: '/ism/erm/people-welfare',
          icon: HeartHandshake,
        },
      ]}
    />
  );
};

export default ERMPage;
