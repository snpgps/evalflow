
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAnalytics, type Analytics } from 'firebase/analytics';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

console.log("Firebase Config being used:", firebaseConfig);

let app: FirebaseApp;
let db: Firestore;
let analytics: Analytics | undefined;
let storage: FirebaseStorage;

try {
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
    console.log("Firebase app initialized successfully.");
  } else {
    app = getApps()[0];
    console.log("Firebase app already initialized.");
  }

  db = getFirestore(app);
  storage = getStorage(app); // Initialize storage
  console.log("Firestore and Storage initialized.");

  // Initialize Analytics only in the browser environment and if measurementId is available
  if (typeof window !== 'undefined' && firebaseConfig.measurementId) {
    analytics = getAnalytics(app);
    console.log("Firebase Analytics initialized.");
  } else if (typeof window !== 'undefined' && !firebaseConfig.measurementId) {
    console.log("Firebase Analytics not initialized: measurementId is missing.");
  }
} catch (error) {
  console.error("Error initializing Firebase:", error);
  // Propagate the error or handle it as needed for your app's startup.
  // For example, you might want to set a global error state.
}

export { app, db, analytics, storage };
