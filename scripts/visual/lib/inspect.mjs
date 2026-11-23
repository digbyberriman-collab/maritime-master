/**
 * What the harness checks on each rendered page, and how a capture is graded.
 *
 * `inspectPage` runs inside the browser (it is passed to page.evaluate), so it
 * must stay self-contained. `classify` is pure and unit-tested.
 */

/** Runs in the page. Reads the rendered DOM only; changes nothing. */
export function inspectPage() {
  const squash = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const root = document.getElementById('root');
  const bodyText = squash(document.body ? document.body.innerText : '');
  const rootText = squash(root ? root.innerText : '');
  const visibleMedia = root
    ? Array.from(root.querySelectorAll('img, svg, canvas, video, iframe')).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 24 && r.height > 24;
      }).length
    : 0;
  // STORM's ErrorBoundary always says "This part of the page failed to render";
  // its title is "Something went wrong" or "<label> could not be displayed".
  const errorBoundary = /This part of the page failed to render/.test(bodyText);
  const titleMatch = /([A-Z][\w &/-]{0,60} could not be displayed|Something went wrong)/.exec(bodyText);
  const accessDeniedMatch = /(Restricted area|HR access required|Finance access required|Clinical access required|Wellness access required)/.exec(bodyText);
  const h1 = document.querySelector('h1');
  // A skeleton or loading region still announced as busy (PageLoading,
  // DataTable, KpiTile and MatrixGrid set aria-busy while they load).
  const busy = !!document.querySelector('main [aria-busy="true"], #root [role="status"][aria-busy="true"]');
  // Sideways scroll: how far the main pane and the page scroll horizontally.
  const main = document.querySelector('main');
  const doc = document.documentElement;
  const overflowX = {
    main: main ? main.scrollWidth - main.clientWidth : 0,
    document: doc ? doc.scrollWidth - doc.clientWidth : 0,
  };
  // Top-bar controls that overlap or cannot be hit (D-35, the TopBar contract):
  // every visible pair whose boxes intersect horizontally by more than 0.5 px,
  // and every control whose centre point hits something outside it (a
  // neighbour painted over it, or its own part clipped away). The ids are
  // SHELL_TEST_IDS values (src/app/shell/testIds.ts), inlined because this
  // function runs in the page. null when the page has no top bar (sign-in).
  const topBar = document.querySelector('[data-testid="shell-topbar"]');
  const topbarCollisions = topBar ? [] : null;
  if (topBar) {
    const ids = [
      'shell-mobile-nav-trigger',
      'shell-tenant-logo',
      'shell-scope-fleet',
      'shell-scope-vessel',
      'shell-vessel-switcher-trigger',
      'shell-scope-workspace',
      'shell-apps-trigger',
      'shell-search-trigger',
      'shell-favourite-toggle',
      'shell-favourites-trigger',
      'shell-help-trigger',
      'shell-notifications-trigger',
      'shell-account-trigger',
    ];
    const controls = [];
    for (const id of ids) {
      const el = topBar.querySelector(`[data-testid="${id}"]`);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (r.width < 1 || r.height < 1 || style.visibility === 'hidden') continue;
      controls.push({ id, el, r });
    }
    for (let a = 0; a < controls.length; a += 1) {
      for (let b = a + 1; b < controls.length; b += 1) {
        const x = controls[a].r;
        const y = controls[b].r;
        const overlap = Math.min(x.right, y.right) - Math.max(x.left, y.left);
        if (overlap > 0.5) topbarCollisions.push(`${controls[a].id} overlaps ${controls[b].id} by ${overlap.toFixed(1)}px`);
      }
    }
    // An open modal layer (dialog, menu, drawer) covers the bar on purpose; skip the hit test then.
    const modalOpen = (document.body && document.body.style.pointerEvents === 'none') || !!document.querySelector('[aria-modal="true"]');
    if (!modalOpen) {
      for (const { id, el, r } of controls) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && el.contains(hit)) continue;
        const owner = hit ? hit.closest('[data-testid]') : null;
        const what = owner ? owner.getAttribute('data-testid') : hit ? hit.tagName.toLowerCase() : 'nothing (off screen)';
        topbarCollisions.push(`${id} centre hits ${what}`);
      }
    }
  }
  return {
    title: document.title,
    h1: h1 ? squash(h1.textContent).slice(0, 120) : null,
    themeClass: document.documentElement.className,
    textLength: rootText.length,
    textSample: rootText.slice(0, 160),
    rootChildren: root ? root.childElementCount : 0,
    visibleMedia,
    errorBoundary,
    errorBoundaryTitle: errorBoundary && titleMatch ? titleMatch[1] : null,
    somethingWentWrong: /Something went wrong/i.test(bodyText),
    accessDenied: accessDeniedMatch ? accessDeniedMatch[1] : null,
    recoveryPanel: bodyText.includes("We couldn't finish loading STORM"),
    loadingOnly: rootText.length < 40 && (/Loading/i.test(rootText) || !!(root && root.querySelector('.animate-spin'))),
    busy,
    overflowX,
    topbarCollisions,
    signInForm: !!document.querySelector('input[type="password"]'),
  };
}

/** Viewports narrower than this are phone layouts, where sideways scroll is a defect. */
export const PHONE_MAX_WIDTH = 768;
/** More mock requests than this in one capture means a refetch loop, not a busy page. */
export const RUNAWAY_REQUESTS = 500;

