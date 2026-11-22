/**
 * Data display (gap/10 DS13–DS15; BUILD-PLAN A7, A8): KPI tiles, the register
 * table and the matrix grid, plus their shared pieces.
 *
 * The map theme (`./mapTheme`, A9) is deliberately not re-exported here: it
 * imports Leaflet, which must stay in the map chunks. Import it directly.
 */
export { KpiTile, KpiGrid, type KpiTileProps, type KpiTileState, type KpiDelta } from './KpiTile';
export {
  DataTable,
  type DataTableColumn,
  type DataTableColumnKind,
  type DataTableEmpty,
  type DataTableFilter,
  type DataTableProps,
} from './DataTable';
export {
  MatrixGrid,
  MatrixToggleCell,
  type MatrixCellContext,
  type MatrixColumn,
  type MatrixColumnGroup,
  type MatrixGridProps,
  type MatrixRowColumn,
} from './MatrixGrid';
export { CountChips, DensityToggle, EmptyCell, SearchField, SortButton } from './tableParts';
export {
  ALL_CHIP_ID,
  ROW_HEIGHT,
  VIRTUALIZE_THRESHOLD,
  compareValues,
  pluralise,
  showingSummary,
  sortRows,
  type CellValue,
  type ChipFilter,
  type MatrixChange,
  type SortDirection,
  type TableSort,
} from './tableModel';
