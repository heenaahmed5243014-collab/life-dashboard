import type { ReactNode } from 'react';
import { back } from '../router';
import { BackArrow, Close } from '../icons';

export default function Header({ title, close = false, right }: { title: string; close?: boolean; right?: ReactNode }) {
  return (
    <header className="bar">
      <button type="button" className="round-btn" onClick={back} aria-label={close ? 'Close' : 'Back'}>
        {close ? <Close /> : <BackArrow />}
      </button>
      <h1 className="bar-title">{title}</h1>
      <span className="bar-right">{right}</span>
    </header>
  );
}
