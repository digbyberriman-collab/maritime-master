import type { WorkspaceConfig, WorkspaceItemType } from '../types';

const DEPT_RELATED = [
  { label: 'ISM Checklists', path: '/ism/checklists' },
  { label: 'Maintenance', path: '/maintenance' },
  { label: 'Documents', path: '/documents' },
  { label: 'Crew Roster', path: '/crew/list' },
];

function deptConfig(suffix: string, itemType: WorkspaceItemType = 'task'): WorkspaceConfig {
  return {
    category: 'department',
    description: `Manage ${suffix} for the selected vessel — handovers, work lists, rotas, inventory, and reference notes.`,
    defaultItemType: itemType,
    relatedRoutes: DEPT_RELATED,
    features: ['Handover notes', 'Work lists & job cards', 'Rotas & watchkeeping', 'Inventory tracking', 'Department checklists'],
  };
}

export function getWorkspaceConfig(path: string, label: string): WorkspaceConfig {
  if (path.startsWith('/health/medical')) {
    return {
      category: 'health_medical',
      description: 'Medical operations workspace — patients, supplies, protocols, and crew medical records.',
      defaultItemType: 'record',
      relatedRoutes: [
        { label: 'Crew Roster', path: '/crew/list' },
        { label: 'Crew Certificates', path: '/crew/certificates' },
        { label: 'Compliance', path: '/compliance' },
      ],
      features: ['Patient records', 'Medical supplies', 'Treatment logs', 'Fitness-to-work tracking', 'Emergency protocols'],
    };
  }

  if (path.startsWith('/health/spa')) {
    return {
      category: 'health_spa',
      description: 'Spa operations — appointments, clients, treatments, and inventory.',
      defaultItemType: 'record',
      relatedRoutes: [{ label: 'Crew Roster', path: '/crew/list' }],
      features: ['Appointment calendar', 'Client profiles', 'Treatment records', 'Spa inventory'],
    };
  }

  if (path.startsWith('/health/nutrition')) {
    return {
      category: 'health_nutrition',
      description: 'Nutrition tracking — food logs, goals, and meal planning for crew and guests.',
      defaultItemType: 'record',
      relatedRoutes: [{ label: 'Galley (Vessel Departments)', path: '/vessel/departments/crew/galley/daily-menus' }],
      features: ['Food logs', 'Nutrition goals', 'Meal calendar', 'Dietary requirements'],
    };
  }

  if (path.startsWith('/health/physio')) {
    return {
      category: 'health_physio',
      description: 'Physiotherapy workspace — assessments, treatment plans, and rehab protocols.',
      defaultItemType: 'record',
      relatedRoutes: [{ label: 'Crew Training', path: '/development/crew-training' }],
      features: ['Rehab protocols', 'Assessments', 'Session logs', 'Referrals'],
    };
  }

  if (path.startsWith('/health/personal-training')) {
    return {
      category: 'health_pt',
      description: 'Personal training — athlete programs, exercise library, and progress tracking.',
      defaultItemType: 'task',
      relatedRoutes: [{ label: 'Training Records', path: '/training' }],
      features: ['Training programs', 'Exercise library', 'Athlete progress', 'Session scheduling'],
    };
  }

  if (path.startsWith('/shoreside/')) {
    return {
      category: 'shoreside',
      description: `${label} — shoreside services integration workspace for fleet support operations.`,
      defaultItemType: 'note',
      relatedRoutes: [
        { label: 'Crew Admin', path: '/crew/admin' },
        { label: 'Flights & Travel', path: '/crew/flights' },
        { label: 'Support / Feedback', path: '/admin/feedback' },
      ],
      features: ['Service requests', 'Contact log', 'Integration notes', 'Follow-up tasks'],
    };
  }

  if (path.startsWith('/vessel/charter/')) {
    return {
      category: 'charter',
      description: 'Charter operations — charters, guest lists, and charter checklists.',
      defaultItemType: 'checklist',
      relatedRoutes: [
        { label: 'Itinerary Planning', path: '/itinerary/planning' },
        { label: 'Crew Roster', path: '/crew/list' },
      ],
      features: ['Charter bookings', 'Guest manifests', 'Pre-charter checklists', 'Post-charter reports'],
    };
  }

  if (path.startsWith('/vessel/accounting/')) {
    return {
      category: 'accounting',
      description: 'Vessel accounting — expenses, invoices, APA, payroll, and budgets.',
      defaultItemType: 'record',
      relatedRoutes: [
        { label: 'HR & Payroll', path: '/hr?tab=salaries-compensation' },
        { label: 'Reports', path: '/reports' },
      ],
      features: ['Expense tracking', 'Invoice management', 'APA ledger', 'Budget vs actual'],
    };
  }

  if (path.includes('/galley/')) {
    return {
      category: 'galley',
      description: 'Galley operations — menus, provisioning, recipes, and galley logs.',
      defaultItemType: 'checklist',
      relatedRoutes: [
        { label: 'ISM SOPs', path: '/ism/sops' },
        { label: 'Maintenance', path: '/maintenance' },
      ],
      features: ['Daily menus', 'Provisioning lists', 'Recipe library', 'Galley handover'],
    };
  }

  if (path.includes('/dive/')) {
    return deptConfig('dive operations', 'checklist');
  }

  if (path.startsWith('/vessel/departments/')) {
    if (path.includes('handover') || path.includes('notes')) {
      return deptConfig('handover & reference notes', 'note');
    }
    if (path.includes('work-lists') || path.includes('job-cards')) {
      return { ...deptConfig('work lists'), defaultItemType: 'task' };
    }
    if (path.includes('rotas') || path.includes('watchkeeping')) {
      return {
        ...deptConfig('rotas & watchkeeping'),
        relatedRoutes: [{ label: 'Hours of Rest', path: '/crew/work-rest' }, ...DEPT_RELATED],
      };
    }
    if (path.includes('inventory') || path.includes('equipment')) {
      return {
        ...deptConfig('inventory & equipment'),
        relatedRoutes: [{ label: 'Spare Parts', path: '/maintenance/spares' }, ...DEPT_RELATED],
      };
    }
    if (path.includes('checklists')) {
      return {
        ...deptConfig('checklists', 'checklist'),
        relatedRoutes: [{ label: 'ISM Checklists', path: '/ism/checklists' }],
      };
    }
    return deptConfig('department');
  }

  if (path.startsWith('/yard/refit/projects/')) {
    return {
      category: 'refit_project',
      description: 'Refit project management — periods, scopes, defects, contractors, and project documents.',
      defaultItemType: 'task',
      relatedRoutes: [
        { label: 'Refit Dashboard', path: '/yard/refit/overview/dashboard' },
        { label: 'Snags & Warranty', path: '/yard/refit/workflow/snags' },
        { label: 'Schedule', path: '/yard/refit/project/schedule' },
      ],
      features: ['Refit periods', 'Work packages', 'Defect lists', 'Contractor tracking', 'Project documents'],
    };
  }

  if (path.startsWith('/hris/recruitment/')) {
    return {
      category: 'hris_recruitment',
      description: 'Recruitment pipeline — vacancies, candidates, and onboarding.',
      defaultItemType: 'record',
      relatedRoutes: [
        { label: 'Crew Roster', path: '/crew/list' },
        { label: 'HR Dashboard', path: '/hr' },
      ],
      features: ['Vacancy postings', 'Candidate tracking', 'Interview notes', 'Onboarding checklist'],
    };
  }

  if (path.includes('agent-information')) {
    return {
      category: 'safety',
      description: 'Port agent contacts and information for vessel operations.',
      defaultItemType: 'record',
      relatedRoutes: [
        { label: 'Emergency Contacts', path: '/vessels/emergency-details' },
        { label: 'Itinerary', path: '/itinerary/planning' },
      ],
      features: ['Agent contacts', 'Port information', 'Clearance notes', 'Agency communications'],
    };
  }

  if (path.includes('purchase-orders') || path.includes('maintenance-periods')) {
    return {
      category: 'technical',
      description: 'Technical procurement and maintenance planning.',
      defaultItemType: 'task',
      relatedRoutes: [
        { label: 'Maintenance', path: '/maintenance' },
        { label: 'Spare Parts', path: '/maintenance/spares' },
        { label: 'Critical Equipment', path: '/maintenance/critical' },
      ],
      features: ['Purchase orders', 'Maintenance periods', 'Supplier tracking', 'Survey planning'],
    };
  }

  if (path.includes('movement-reports') || path.includes('communications') || path.includes('billing')) {
    return {
      category: 'general',
      description: `Vessel ${label.toLowerCase()} — operational records and communications log.`,
      defaultItemType: 'note',
      relatedRoutes: [
        { label: 'Vessel Details', path: '/vessels/list' },
        { label: 'Fleet Map', path: '/fleet-map' },
      ],
      features: ['Movement reports', 'Communications log', 'Billing records', 'Operational notes'],
    };
  }

  return {
    category: 'general',
    description: `${label} workspace — manage records, tasks, and checklists for this area.`,
    defaultItemType: 'note',
    relatedRoutes: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Documents', path: '/documents' },
    ],
    features: ['Notes & records', 'Task tracking', 'Checklists', 'Search & filter', 'Export data'],
  };
}
