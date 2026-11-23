/**
 * The tooltip of a top-bar icon control (gap/10 improvement 12; D-92): the
 * shared icon-control tooltip (../IconTooltip.tsx) below the control. Kept
 * as its own name so the top-bar controls import it unchanged; see
 * IconTooltip for the behaviour, the nesting rule with menu and popover
 * triggers, and why it portals.
 */
import TopBarTooltip from '../IconTooltip';

export { TOOLTIP_DELAY_MS } from '../IconTooltip';
export type { IconTooltipProps as TopBarTooltipProps } from '../IconTooltip';

export default TopBarTooltip;
