// Tiny page switcher using the part of the address after "#",
// so the phone's back button works.
import { useEffect, useState } from 'react';

export type Route =
  | { name: 'today' }
  | { name: 'tasks' }
  | { name: 'routines' }
  | { name: 'areas' }
  | { name: 'returns' }
  | { name: 'income' }
  | { name: 'steps' }
  | { name: 'reset' }
  | { name: 'area'; id: string; tab?: string }
  | { name: 'account' }
  | { name: 'item'; id: string }
  | { name: 'routine'; id: string };

function parse(hash: string): Route {
  const [page, arg, sub] = hash.replace(/^#\/?/, '').split('/');
  if (page === 'tasks') return { name: 'tasks' };
  if (page === 'account') return { name: 'account' };
  if (page === 'routines') return { name: 'routines' };
  if (page === 'areas') return { name: 'areas' };
  if (page === 'returns') return { name: 'returns' };
  if (page === 'steps') return { name: 'steps' };
  if (page === 'reset') return { name: 'reset' };
  if (page === 'income' || page === 'money') return { name: 'income' };
  if (page === 'area' && arg) return { name: 'area', id: arg, tab: sub };
  if (page === 'item' && arg) return { name: 'item', id: arg };
  if (page === 'routine' && arg) return { name: 'routine', id: arg };
  return { name: 'today' };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parse(location.hash));
      window.scrollTo(0, 0);
    };
    addEventListener('hashchange', onChange);
    addEventListener('popstate', onChange);
    addEventListener('ld:navigate', onChange);
    return () => {
      removeEventListener('hashchange', onChange);
      removeEventListener('popstate', onChange);
      removeEventListener('ld:navigate', onChange);
    };
  }, []);
  return route;
}

/** Open a page inside the app. `replace` swaps the current page instead of stacking (used for tabs). */
export function go(path: string, replace = false) {
  const keep = location.search; // keeps ?demo
  if (replace) history.replaceState(history.state, '', keep + '#' + path);
  else history.pushState({ inApp: true }, '', keep + '#' + path);
  dispatchEvent(new Event('ld:navigate'));
}

/** Go back if we came from inside the app, otherwise go to Today. */
export function back() {
  if (history.state?.inApp) history.back();
  else go('/', true);
}
