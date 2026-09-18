import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/modules/auth/contexts/AuthContext';
import { LegalShell } from '@/modules/legal/components/LegalShell';
import { IntakeWizard } from '@/modules/legal/components/requests/IntakeWizard';
import { useLegalRequests } from '@/modules/legal/hooks/useLegalRequests';
import { LEGAL_PATHS } from '@/modules/legal/paths';

const LegalRequestNewPage: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { createRequest } = useLegalRequests({ enabled: false });

  return (
    <LegalShell title="New legal request" description="Three short steps. The legal team is notified as soon as you submit." backTo={{ label: 'Back to requests', path: LEGAL_PATHS.requests }}>
      <Card>
        <CardContent className="p-6">
          <IntakeWizard
            defaults={{ requester_department: profile?.department ?? '' }}
            isPending={createRequest.isPending}
            onCancel={() => navigate(LEGAL_PATHS.requests)}
            onSubmit={async (values) => {
              const created = await createRequest.mutateAsync(values);
              navigate(LEGAL_PATHS.request(created.id));
            }}
          />
        </CardContent>
      </Card>
    </LegalShell>
  );
};

export default LegalRequestNewPage;
