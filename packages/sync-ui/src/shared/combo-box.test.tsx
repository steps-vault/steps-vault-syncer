import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComboBox, getMatchingComboBoxOptions } from './combo-box';

const GENRE_OPTIONS = [{ value: 'Electronic', label: 'Electronic', count: 4 }, { value: 'Israeli Pop', label: 'Israeli Pop', count: 1 }, { value: 'Pop', label: 'Pop', count: 6 }];

describe('ComboBox', () => {
  it('lists "any" first, then narrows to names that contain the typed text, those that start with it first', () => {
    expect(getMatchingComboBoxOptions({ options: GENRE_OPTIONS, anyLabel: 'All genres', query: '' }).map((option) => option.label)).toEqual(['All genres', 'Electronic', 'Israeli Pop', 'Pop']);
    expect(getMatchingComboBoxOptions({ options: GENRE_OPTIONS, anyLabel: 'All genres', query: 'pop' }).map((option) => option.label)).toEqual(['Pop', 'Israeli Pop']);
    expect(getMatchingComboBoxOptions({ options: [{ value: 'Beyoncé', label: 'Beyoncé' }], anyLabel: 'All artists', query: 'beyonce' })).toHaveLength(1);
  });

  it('picks with the arrow keys and Enter, and says when nothing matches', () => {
    const onChange = vi.fn();
    render(<ComboBox label="Genre" anyLabel="All genres" noun="genre" options={GENRE_OPTIONS} value="" onChange={onChange} />);
    const field = screen.getByRole('combobox', { name: 'Genre' });
    fireEvent.focus(field);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['All genres', 'Electronic4', 'Israeli Pop1', 'Pop6']);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('Electronic');
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value: 'rock' } });
    expect(screen.getByRole('status').textContent).toBe('No genre matches “rock”.');
  });

  it('clears the picked name back to "any"', () => {
    const onChange = vi.fn();
    render(<ComboBox label="Genre" anyLabel="All genres" noun="genre" options={GENRE_OPTIONS} value="Pop" onChange={onChange} />);
    expect(screen.getByRole<HTMLInputElement>('combobox', { name: 'Genre' }).value).toBe('Pop');
    fireEvent.click(screen.getByRole('button', { name: 'Clear Genre' }));
    expect(onChange).toHaveBeenCalledWith('');
  });
});
