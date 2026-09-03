import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyBQ75zn_4Wu3tH3cbq30dzTmybjzekpScU',
  authDomain: 'notificator-d6266.firebaseapp.com',
  projectId: 'notificator-d6266',
  storageBucket: 'notificator-d6266.firebasestorage.app',
  messagingSenderId: '430351293875',
  appId: '1:430351293875:web:cc2d10a053aaaafc9cbfc6',
  measurementId: 'G-GX0VPDWK2J',
};

export const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);

export const firestore = getFirestore(firebaseApp);
