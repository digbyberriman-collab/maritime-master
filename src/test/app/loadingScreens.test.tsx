/**
 * Route loading, Coming Soon and the standalone 404 on tokens (BUILD-PLAN S6,
 * gap/10 §C.2 item 10). LazyLoader keeps the page-heading contract markers.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LazyLoader } from '@/shared/components/common/LazyLoader';
import { PlaceholderPage } from '@/shared/components/common/PlaceholderPage';
import NotFound from '@/shared/pages/NotFound';
import { readRepoFile } from '../design/cssTokens';

describe('LazyLoader', () => {
  it('keeps data-route-loading, role=status and aria-busy (heading contract)', () => {
    const { container } = render(<LazyLoader />);
    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute('data-route-loading');
    expect(root).toHaveAttribute('role', 'status');
    expect(root).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('fades the spinner in late, so a fast chunk shows nothing', () => {
    const { container } = render(<LazyLoader />);
    expect(container.querySelector('.appear-delayed')).not.toBeNull();
    expect(readRepoFile('src/index.css')).toMatch(/\.appear-delayed \{\s*animation: appear-delayed [^;]+ 200ms both;/);
  });
});

describe('PlaceholderPage', () => {
  it('brings one h1 and says Coming soon', () => {
    render(
      <MemoryRouter>
        <PlaceholderPage title="Fleet groups" features={['Group vessels by owner']} expectedRelease="Phase 2" />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Fleet groups');
    expect(screen.getByText('Coming soon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Planned features');
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });
});

describe('NotFound', () => {
  it('names the path, links home and keeps the watermark behind the content', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/no/such/page']}>
        <NotFound />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Page not found');
    expect(screen.getByText('/no/such/page')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to STORM' })).toHaveAttribute('href', '/');
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/\bisolate\b/);
    expect(container.querySelector('[data-watermark="inkfish"]')?.parentElement?.className).toContain('-z-10');
  });
});

describe('palette ratchet stays at zero for the new files', () => {
  it.each([
    'src/shared/components/common/LazyLoader.tsx',
    'src/shared/components/common/PlaceholderPage.tsx',
    'src/shared/pages/NotFound.tsx',
    'src/main.tsx',
    'src/modules/auth/pages/Auth.tsx',
    'src/modules/auth/pages/ResetPassword.tsx',
    'src/modules/auth/components/brand/AuthLayout.tsx',
    'src/modules/auth/components/brand/AuthFields.tsx',
    'src/modules/auth/components/brand/StormWordmark.tsx',
    'src/modules/auth/components/brand/StormMark.tsx',
  ])('%s has no hex colour, raw palette class or dark: variant', (file) => {
    const text = readRepoFile(file);
    expect(text).not.toMatch(/['"`\s(:,=]#[0-9a-fA-F]{6}\b/);
    expect(text).not.toMatch(/\b(?:bg|text|border|ring|from|via|to|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/);
    expect(text).not.toMatch(/(?<![\w-])dark:/);
  });
});
