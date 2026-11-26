/**
 * Public API of the Forms & Checklists module (gap/02 FC1–FC7, W2; X5
 * spec §2 X5-06A / X5-06B). Other modules (the ISM template pages, the
 * vessel Safety › Checklists page) use these; they never import the
 * module's internals. Not imported by the manifest, so none of it reaches
 * the entry chunk until a lazy page pulls it in.
 *
 * - The lifecycle (`templateMachine`), the publish checks, cadence and the
 *   area model (pure).
 * - Every status and per-vessel change through the definers
 *   (`useFormTemplateMutations` and the plain async wrappers), with the
 *   D-X5-20 publish / archive fallback while the definers are missing.
 * - The pending types of the catalogue columns, settings, history and RPCs.
 * - X5-06B: the catalogue reads (`useFormTemplateCatalogue`, settings, run
 *   statistics, one template), the draft save, and `useVesselFormTemplates`
 *   (one vessel's templates in one area: hidden ones left out, the
 *   vessel's order) for the vessel pages; the catalogue model and the
 *   builder's schema (pure); the module's paths and keys.
 */
export { formsKeys, LEGACY_TEMPLATE_KEYS } from './hooks/keys';
export {
  FormTemplateRefusalError,
  NOT_SAVED_MESSAGE,
  NOT_SET_UP_MESSAGE,
  archiveTemplate,
  archiveTemplateWithFallback,
  customiseTemplate,
  deleteDraftTemplate,
  formsDb,
  isFormTemplateNotSetUp,
  legacyArchiveWrite,
  legacyPublishWrite,
  moveTemplateArea,
  newTemplateVersion,
  publishTemplate,
  publishTemplateWithFallback,
  reorderTemplates,
  setTemplateVisibility,
  toFormTemplateError,
  useFormTemplateMutations,
  type ArchiveInput,
  type FormTemplateMutations,
  type MoveAreaInput,
  type PublishInput,
  type ReorderInput,
  type VisibilityInput,
  type WriteVia,
} from './hooks/useFormTemplateMutations';
export {
  ARCHIVE_REASON_MAX,
  FORM_TEMPLATE_ACTIONS,
  FORM_TEMPLATE_ACTION_RPC,
  FORM_TEMPLATE_MACHINE,
  FORM_TEMPLATE_REFUSALS,
  FORM_TEMPLATE_STATUSES,
  HIDE_REASON_MAX,
  TEMPLATE_CODE_MAX,
  VERSION_LABEL_MAX,
  customiseCode,
  deleteRefusal,
  formTemplateActions,
  formTemplateRefusal,
  formTemplateTransition,
  isFormTemplateStatus,
  newVersionRefusal,
  nextVersionNumber,
  normaliseFormTemplateStatus,
  versionDisplay,
  type FormTemplateAction,
  type FormTemplateOutcome,
} from './lib/templateMachine';
export {
  PUBLISH_BLOCKERS,
  publishBlocker,
  publishBlockers,
  publishIssues,
  schemaFields,
  templateSections,
  type PublishBlocker,
  type PublishCheckInput,
  type PublishIssue,
  type TemplateSectionModel,
} from './lib/publishChecks';
export { CADENCES, CADENCE_LABELS, UNSCHEDULED_CADENCES, cadenceLabel, isCadence, isOverdue, isScheduledCadence, nextDue, runDue } from './lib/cadence';
export {
  AREA_CREW_LOCATIONS,
  AREA_LABELS,
  FORM_KIND_LABELS,
  FORM_TEMPLATE_AREAS,
  FORM_TEMPLATE_KINDS,
  UNSORTED_LABEL,
  UNSORTED_SLUG,
  areaCrewLocation,
  areaFromSlug,
  areaLabel,
  areaSlug,
  formKindLabel,
  groupByArea,
  isFormTemplateArea,
  isFormTemplateKind,
  type AreaGroup,
} from './lib/areaModel';
export type {
  FormTemplateArea,
  FormTemplateCadence,
  FormTemplateCatalogueColumns,
  FormTemplateEventAction,
  FormTemplateEventRow,
  FormTemplateKind,
  FormTemplateOrigin,
  FormTemplateRow,
  FormTemplateRunStatRow,
  FormTemplateStatus,
  FormTemplateVesselSettingRow,
  FormTemplateVisibility,
  LiveFormTemplateRow,
} from './types/db.pending';
export {
  CODE_TAKEN_MESSAGE,
  DRAFT_NOT_PERMITTED_MESSAGE,
  NO_LONGER_DRAFT_MESSAGE,
  codeEditable,
  saveTemplateDraft,
  useFormTemplateCatalogue,
  useFormTemplateDetail,
  useFormTemplateDrafts,
  useFormTemplateRunStats,
  useFormTemplateVesselSettings,
  useSaveTemplateDraft,
  type CatalogueState,
  type DraftFormsState,
  type RunStatsState,
  type SaveDraftInput,
  type SavedDraft,
  type TemplateDetailState,
  type VesselSettingsState,
} from './hooks/useFleetFormTemplates';
export { useVesselFormTemplates, type VesselFormTemplatesState } from './hooks/useVesselFormTemplates';
export {
  ORIGIN_LABELS,
  areaCounts,
  areaKeyFromSlug,
  areaKeyLabel,
  areaKeySlug,
  formatDay,
  formatUpdatedUtc,
  indexSettings,
  isCustomisedCopy,
  lastRunText,
  originKind,
  orderOnVessel,
  placement,
  resolveShowing,
  runSummary,
  targetsVessel,
  vesselRunTally,
  vesselTemplates,
  type AreaCounts,
  type AreaKey,
  type CatalogueTemplate,
  type OriginKind,
  type RunSummary,
  type Showing,
  type ShowingVessel,
  type TemplatePlacement,
  type VesselRunTally,
  type VesselSetting,
} from './lib/catalogueModel';
export {
  ITEM_TYPES,
  ITEM_TYPE_LABELS,
  builderIssues,
  formSchemaToSections,
  parseSeveralItems,
  sectionsToFields,
  sectionsToFormSchema,
  suggestTemplateCode,
  templateFormSchema,
  valuesFromTemplate,
  type BuilderIssue,
  type BuilderItem,
  type BuilderSection,
  type TemplateDetail,
  type TemplateFormValues,
} from './lib/templateSchema';
export { FORMS_CAPABILITIES, FORMS_CAPS, FORMS_FLEET_PATHS, FORMS_FLEET_ROOT, FORMS_PARAMS, fleetFormsPath } from './paths';
