import { useRef, type ClipboardEvent, type KeyboardEvent, type ReactElement } from 'react';
import { Icon } from '../icons/icon';
import { DialogHeading } from '../dialog/dialog-heading';
import { JudgmentText } from '../progress/judgment-flash';
import { joinClassNames } from '../shared/class-names';
import type { LinkCodeState } from '../sync-ui-types';

export const LINK_CODE_LENGTH = 6;

export interface LinkCodeFormProps {
  /** Six characters, '' where nothing is typed yet. */
  characters: readonly string[];
  state: LinkCodeState;
  /** For example "LIVING-ROOM-PC · Windows 11 · DanceDance Sync 1.2". */
  computerText: string | null;
  linkedComputerName: string | null;
  onChangeCharacters: (characters: string[]) => void;
  onSubmitCode: (code: string) => void;
  onLinkComputer: () => void;
  onTryAgain: () => void;
}

/** Website side of "sign in by code": six boxes, then MISS or GREAT in the game's words. */
export function LinkCodeForm(props: LinkCodeFormProps): ReactElement {
  const boxesRef = useRef<HTMLDivElement>(null);
  const focusBox = (index: number): void => { boxesRef.current?.querySelectorAll('input')[index]?.focus(); };
  const setCharacter = ({ index, character }: { index: number; character: string }): void => {
    const characters = Array.from({ length: LINK_CODE_LENGTH }, (_, boxIndex) => props.characters[boxIndex] ?? '');
    characters[index] = character.toUpperCase();
    props.onChangeCharacters(characters);
    if (character !== '' && index < LINK_CODE_LENGTH - 1) focusBox(index + 1);
    const code = characters.join('');
    if (code.length === LINK_CODE_LENGTH) props.onSubmitCode(code);
  };
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>): void => {
    const pastedCode = event.clipboardData.getData('text').replace(/[^0-9a-z]/gi, '').toUpperCase().slice(0, LINK_CODE_LENGTH);
    if (pastedCode.length !== LINK_CODE_LENGTH) return;
    event.preventDefault();
    props.onChangeCharacters(pastedCode.split(''));
    props.onSubmitCode(pastedCode);
  };
  const handleKeyDown = ({ event, index }: { event: KeyboardEvent<HTMLInputElement>; index: number }): void => {
    if (event.key === 'Backspace' && (props.characters[index] ?? '') === '' && index > 0) focusBox(index - 1);
  };
  return (
    <div className="sv-sync-link-code">
      <DialogHeading titleId="sv-sync-link-code-heading" title="Type the code from the app" stepText="Link a computer" />
      <div ref={boxesRef} className={joinClassNames('sv-sync-code-boxes', props.state === 'miss' && 'sv-sync-code-boxes--miss', (props.state === 'great' || props.state === 'linked') && 'sv-sync-code-boxes--great')} role="group" aria-labelledby="sv-sync-link-code-heading">
        {Array.from({ length: LINK_CODE_LENGTH }, (_, index) => (
          <span key={index} className="sv-sync-code-box-wrap">
            {index === LINK_CODE_LENGTH / 2 && <span className="sv-sync-code-separator" aria-hidden="true">·</span>}
            <input className="sv-sync-code-box" maxLength={1} autoComplete="off" aria-label={`Character ${String(index + 1)}`} value={props.characters[index] ?? ''} onChange={(event) => { setCharacter({ index, character: event.target.value.slice(-1) }); }} onKeyDown={(event) => { handleKeyDown({ event, index }); }} onPaste={handlePaste} />
          </span>
        ))}
      </div>
      <p className="sv-sync-small sv-sync-muted">Only link computers you own. Codes work for 10 minutes.</p>
      <LinkCodeResult {...props} />
    </div>
  );
}

function LinkCodeResult(props: LinkCodeFormProps): ReactElement | null {
  if (props.state === 'miss') {
    return (
      <div className="sv-sync-link-result sv-sync-link-result--miss" role="alert">
        <JudgmentText word="MISS" size="medium" />
        <b className="sv-sync-strong">That code doesn&apos;t match.</b>
        <span className="sv-sync-small">Check the code in the app. Expired? Choose “Get a new code” there.</span>
        <button className="sv-sync-button sv-sync-button--ghost sv-sync-button--small sv-sync-align-start" type="button" onClick={props.onTryAgain}>Try again</button>
      </div>
    );
  }
  if (props.state === 'great') {
    return (
      <div className="sv-sync-link-result sv-sync-link-result--great" role="region" aria-labelledby="sv-sync-link-question">
        <JudgmentText word="GREAT" size="medium" />
        <h3 id="sv-sync-link-question" className="sv-sync-heading-3">Link this computer to your library?</h3>
        {props.computerText !== null && <div className="sv-sync-computer-box"><Icon name="computer" /> {props.computerText}</div>}
        <span className="sv-sync-small sv-sync-text">It syncs your library into its game. Remove it any time in Account settings.</span>
        <div className="sv-sync-row">
          <button className="sv-sync-button sv-sync-button--go" type="button" onClick={props.onLinkComputer}>Link this computer</button>
          <button className="sv-sync-button sv-sync-button--ghost" type="button" onClick={props.onTryAgain}>Cancel</button>
        </div>
      </div>
    );
  }
  if (props.state === 'linked') {
    return (
      <div className="sv-sync-link-result sv-sync-link-result--great" role="status">
        <b className="sv-sync-strong sv-sync-row"><Icon name="check" strokeWidth={3} /> {props.linkedComputerName ?? 'This computer'} is linked.</b>
        <span className="sv-sync-small sv-sync-text">The app signs in by itself. You can close this tab.</span>
      </div>
    );
  }
  return null;
}
