import { Routes } from '@angular/router';

import { AppShellComponent } from './layout/app-shell/app-shell.component';

import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { InboxComponent } from './pages/inbox/inbox.component';
import { AccountsComponent } from './pages/accounts/accounts.component';
import { SettingsComponent } from './pages/settings/settings.component';
import { LoginComponent } from './pages/login/login.component';

import { FloatingNotificatorComponent } from './shared/floating-notificator/floating-notificator.component';
import { CriticalCallComponent } from './shared/critical-call/critical-call.component';

import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  {
    path: 'widget',
    component: FloatingNotificatorComponent,
  },
  {
    path: 'critical-call',
    component: CriticalCallComponent,
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },
  {
    path: '',
    component: AppShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: DashboardComponent,
      },
      {
        path: 'inbox',
        component: InboxComponent,
      },
      {
        path: 'accounts',
        component: AccountsComponent,
      },
      {
        path: 'settings',
        component: SettingsComponent,
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
