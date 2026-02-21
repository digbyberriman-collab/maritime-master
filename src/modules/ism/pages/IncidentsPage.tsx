import React from 'react';
import Incidents from '@/modules/incidents/pages/Incidents';

// ISM Incidents page - uses the main Incidents page component
// This provides the same functionality within the ISM navigation context
const IncidentsPage: React.FC = () => {
  return <Incidents />;
};

export default IncidentsPage;
