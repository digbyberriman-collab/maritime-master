/**
 * The equipment register at phone width (390 px): the category list stacks
 * above the register, and the register card may shrink (min-w-0) so its
 * table scrolls inside the card rather than widening the page.
 */
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/modules/maintenance/hooks/useMaintenance', () => ({
  useMaintenance: () => ({ categories: [], equipment: [], tasks: [], flatCategories: [] }),
}));

import EquipmentRegisterTab from './EquipmentRegisterTab';

describe('EquipmentRegisterTab layout', () => {
  it('stacks below md and lets the register card shrink', () => {
    render(<EquipmentRegisterTab onAddEquipment={() => undefined} />);
    const classes = (el: Element | null) => (el?.className ?? '').split(/\s+/);
    const register = screen.getByText('Equipment Register').closest('[class*="flex-1"]') as HTMLElement;
    const layout = register.parentElement as HTMLElement;
    const sidebar = layout.firstElementChild as HTMLElement;
    expect(classes(layout)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'md:flex-row']));
    expect(classes(register)).toEqual(expect.arrayContaining(['flex-1', 'min-w-0']));
    expect(sidebar).toHaveTextContent('Categories');
    expect(classes(sidebar)).toEqual(expect.arrayContaining(['w-full', 'md:w-64', 'md:shrink-0']));
    expect(classes(sidebar)).not.toContain('shrink-0');
  });
});
