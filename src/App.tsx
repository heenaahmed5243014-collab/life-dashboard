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
import AddScreen from './screens/AddScreen';
import AccountScreen from './screens/AccountScreen';
import NotConnected from './screens/NotConnected';

function Screens() {
  const route = useRoute();
  switch (route.name) {
    case 'today': return <TodayScreen />;
    case 'tasks': return <TasksScreen />;
    case 'account': return <AccountScreen />;
    case 'add': return <AddScreen key={route.domainId ?? ''} presetDomain={route.domainId} />;
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
        {(session) => <StoreProvider key={session.user.id} backend={real}><Screens /></StoreProvider>}
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
