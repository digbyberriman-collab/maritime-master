import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { HeartHandshake } from 'lucide-react';

const ERMPeopleWelfarePage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="People & Welfare Issues"
      description="Procedures for crew welfare and personnel emergencies"
      icon={HeartHandshake}
      sectionName="People & Welfare"
      contentType="crew welfare procedures, medical emergency protocols, and personnel incident response forms"
    />
  );
};

export default ERMPeopleWelfarePage;
