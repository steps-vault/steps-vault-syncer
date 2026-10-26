import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FAKE_LINKED_COMPUTERS } from '../fake-data/fake-sync-data';
import { DesktopSignInScreen, formatLinkCode } from './desktop-sign-in-screen';
import { LinkCodeForm, type LinkCodeFormProps } from './link-code-form';
import { LinkedComputersTable } from './linked-computers-table';
import { UpdateBanner } from './update-banner';

function renderLinkCodeForm(overrides: Partial<LinkCodeFormProps>): LinkCodeFormProps {
  const props: LinkCodeFormProps = {
    characters: ['', '', '', '', '', ''], state: 'typing', computerText: 'LIVING-ROOM-PC · Windows 11', linkedComputerName: 'LIVING-ROOM-PC',
    onChangeCharacters: vi.fn(), onSubmitCode: vi.fn(), onLinkComputer: vi.fn(), onTryAgain: vi.fn(),
    ...overrides,
  };
  render(<LinkCodeForm {...props} />);
  return props;
}

describe('DesktopSignInScreen', () => {
  it('shows the code split like the six boxes, and spells it out for screen readers', () => {
    render(<DesktopSignInScreen signIn={{ kind: 'waiting-for-code', code: 'K7Q4ZP', expiresInText: '9:12', computerName: 'LIVING-ROOM-PC', systemName: 'Windows 11' }} onOpenLinkPage={vi.fn()} onGetNewCode={vi.fn()} onConnectGame={vi.fn()} />);
    expect(formatLinkCode('K7Q4ZP')).toBe('K7Q·4ZP');
    expect(screen.getByLabelText('Code K 7 Q 4 Z P').textContent).toBe('K7Q·4ZP');
    expect(screen.getByRole('status').textContent).toContain('Waiting for the code');
  });

  it('says GREAT once signed in and leads on to connecting the game', () => {
    const onConnectGame = vi.fn();
    render(<DesktopSignInScreen signIn={{ kind: 'signed-in', playerName: 'Noa', computerName: 'LIVING-ROOM-PC' }} onOpenLinkPage={vi.fn()} onGetNewCode={vi.fn()} onConnectGame={onConnectGame} />);
    expect(screen.getByText('GREAT')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: /Connect your game/ }));
    expect(onConnectGame).toHaveBeenCalledOnce();
  });
});

describe('LinkCodeForm', () => {
  it('fills the next box and sends the code once all six are typed', () => {
    const props = renderLinkCodeForm({ characters: ['K', '7', 'Q', '4', 'Z', ''] });
    fireEvent.change(screen.getByRole('textbox', { name: 'Character 6' }), { target: { value: 'p' } });
    expect(props.onChangeCharacters).toHaveBeenCalledWith(['K', '7', 'Q', '4', 'Z', 'P']);
    expect(props.onSubmitCode).toHaveBeenCalledWith('K7Q4ZP');
  });

  it('accepts a pasted code', () => {
    const props = renderLinkCodeForm({});
    fireEvent.paste(screen.getByRole('textbox', { name: 'Character 1' }), { clipboardData: { getData: () => 'k7q-4zp' } });
    expect(props.onSubmitCode).toHaveBeenCalledWith('K7Q4ZP');
  });

  it('shows MISS for a wrong code and GREAT with a question for a right one', () => {
    renderLinkCodeForm({ state: 'miss' });
    expect(screen.getByRole('alert').textContent).toContain('That code doesn\'t match.');
  });

  it('asks before linking the computer', () => {
    const props = renderLinkCodeForm({ state: 'great' });
    const question = screen.getByRole('region', { name: 'Link this computer to your library?' });
    fireEvent.click(within(question).getByRole('button', { name: 'Link this computer' }));
    expect(props.onLinkComputer).toHaveBeenCalledOnce();
  });
});

describe('LinkedComputersTable', () => {
  it('lists each computer and signs one out only after a confirm', () => {
    const onRemoveComputer = vi.fn();
    render(<LinkedComputersTable computers={FAKE_LINKED_COMPUTERS} onRemoveComputer={onRemoveComputer} />);
    expect(screen.getAllByRole('row')).toHaveLength(FAKE_LINKED_COMPUTERS.length + 1);
    expect(screen.getByText('Online')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove ARCADE-CAB' }));
    const confirm = screen.getByRole('group', { name: 'Sign ARCADE-CAB out?' });
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(onRemoveComputer).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    expect(onRemoveComputer).toHaveBeenCalledWith('arcade-cab');
  });
});

describe('UpdateBanner', () => {
  it('offers restart and later', () => {
    const onRestart = vi.fn();
    const onLater = vi.fn();
    render(<UpdateBanner version="1.3" onRestart={onRestart} onLater={onLater} />);
    expect(screen.getByRole('status').textContent).toContain('DanceDance Sync 1.3 is ready.');
    fireEvent.click(screen.getByRole('button', { name: 'Restart to update' }));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(onRestart).toHaveBeenCalledOnce();
    expect(onLater).toHaveBeenCalledOnce();
  });
});
