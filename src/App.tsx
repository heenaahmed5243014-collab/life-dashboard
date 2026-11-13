import { lazy, Suspense, useEffect, useMemo } from 'react';
import { useRoute } from './router';
import { ToastProvider } from './toast';
import { StoreProvider } from './store';
import { AuthGate } from './auth';
import { demoBackend, isConfigured, isDemo, supabase, supabaseBackend } from './backend';
import TodayScreen from './screens/TodayScreen';
import TasksScreen from './screens/TasksScreen';
import ItemScreen from './screens/ItemScreen';
const RoutineScreen = lazy(() => import('./screens/RoutineScreen'));
import RoutinesScreen from './screens/RoutinesScreen';
import AreasScreen from './screens/AreasScreen';
const AreaScreen = lazy(() => import('./screens/AreaScreen'));
const ReturnsScreen = lazy(() => import('./screens/ReturnsScreen'));
const StepsScreen = lazy(() => import('./screens/StepsScreen'));
const ResetScreen = lazy(() => import('./screens/ResetScreen'));
const WeightRewardsScreen = lazy(() => import('./screens/WeightRewardsScreen'));
const IncomeScreen = lazy(() => import('./screens/IncomeScreen'));
const AccountScreen = lazy(() => import('./screens/AccountScreen'));

/** After Today is on screen, fetch the other screens quietly so they open instantly and work offline. */
const warmUp = () => { void import('./screens/RoutineScreen'); void import('./screens/AreaScreen'); void import('./screens/ReturnsScreen'); void import('./screens/StepsScreen'); void import('./screens/ResetScreen'); void import('./screens/WeightRewardsScreen'); void import('./screens/IncomeScreen'); void import('./screens/AccountScreen'); };
if (typeof window !== 'undefined') addEventListener('load', () => setTimeout(warmUp, 2500), { once: true });
import NotConnected from './screens/NotConnected';
import { withOffline } from './offline';
import SyncBanner from './components/SyncBanner';
import WorkModeBar from './components/WorkModeBar';
import DynamicIsland from './components/DynamicIsland';
import HiddenScreen from './screens/HiddenScreen';
import { useWorkMode } from './workmode';
import type { Backend } from './backend';

/** The real app for a signed-in user, with offline support. */
function SignedInApp({ userId, real }: { userId: string; real: Backend }) {
  const backend = useMemo(() => withOffline(real, userId), [real, userId]);
  useEffect(() => { void syncPin(); }, [userId]);
  return (
    <StoreProvider backend={backend}>
      <SyncBanner />
      <Screens />
    </StoreProvider>
  );
}
import { PinGate, syncPin } from './pin';
import Nav from './components/Nav';
import Header from './components/Header';
import QuickAddHost from './components/QuickAdd';

function Screens() {
  return (
    <>
      <WorkModeBar />
      <DynamicIsland />
      <Suspense fallback={<main className="page loading-page" aria-busy="true"><span className="loading-dot" aria-label="Loading" /></main>}>
        <Page />
      </Suspense>
      <QuickAddHost />
    </>
  );
}

function Page() {
  const route = useRoute();
  const work = useWorkMode();
  if (work.active && (route.name === 'income' || route.name === 'returns' || route.name === 'steps' || route.name === 'rewards')) return <HiddenScreen />;
  switch (route.name) {
    case 'today': return <TodayScreen />;
    case 'tasks': return <TasksScreen />;
    case 'account': return <AccountScreen />;
    case 'routines': return <RoutinesScreen />;
    case 'areas': return <AreasScreen />;
    case 'area': return <AreaScreen key={route.id + (route.tab ?? '')} id={route.id} tab={route.tab} />;
    case 'returns': return <PinGate after={<Header title="" />}><ReturnsScreen /></PinGate>;
    case 'income': return <PinGate after={<Nav current="income" />}><IncomeScreen /></PinGate>;
    case 'steps': return <StepsScreen />;
    case 'reset': return <ResetScreen />;
    case 'rewards': return <WeightRewardsScreen />;
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
