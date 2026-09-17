import React from 'react';
import LegalPage, { LegalSection } from '@/modules/help/components/LegalPage';

const SECTIONS: LegalSection[] = [
  {
    heading: '1. Acceptable use',
    paragraphs: [
      'By using Inkfish you agree to use the platform only for lawful maritime operations and in accordance with your company\'s safety management system.',
      'You must not attempt to access data belonging to other companies, circumvent role-based permissions, or interfere with audit trails and signed records.',
    ],
  },
  {
    heading: '2. Accounts and credentials',
    paragraphs: [
      'You are responsible for the accuracy of records you enter and for keeping your sign-in credentials confidential. Access levels are set by your company administrator and may be changed or revoked at any time.',
      'Finalised logbook entries and other locked records may only be reopened by a DPA or super administrator, and every such action is logged.',
    ],
  },
  {
    heading: '3. Company responsibility for records',
    paragraphs: [
      'The platform is provided as a management aid; it does not replace statutory record-keeping requirements where original or certified documents are required by flag state or class.',
      'Your company remains responsible for the completeness and accuracy of the records it maintains in the platform, and for obtaining any crew member consent required under local law.',
    ],
  },
  {
    heading: '4. Availability and support',
    paragraphs: [
      'We aim to keep the platform available at all times, but we do not guarantee uninterrupted service. Planned maintenance will be communicated in advance where practical.',
      'Support is available at SOS@INK.FISH.',
    ],
  },
  {
    heading: '5. Intellectual property',
    paragraphs: [
      'The platform, its design and its underlying software remain the property of Inkfish. Your company retains full ownership of the data and documents it enters into the platform.',
    ],
  },
  {
    heading: '6. Limitation of liability',
    paragraphs: [
      'To the fullest extent permitted by law, Inkfish is not liable for indirect or consequential losses, including loss of profit or business interruption, arising from use of the platform.',
    ],
  },
  {
    heading: '7. Changes to these terms',
    paragraphs: [
      'We may update these terms from time to time. Continued use of the platform after an update constitutes acceptance of the revised terms, and the "Last updated" date above will always reflect the current version.',
    ],
  },
];

const TermsOfServicePage: React.FC = () => {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="Last updated: September 2026"
      intro="These terms govern the use of the Inkfish Maritime Management platform by your company and its authorised users."
      sections={SECTIONS}
      contactNote="Questions about these terms?"
    />
  );
};

export default TermsOfServicePage;
