/**
 * lazyPage(): the one lazy + Suspense + error boundary + guard helper
 * (BUILD-PLAN B2, gap/00 B1).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { lazyPage, type PageModule } from '@/app/router/lazyPage';

/** A dynamic import we resolve by hand. */
function deferredModule<P>() {
  let resolve!: (m: PageModule<P>) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<PageModule<P>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  const loader = vi.fn(() => promise);
  return { loader, resolve, reject };
}

const ready = <P,>(component: React.ComponentType<P>) => vi.fn(() => Promise.resolve({ default: component }));

/** Settle pending promises and let React commit what they unlocked. */
const flush = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

const Guard: React.FC<{ children: React.ReactNode }> = ({ children }) => <div data-testid="guard">{children}</div>;
const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => <main data-testid="layout">{children}</main>;

/** Lets a test move the router from inside the tree. */
const NavButton: React.FC<{ to: string }> = ({ to }) => {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>go {to}</button>;
};

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  // ErrorBoundary and React both log caught render errors.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

describe('lazyPage', () => {
  it('creates React.lazy once, when called, not on render', async () => {
    const lazySpy = vi.spyOn(React, 'lazy');
    const loader = ready(() => <p>hello</p>);
    const Page = lazyPage(loader);
    expect(lazySpy).toHaveBeenCalledTimes(1);

    const { rerender } = render(<MemoryRouter><Page /></MemoryRouter>);
    for (let i = 0; i < 5; i += 1) rerender(<MemoryRouter><Page /></MemoryRouter>);
    await flush();

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(lazySpy).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledTimes(1);
    lazySpy.mockRestore();
  });

  it('shows the shared LazyLoader spinner until the chunk arrives', async () => {
    const mod = deferredModule<object>();
    const Page = lazyPage(mod.loader);
    const { container } = render(<MemoryRouter><Page /></MemoryRouter>);

    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.queryByText('loaded')).toBeNull();

    await act(async () => mod.resolve({ default: () => <p>loaded</p> }));
    await flush();
    expect(screen.getByText('loaded')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeNull();
  });

  it('passes props through to the page', async () => {
    const Titled: React.FC<{ title: string; description: string }> = ({ title, description }) => (
      <h1>
        {title}: {description}
      </h1>
    );
    const Page = lazyPage(ready(Titled));
    render(<MemoryRouter><Page title="Fleet Groups" description="not built yet" /></MemoryRouter>);
    await flush();
    expect(screen.getByRole('heading')).toHaveTextContent('Fleet Groups: not built yet');
  });

  it('wraps guard → layout → page, in that order', async () => {
    const Page = lazyPage(ready(() => <p data-testid="page">page</p>), { guard: Guard, layout: Layout });
    render(<MemoryRouter><Page /></MemoryRouter>);
    await flush();
    const guard = screen.getByTestId('guard');
    const layout = screen.getByTestId('layout');
    expect(guard).toContainElement(layout);
    expect(layout).toContainElement(screen.getByTestId('page'));
  });

  it('accepts a guard element with its own props, replacing its children', async () => {
    const Gate: React.FC<{ role: string; children?: React.ReactNode }> = ({ role, children }) => (
      <section aria-label={`gate ${role}`}>{children}</section>
    );
    const Page = lazyPage(ready(() => <p>inside</p>), { guard: <Gate role="admin">ignored</Gate> });
    render(<MemoryRouter><Page /></MemoryRouter>);
    await flush();
    const gate = screen.getByLabelText('gate admin');
    expect(gate).toHaveTextContent('inside');
    expect(gate).not.toHaveTextContent('ignored');
  });

  it('a guard that denies access never loads the page chunk', async () => {
    const loader = ready(() => <p>secret</p>);
    const Deny: React.FC<{ children: React.ReactNode }> = () => <p>denied</p>;
    const Page = lazyPage(loader, { guard: Deny });
    render(<MemoryRouter><Page /></MemoryRouter>);
    await flush();
    expect(screen.getByText('denied')).toBeInTheDocument();
    expect(loader).not.toHaveBeenCalled();
  });

  it('contains a page error inside the layout and labels it', async () => {
    const Broken: React.FC = () => {
      throw new Error('kaboom');
    };
    const Page = lazyPage(ready(Broken), { layout: Layout, label: 'Crew list' });
    render(<MemoryRouter><Page /></MemoryRouter>);
    await flush();
    expect(screen.getByTestId('layout')).toHaveTextContent('Crew list could not be displayed');
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('a failed chunk shows the error fallback rather than a blank page', async () => {
    const mod = deferredModule<object>();
    const Page = lazyPage(mod.loader);
    render(<MemoryRouter><Page /></MemoryRouter>);
    await act(async () => mod.reject(new Error('Failed to fetch dynamically imported module')));
    await flush();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('the error boundary resets when the path changes, without remounting a healthy page', async () => {
    let fail = true;
    let mounts = 0;
    const Flaky: React.FC = () => {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      if (fail) throw new Error('first render fails');
      return <p>recovered</p>;
    };
    const Page = lazyPage(ready(Flaky), { layout: Layout });
    render(
      <MemoryRouter initialEntries={['/items/1']}>
        <NavButton to="/items/2" />
        <NavButton to="/items/3" />
        <Routes>
          <Route path="/items/:id" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );
    await flush();
    expect(screen.getByText('first render fails')).toBeInTheDocument();

    fail = false;
    fireEvent.click(screen.getByText('go /items/2'));
    await flush();
    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(mounts).toBe(1);

    // Same route, new param: the page updates in place.
    fireEvent.click(screen.getByText('go /items/3'));
    await flush();
    expect(screen.getByText('recovered')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it('one page component shared by two routes keeps the page mounted between them', async () => {
    let mounts = 0;
    const Counter: React.FC = () => {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <p>counter</p>;
    };
    const Page = lazyPage(ready(Counter));
    render(
      <MemoryRouter initialEntries={['/a']}>
        <NavButton to="/b" />
        <Routes>
          <Route path="/a" element={<Page />} />
          <Route path="/b" element={<Page />} />
        </Routes>
      </MemoryRouter>,
    );
    await flush();
    fireEvent.click(screen.getByText('go /b'));
    await flush();
    expect(screen.getByText('counter')).toBeInTheDocument();
    expect(mounts).toBe(1);
  });

  it('separate lazyPage calls for one module stay separate components, so they remount', async () => {
    let mounts = 0;
    const Counter: React.FC = () => {
      React.useEffect(() => {
        mounts += 1;
      }, []);
      return <p>counter</p>;
    };
    const Create = lazyPage(ready(Counter));
    const Edit = lazyPage(ready(Counter));
    render(
      <MemoryRouter initialEntries={['/create']}>
        <NavButton to="/edit" />
        <Routes>
          <Route path="/create" element={<Create />} />
          <Route path="/edit" element={<Edit />} />
        </Routes>
      </MemoryRouter>,
    );
    await flush();
    fireEvent.click(screen.getByText('go /edit'));
    await flush();
    expect(mounts).toBe(2);
  });

  it('preload() fetches the chunk once and shares it with the render', async () => {
    const loader = ready(() => <p>preloaded</p>);
    const Page = lazyPage(loader);
    await Page.preload();
    await Page.preload();
    expect(loader).toHaveBeenCalledTimes(1);
    render(<MemoryRouter><Page /></MemoryRouter>);
    await flush();
    expect(screen.getByText('preloaded')).toBeInTheDocument();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('preload() can retry after a failed fetch', async () => {
    const loader = vi
      .fn<() => Promise<PageModule<object>>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ default: () => <p>second try</p> });
    const Page = lazyPage(loader);
    await expect(Page.preload()).rejects.toThrow('offline');
    await expect(Page.preload()).resolves.toHaveProperty('default');
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('names the component for React devtools', () => {
    expect(lazyPage(ready(() => null), { label: 'Crew list' }).displayName).toBe('LazyPage(Crew list)');
    expect(lazyPage(ready(() => null)).displayName).toBe('LazyPage');
  });
});
