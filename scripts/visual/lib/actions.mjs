/**
 * Scripted actions for a capture: open a menu, press a shortcut, type a
 * query, wait for the result, then take the screenshot. A route in
 * routes.json lists them under "actions"; `validateActions` (used by
 * options.mjs) checks the list when routes.json is read, and `runActions`
 * plays it against a Playwright page after the page has settled.
 *
 * One step is an object with exactly one key:
 *   { "click": "<selector>" }                          click the first match
 *   { "press": "Control+k" }                           a key or chord (Playwright key names)
 *   { "type": { "selector": "<selector>", "text": "crew" } }   focus, then type
 *   { "hover": "<selector>" }                          move the pointer over it
 *   { "waitFor": "<selector>" }                        wait until it is visible
 *   { "wait": 300 }                                    pause, in ms (0–30000)
 *
 * A step that fails (selector missing, timeout) never crashes the run: it
 * becomes a note ("action 2 (click …) failed: …"), which report grading
 * turns into a warning, and the steps after it are skipped (they depend on
 * it). Pure apart from the page calls; tested with a fake page in
 * scripts/visual/test/actions.test.mjs.
 */

export const ACTION_KINDS = ['click', 'press', 'type', 'hover', 'waitFor', 'wait'];

/** Longest pause a "wait" step may ask for. */
export const MAX_WAIT_MS = 30_000;
/** Default time a step may take (Playwright timeouts). */
export const DEFAULT_ACTION_TIMEOUT_MS = 10_000;

const isSelector = (value) => typeof value === 'string' && value.trim().length > 0;

/**
 * Check and normalise a route's "actions". Throws with the route and step
 * named, so a typo in routes.json fails fast instead of mid-run.
 * @param {unknown} actions
 * @param {string} where e.g. 'Route "palette-open"'
 * @returns {({ kind: 'click' | 'hover' | 'waitFor', selector: string } | { kind: 'press', key: string } | { kind: 'type', selector: string, text: string } | { kind: 'wait', ms: number })[]}
 */
export function validateActions(actions, where = 'Route') {
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error(`${where}: "actions" must be an array of steps`);
  return actions.map((step, index) => {
    const at = `${where}: actions[${index}]`;
    if (!step || typeof step !== 'object' || Array.isArray(step)) {
      throw new Error(`${at} must be an object such as { "click": "<selector>" }`);
    }
    const keys = Object.keys(step);
    const unknown = keys.filter((k) => !ACTION_KINDS.includes(k));
    if (unknown.length) {
      throw new Error(`${at} has unknown key${unknown.length > 1 ? 's' : ''} ${unknown.map((k) => `"${k}"`).join(', ')}. Use one of ${ACTION_KINDS.join(', ')}.`);
    }
    if (keys.length !== 1) throw new Error(`${at} must have exactly one of ${ACTION_KINDS.join(', ')}, got ${keys.length ? keys.join(' + ') : 'none'}`);
    const kind = keys[0];
    const value = step[kind];
    switch (kind) {
      case 'click':
      case 'hover':
      case 'waitFor':
        if (!isSelector(value)) throw new Error(`${at}: "${kind}" needs a CSS selector string`);
        return { kind, selector: value };
      case 'press':
        if (!isSelector(value)) throw new Error(`${at}: "press" needs a key such as "Control+k" or "Escape"`);
        return { kind, key: value };
      case 'type': {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`${at}: "type" needs { "selector": "<selector>", "text": "…" }`);
        }
        const extra = Object.keys(value).filter((k) => k !== 'selector' && k !== 'text');
        if (extra.length) throw new Error(`${at}: "type" has unknown key${extra.length > 1 ? 's' : ''} ${extra.map((k) => `"${k}"`).join(', ')}; it takes "selector" and "text"`);
        if (!isSelector(value.selector)) throw new Error(`${at}: "type.selector" needs a CSS selector string`);
        if (typeof value.text !== 'string') throw new Error(`${at}: "type.text" needs a string`);
        return { kind, selector: value.selector, text: value.text };
      }
      case 'wait':
        if (!Number.isInteger(value) || value < 0 || value > MAX_WAIT_MS) throw new Error(`${at}: "wait" needs whole milliseconds from 0 to ${MAX_WAIT_MS}`);
        return { kind, ms: value };
      default:
        throw new Error(`${at}: unknown action "${kind}"`);
    }
  });
}

/** One line describing a step, for notes and logs. */
export function describeAction(step) {
  switch (step.kind) {
    case 'press':
      return `press ${step.key}`;
    case 'type':
      return `type "${step.text}" into ${step.selector}`;
    case 'wait':
      return `wait ${step.ms} ms`;
    default:
      return `${step.kind} ${step.selector}`;
  }
}

const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split('\n')[0].slice(0, 300);

/**
 * Play validated steps against a Playwright page, in order.
 * @param {{ click: Function, hover: Function, focus: Function, waitForSelector: Function, waitForTimeout: Function, keyboard: { press: Function, type: Function } }} page
 * @param {ReturnType<typeof validateActions>} steps
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ ran: number, notes: string[] }>} `ran` counts the steps that succeeded
 */
export async function runActions(page, steps, { timeout = DEFAULT_ACTION_TIMEOUT_MS } = {}) {
  const notes = [];
  let ran = 0;
  for (let i = 0; i < steps.length; i += 1) {
    const step = steps[i];
    try {
      switch (step.kind) {
        case 'click':
          await page.click(step.selector, { timeout });
          break;
        case 'hover':
          await page.hover(step.selector, { timeout });
          break;
        case 'press':
          await page.keyboard.press(step.key);
          break;
        case 'type':
          await page.focus(step.selector, { timeout });
          await page.keyboard.type(step.text, { delay: 15 });
          break;
        case 'waitFor':
          await page.waitForSelector(step.selector, { timeout, state: 'visible' });
          break;
        case 'wait':
          await page.waitForTimeout(step.ms);
          break;
        default:
          throw new Error(`unknown action "${step.kind}"`);
      }
      ran += 1;
    } catch (error) {
      notes.push(`action ${i + 1} (${describeAction(step)}) failed: ${firstLine(error)}`);
      const skipped = steps.length - i - 1;
      if (skipped > 0) notes.push(`skipped ${skipped} later action${skipped > 1 ? 's' : ''}`);
      break;
    }
  }
  return { ran, notes };
}
