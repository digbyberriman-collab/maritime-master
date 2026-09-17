import React from 'react';
import LegalPage, { LegalSection } from '@/modules/help/components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. Who we are',
    paragraphs: [
      'Inkfish provides maritime safety and crew management software ("the platform") to shipping companies and their authorised users. This policy explains how we handle personal data processed through the platform.',
      'For the purposes of applicable data protection law, your company acts as the data controller for the crew and operational data it enters, and Inkfish acts as the processor.',
    ],
  },
  {
    heading: '2. What we process',
    paragraphs: [
      'We process only the personal data needed to provide the service:',
    ],
    bullets: [
      'Account details — name, work email, role and company membership.',
      'Crew records — the details your company enters, such as rank, vessel assignment, contracts, certificates and travel documents.',
      'Operational records — logbook entries, tasks, acknowledgements and audit trails.',
      'Sensitive fields — medical, payroll and similar data, stored only where your company chooses to record them and redacted for users without the required permissions.',
    ],
  },
  {
    heading: '3. How data is used and shared',
    paragraphs: [
      'Personal data is used solely to provide maritime safety and crew management services to your company. It is never sold and is never used for advertising.',
      'Data is visible only to authorised users within your company, scoped by role-based permissions (fleet, vessel and department scope). Data is shared outside your company only when you export it, generate a tokenised auditor link, or when required by law.',
    ],
  },
  {
    heading: '4. Security',
    paragraphs: [
      'Data is hosted securely with encryption in transit and at rest. Access is controlled by role-based permissions and multi-factor authentication where enabled by your company.',
      'All changes to safety-critical records — logbook sign-offs, certificates, crew contracts — are recorded in an audit trail that cannot be edited by end users.',
    ],
  },
  {
    heading: '5. Retention and deletion',
    paragraphs: [
      'Personal data is retained in line with your company\'s retention schedule. HR and insurance records follow an archive-not-delete governance model with defined retention periods.',
      'The Designated Person Ashore (DPA) can export or anonymise an individual\'s data on request. Where retention rules prevent immediate deletion, the record is anonymised while the audit history is preserved.',
    ],
  },
  {
    heading: '6. Your rights',
    paragraphs: [
      'Under GDPR and similar laws you may have rights to access, correct, export, restrict or erase your personal data. To exercise these rights, contact your company\'s DPA or reach us directly using the details below.',
    ],
  },
  {
    heading: '7. Changes to this policy',
    paragraphs: [
      'We may update this policy as the platform evolves. Material changes will be announced in the platform, and the "Last updated" date above will always reflect the current version.',
    ],
  },
];

const PrivacyPolicyPage: React.FC = () => {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="Last updated: September 2026"
      intro="This policy explains what personal data Inkfish processes, why, and the controls your company has over it. It applies to everyone who uses the Inkfish Maritime Management platform."
      sections={SECTIONS}
      contactNote="Questions about privacy or a data request?"
    />
  );
};

export default PrivacyPolicyPage;
