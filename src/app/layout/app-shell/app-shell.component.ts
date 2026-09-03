import { Component, OnDestroy, OnInit } from '@angular/core';

import { RouterOutlet } from '@angular/router';
import { getCurrentWindow } from '@tauri-apps/api/window';

import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, TopbarComponent],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit, OnDestroy {
  private unlistenClose?: () => void;

  async ngOnInit(): Promise<void> {
    try {
      const currentWindow = getCurrentWindow();

      this.unlistenClose = await currentWindow.onCloseRequested(async (event) => {
        event.preventDefault();

        await currentWindow.hide();
      });
    } catch {
      // Running in a normal browser during Angular development.
    }
  }

  ngOnDestroy(): void {
    this.unlistenClose?.();
  }
}
