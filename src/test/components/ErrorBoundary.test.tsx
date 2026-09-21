/**
 * The app had no error boundary: any unhandled render error blanked the whole
 * SPA. These tests hold the contract — a failing subtree is contained, the
 * shell survives, and recovery works.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ErrorBoundary from '@/shared/components/ErrorBoundary';

const Boom = ({ explode }: { explode: boolean }) => {
  if (explode) throw new Error('kaboom');
  return <div>recovered content</div>;
};

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // React logs the caught error; keep the test output readable.
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('all good')).toBeInTheDocument();
  });

  it('shows a fallback with the message instead of crashing, and names the area', () => {
    render(
      <ErrorBoundary label="Crew roster">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Crew roster could not be displayed')).toBeInTheDocument();
    expect(screen.getByText('kaboom')).toBeInTheDocument();
  });

  it('recovers when the user retries and the child no longer throws', () => {
    const { rerender } = render(
      <ErrorBoundary>
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText('kaboom')).toBeInTheDocument();

    rerender(
      <ErrorBoundary>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });

  it('clears itself when the reset key changes, so navigation escapes a broken page', () => {
    const { rerender } = render(
      <ErrorBoundary resetKey="/crew">
        <Boom explode />
      </ErrorBoundary>,
    );
    expect(screen.getByText('kaboom')).toBeInTheDocument();

    rerender(
      <ErrorBoundary resetKey="/documents">
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });
});