/** Capture notes that mean a wait gave up: the screenshot may show an unfinished page. */
const WAIT_FAILURE_NOTES = [
  /^network did not go idle$/,
  /^a spinner was still showing$/,
  /^a skeleton was still showing$/,
  /^waitFor .* not found$/,
  /^screenshot failed/,
  // A scripted step that failed (lib/actions.mjs): the screenshot does not show the state it asked for.
  /^action \d+ \(.*\) failed: /,
];

/**
 * Warnings for what capture() noticed outside the page: waits that timed out
 * and runaway request volume.
 * @param {{ notes?: string[], mockRequests?: number }} c
 * @returns {string[]}
 */
export function captureWarnings({ notes = [], mockRequests = 0 } = {}) {
  const warnings = notes.filter((n) => WAIT_FAILURE_NOTES.some((re) => re.test(n)));
  if (mockRequests > RUNAWAY_REQUESTS) warnings.push(`runaway fetching: ${mockRequests} mock requests`);
  return warnings;
}

const normalisePath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Grade one capture.
 * @param {{ requestedPath: string, finalUrl: string | null, expectAuth: boolean, expectRedirect?: string | boolean,
 *           inspection: ReturnType<typeof inspectPage> | null, consoleErrors: string[], pageErrors: string[], navigationError: string | null,
 *           viewportWidth?: number }} c
 * @returns {{ status: 'ok' | 'warn' | 'fail', problems: string[], warnings: string[] }}
 */
export function classify(c) {
  const problems = [];
  const warnings = [];
  if (c.navigationError) problems.push(`navigation: ${c.navigationError}`);
  const finalPath = c.finalUrl ? normalisePath(new URL(c.finalUrl).pathname) : null;
  const requested = normalisePath(c.requestedPath.split('?')[0]);
  const i = c.inspection;
  if (i) {
    if (i.errorBoundary) problems.push(`error boundary${i.errorBoundaryTitle ? `: ${i.errorBoundaryTitle}` : ''}`);
    if (i.recoveryPanel) problems.push('stale-chunk recovery panel');
    if (i.textLength === 0 && i.visibleMedia === 0) problems.push('blank page');
    if (!i.errorBoundary && i.somethingWentWrong) warnings.push("'Something went wrong' text on page");
    // A skeleton inside the shell has plenty of text around it, so busy wins over length.
    if (i.busy) warnings.push('still loading (skeleton)');
    else if (i.loadingOnly) warnings.push('still loading');
    // Overlapping or unreachable top-bar controls are a defect at any width (a tap lands on the wrong control).
    if (Array.isArray(i.topbarCollisions) && i.topbarCollisions.length) {
      problems.push(`top bar collision: ${i.topbarCollisions.join('; ')}`);
    }
    if (typeof c.viewportWidth === 'number' && c.viewportWidth < PHONE_MAX_WIDTH && i.overflowX) {
      const worst = Math.max(i.overflowX.main ?? 0, i.overflowX.document ?? 0);
      if (worst > 1) warnings.push(`horizontal overflow: ${worst}px at ${c.viewportWidth}px wide`);
    }
    if (i.accessDenied) warnings.push(`access denied: ${i.accessDenied}`);
  } else if (!c.navigationError) {
    problems.push('page could not be inspected');
  }
  if (c.pageErrors.length) problems.push(`${c.pageErrors.length} page error(s)`);
  if (c.expectAuth && finalPath && /^\/auth(\/|$)/.test(finalPath)) problems.push('redirected to sign-in (session not accepted)');
  if (finalPath && finalPath !== requested) {
    const expected = c.expectRedirect;
    const ok = expected === true || (typeof expected === 'string' && normalisePath(expected) === finalPath);
    if (!ok && !(c.expectAuth && /^\/auth(\/|$)/.test(finalPath))) warnings.push(`redirected to ${finalPath}`);
  }
  if (c.consoleErrors.length) warnings.push(`${c.consoleErrors.length} console error(s)`);
  const status = problems.length ? 'fail' : warnings.length ? 'warn' : 'ok';
  return { status, problems, warnings };
}

/** Console noise the harness itself causes (blocked externals, the fake backend), not app bugs. */
export function isHarnessNoise(text) {
  return (
    /net::ERR_(BLOCKED_BY_CLIENT|FAILED|ABORTED|NAME_NOT_RESOLVED|CONNECTION_REFUSED|INTERNET_DISCONNECTED)/.test(text) &&
    /(fonts\.g|tile\.|openstreetmap|googleapis|gstatic|basemaps|arcgis)/.test(text)
  );
}

/**
 * React development warnings ("Warning: ...") are listed separately and do not
 * change a capture's status, except the ones that mean a real runtime problem.
 */
export function isReactDevWarning(text) {
  return /^Warning: /.test(text) && !/Maximum update depth exceeded|Cannot update a component .* while rendering/.test(text);
}

/** Apply console `%s`/`%d`/`%o` substitutions the way the devtools console shows them. */
export function formatConsoleArgs(args) {
  if (args.length === 0) return '';
  const [first, ...rest] = args;
  if (typeof first !== 'string') return args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  let i = 0;
  const formatted = first.replace(/%[sdifoOc]/g, (token) => {
    if (i >= rest.length) return token;
    const value = rest[i++];
    if (token === '%c') return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
  });
  const tail = rest.slice(i).map((a) => (typeof a === 'string' ? a : JSON.stringify(a)));
  return [formatted, ...tail].join(' ').trim();
}

