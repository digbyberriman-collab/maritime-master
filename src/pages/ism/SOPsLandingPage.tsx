import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { ClipboardList, Navigation, Anchor, Cog, Home, Utensils } from 'lucide-react';

const SOPsLandingPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Standard Operating Procedures"
      description="Departmental SOPs and procedural documentation"
      icon={ClipboardList}
      sectionName="SOPs"
      contentType="standard operating procedures and work instructions"
      cards={[
        {
          title: 'Bridge SOPs',
          description: 'Standard operating procedures for navigation and bridge operations.',
          href: '/ism/sops/bridge',
          icon: Navigation,
        },
        {
          title: 'Deck SOPs',
          description: 'Standard operating procedures for deck department operations.',
          href: '/ism/sops/deck',
          icon: Anchor,
        },
        {
          title: 'Engineering SOPs',
          description: 'Standard operating procedures for engine room and machinery.',
          href: '/ism/sops/engineering',
          icon: Cog,
        },
        {
          title: 'Interior SOPs',
          description: 'Standard operating procedures for interior department.',
          href: '/ism/sops/interior',
          icon: Home,
        },
        {
          title: 'Galley SOPs',
          description: 'Standard operating procedures for galley and food service.',
          href: '/ism/sops/galley',
          icon: Utensils,
        },
      ]}
    />
  );
};

export default SOPsLandingPage;
