import type { ReactNode } from 'react';
import { back } from '../router';
import { BackArrow, Close, Plus } from '../icons';
import { openQuickAdd } from './QuickAdd';

export default function Header({ title, close = false, right }: { title: string; close?: boolean; right?: ReactNode }) {
  return (
    <header className="topbar">
      <button type="button" className="round-btn" onClick={back} aria-label={close ? 'Close' : 'Back'}>
        {close ? <Close /> : <BackArrow />}
      </button>
      <h1 className="bar-title">{title}</h1>
      <span className="bar-right">
        {right ?? (!close && (
          <button type="button" className="round-btn small-plus" onClick={() => openQuickAdd()} aria-label="Quick add">
            <Plus />
          </button>
        ))}
      </span>
    </header>
  );
}
