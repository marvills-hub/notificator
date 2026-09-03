import { Injectable, computed, signal } from '@angular/core';

import {
  User,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';

import { auth } from '../firebase/firebase.config';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly currentUserSignal = signal<User | null>(null);

  readonly currentUser = this.currentUserSignal.asReadonly();

  readonly isAuthenticated = computed(() => !!this.currentUserSignal());

  readonly loading = signal(true);

  constructor() {
    onAuthStateChanged(auth, (user) => {
      this.currentUserSignal.set(user);
      this.loading.set(false);
    });
  }

  async register(email: string, password: string, displayName: string): Promise<void> {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(credential.user, {
      displayName,
    });

    this.currentUserSignal.set(credential.user);
  }

  async login(email: string, password: string): Promise<void> {
    const credential = await signInWithEmailAndPassword(auth, email, password);

    this.currentUserSignal.set(credential.user);
  }

  async logout(): Promise<void> {
    await signOut(auth);

    this.currentUserSignal.set(null);
  }
}
