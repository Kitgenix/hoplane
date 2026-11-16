import { useCallback, useEffect, useState } from 'react';
import { Redirect, Route, Router, Switch } from 'wouter';
import type { InstanceInfo } from '../shared/types';
import { Layout, useTheme } from './components/Layout';
import { Logo } from './components/Attribution';
import { ConfirmProvider, Spinner, ToastProvider } from './components/ui';
import { api, ApiError, setUnauthorizedHandler } from './lib/api';
import { SessionCtx, type Me } from './lib/hooks';
import { LoginPage, SetupPage } from './pages/Auth';
import { ImportExportPage } from './pages/ImportExport';
import { LinkDetailPage } from './pages/LinkDetail';
import { LinksPage } from './pages/Links';
import { OverviewPage } from './pages/Overview';
import { SettingsPage } from './pages/Settings';

type State = { status: 'loading' } | { status: 'anon'; instance: InstanceInfo | null } | { status: 'setup'; instance: InstanceInfo } | { status: 'ready'; instance: InstanceInfo; me: Me };

export function App() {
  useTheme();
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(async () => {
    let instance: InstanceInfo | null = null;
    try {
      instance = await api<InstanceInfo>('/instance');
      document.title = `Dashboard · ${instance.site_name}`;
      if (instance.setup_required) return setState({ status: 'setup', instance });
      const me = await api<Me>('/auth/me');
      setState({ status: 'ready', instance, me });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setState({ status: 'anon', instance });
      else setState({ status: 'anon', instance });
    }
  }, []);

  useEffect(() => {
    load();
    setUnauthorizedHandler(() => setState((s) => ({ status: 'anon', instance: 'instance' in s ? s.instance : null })));
  }, [load]);

  if (state.status === 'loading')
    return (
      <div className="grid h-full place-items-center">
        <div className="flex flex-col items-center gap-4">
          <Logo />
          <Spinner />
        </div>
      </div>
    );

  return (
    <ToastProvider>
      <ConfirmProvider>
        <Router base="/dashboard">
          {state.status === 'setup' ? (
            <SetupPage instance={state.instance} onDone={load} />
          ) : state.status === 'anon' ? (
            <Switch>
              <Route path="/login">
                <LoginPage instance={state.instance} onDone={load} />
              </Route>
              <Route>
                <Redirect to="/login" replace />
              </Route>
            </Switch>
          ) : (
            <SessionCtx.Provider
              value={{
                me: state.me,
                instance: state.instance,
                refresh: load,
                can: (s) => state.me.scopes.includes(s),
                isAdmin: state.me.role === 'owner' || state.me.role === 'admin',
              }}
            >
              <Layout>
                <Switch>
                  <Route path="/" component={OverviewPage} />
                  <Route path="/links" component={LinksPage} />
                  <Route path="/links/:id">{(p) => <LinkDetailPage id={p.id} />}</Route>
                  <Route path="/import" component={ImportExportPage} />
                  <Route path="/settings" component={SettingsPage} />
                  <Route path="/login">
                    <Redirect to="/" replace />
                  </Route>
                  <Route>
                    <Redirect to="/" replace />
                  </Route>
                </Switch>
              </Layout>
            </SessionCtx.Provider>
          )}
        </Router>
      </ConfirmProvider>
    </ToastProvider>
  );
}
