import React from 'react';
import ISMPlaceholder from './ISMPlaceholder';
import { Cog } from 'lucide-react';

const EngineRoomChecklistsPage: React.FC = () => {
  return (
    <ISMPlaceholder
      title="Engine Room Checklists"
      description="Engineering department operational checklists"
      icon={Cog}
      sectionName="Engine Room Checklists"
      contentType="engine room watchkeeping checklists, machinery operational checks, and engineering safety forms"
    />
  );
};

export default EngineRoomChecklistsPage;
