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

  it('calls onReset when Try again clears an error, before the children render again', () => {
    const order: string[] = [];
    const onReset = vi.fn(() => order.push('reset'));
    const Child = ({ explode }: { explode: boolean }) => {
      if (explode) throw new Error('kaboom');
      order.push('render');
      return <div>recovered content</div>;
    };
    const { rerender } = render(
      <ErrorBoundary onReset={onReset}>
        <Child explode />
      </ErrorBoundary>,
    );
    expect(onReset).not.toHaveBeenCalled();
    rerender(
      <ErrorBoundary onReset={onReset}>
        <Child explode={false} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['reset', 'render']);
    expect(screen.getByText('recovered content')).toBeInTheDocument();
  });

  it('calls onReset when the reset key changes after an error, and not without one', () => {
    const onReset = vi.fn();
    const { rerender } = render(
      <ErrorBoundary resetKey="/crew" onReset={onReset}>
        <Boom explode />
      </ErrorBoundary>,
    );
    rerender(
      <ErrorBoundary resetKey="/documents" onReset={onReset}>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(screen.getByText('recovered content')).toBeInTheDocument();

    // Healthy subtree: a path change is not a reset.
    rerender(
      <ErrorBoundary resetKey="/vessels" onReset={onReset}>
        <Boom explode={false} />
      </ErrorBoundary>,
    );
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
