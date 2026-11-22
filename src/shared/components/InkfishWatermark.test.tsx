import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import InkfishWatermark from './InkfishWatermark';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('accepts preview refs and image priority without React console errors', () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const ref = React.createRef<HTMLDivElement>();
  render(<InkfishWatermark ref={ref} />);

  expect(ref.current).toBeInstanceOf(HTMLDivElement);
  expect(error).not.toHaveBeenCalled();
});