import { Component } from '@angular/core';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';

@Component({
  selector: 'app-floating-notificator',
  standalone: true,
  templateUrl: './floating-notificator.component.html',
  styleUrl: './floating-notificator.component.scss',
})
export class FloatingNotificatorComponent {
  private startX = 0;
  private startY = 0;
  private dragging = false;

  onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }

    this.startX = event.screenX;
    this.startY = event.screenY;
    this.dragging = false;
  }

  async onMouseMove(event: MouseEvent): Promise<void> {
    if ((event.buttons & 1) === 0 || this.dragging) {
      return;
    }

    const distanceX = Math.abs(event.screenX - this.startX);
    const distanceY = Math.abs(event.screenY - this.startY);

    // Only start dragging after the mouse actually moves.
    if (distanceX > 4 || distanceY > 4) {
      this.dragging = true;

      try {
        await getCurrentWindow().startDragging();
      } catch (error) {
        console.error('Unable to drag floating window:', error);
      }
    }
  }

  async toggle(): Promise<void> {
    if (this.dragging) {
      this.dragging = false;
      return;
    }

    try {
      const mainWindow = await WebviewWindow.getByLabel('main');

      if (!mainWindow) {
        return;
      }

      const isVisible = await mainWindow.isVisible();

      if (isVisible) {
        await mainWindow.hide();
        return;
      }

      await mainWindow.show();
      await mainWindow.unminimize();
      await mainWindow.setFocus();
    } catch (error) {
      console.error('Unable to toggle Notificator:', error);
    }
  }
}
