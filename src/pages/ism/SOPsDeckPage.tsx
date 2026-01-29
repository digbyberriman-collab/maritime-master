import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Anchor } from 'lucide-react';

const SOPsDeckPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Deck SOPs"
      description="Standard operating procedures for deck department"
      icon={Anchor}
      sectionName="Deck SOPs"
      contentType="deck operations procedures, mooring protocols, and tender operation documentation"
    />
  );
};

export default SOPsDeckPage;
