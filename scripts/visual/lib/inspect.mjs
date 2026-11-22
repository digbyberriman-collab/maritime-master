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
    signInForm: !!document.querySelector('input[type="password"]'),
  };
}

const normalisePath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p);

/**
 * Grade one capture.
 * @param {{ requestedPath: string, finalUrl: string | null, expectAuth: boolean, expectRedirect?: string | boolean,
 *           inspection: ReturnType<typeof inspectPage> | null, consoleErrors: string[], pageErrors: string[], navigationError: string | null }} c
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
    if (i.loadingOnly) warnings.push('still loading');
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

