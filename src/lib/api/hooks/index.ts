// API Hooks Index - Re-export all hooks for convenient imports

// Users (7.1)
export * from './useUsersApi';

// Vessels (7.2)
export * from './useVesselsApi';

// Flights (7.5)
export * from './useFlightsApi';

// Alerts (7.6)
export * from './useAlertsApi';

// Incidents (7.8)
export {
  incidentsKeys,
  useIncidentsApi,
  useIncidentApi,
  useCreateIncidentApi,
  useUpdateIncidentApi,
  useOpenInvestigationApi,
  useApproveNoInvestigationApi,
  useNotifyShippingMasterApi,
} from './useIncidentsApi';
