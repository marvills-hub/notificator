import { Injectable } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';

@Injectable({
  providedIn: 'root',
})
export class RuntimePlatformService {
  readonly isTauri = isTauri();

  readonly isBrowser = !this.isTauri;
}
