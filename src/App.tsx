import { useMemo } from 'react';
import { useRoute } from './router';
import { ToastProvider } from './toast';
import { StoreProvider } from './store';
import { AuthGate } from './auth';
import { demoBackend, isConfigured, isDemo, supabase, supabaseBackend } from './backend';
import TodayScreen from './screens/TodayScreen';
import TasksScreen from './screens/TasksScreen';
import ItemScreen from './screens/ItemScreen';
import RoutineScreen from './screens/RoutineScreen';
import RoutinesScreen from './screens/RoutinesScreen';
import AreasScreen from './screens/AreasScreen';
import AreaScreen from './screens/AreaScreen';
import ReturnsScreen from './screens/ReturnsScreen';
import AccountScreen from './screens/AccountScreen';
import NotConnected from './screens/NotConnected';
import { withOffline } from './offline';
import SyncBanner from './components/SyncBanner';
import type { Backend } from './backend';

/** The real app for a signed-in user, with offline support. */
function SignedInApp({ userId, real }: { userId: string; real: Backend }) {
  const backend = useMemo(() => withOffline(real, userId), [real, userId]);
  return (
    <StoreProvider backend={backend}>
      <SyncBanner />
      <Screens />
    </StoreProvider>
  );
}
import QuickAddHost from './components/QuickAdd';

function Screens() {
  return (
    <>
      <Page />
      <QuickAddHost />
    </>
  );
}

function Page() {
  const route = useRoute();
  switch (route.name) {
    case 'today': return <TodayScreen />;
    case 'tasks': return <TasksScreen />;
    case 'account': return <AccountScreen />;
    case 'routines': return <RoutinesScreen />;
    case 'areas': return <AreasScreen />;
    case 'area': return <AreaScreen key={route.id} id={route.id} />;
    case 'returns': return <ReturnsScreen />;
    case 'item': return <ItemScreen key={route.id} id={route.id} />;
    case 'routine': return <RoutineScreen key={route.id} id={route.id} />;
  }
}

export default function App() {
  const demo = useMemo(() => (isDemo ? demoBackend() : null), []);
  const real = useMemo(() => (supabase ? supabaseBackend(supabase) : null), []);

  let body;
  if (demo) {
    body = <StoreProvider backend={demo}><Screens /></StoreProvider>;
  } else if (!isConfigured || !real) {
    body = <NotConnected />;
  } else {
    body = (
      <AuthGate>
        {(session) => <SignedInApp key={session.user.id} userId={session.user.id} real={real} />}
      </AuthGate>
    );
  }

  return (
    <ToastProvider>
      <div className="app">
        {isDemo && <div className="demo-banner">Demo mode · nothing is saved</div>}
        {body}
      </div>
    </ToastProvider>
  );
}
