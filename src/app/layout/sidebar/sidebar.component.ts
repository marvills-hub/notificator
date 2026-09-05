import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { SystemConsoleComponent } from '../system-console/system-console.component';
import { GmailStateService } from '../../core/services/gmail-state.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, SystemConsoleComponent],
  templateUrl: './sidebar.component.html',
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  private readonly gmailState = inject(GmailStateService);

  readonly unreadCount = this.gmailState.unreadCount;
}
