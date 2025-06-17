
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getAuth, type Auth } from 'firebase/auth'; // Import getAuth and Auth
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

// Check for missing essential config values
const essentialKeys: (keyof typeof firebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'appId'];
const missingKeys = essentialKeys.filter(key => !firebaseConfig[key]);

if (missingKeys.length > 0) {
  console.error(`ERROR: Firebase configuration is missing essential keys: ${missingKeys.join(', ')}. Please check your .env.local or environment variables.`);
  console.error("Firebase Config Object with missing values:", firebaseConfig);
} else {
  console.log("Firebase Config being used (all essential keys present):", firebaseConfig);
}


let app: FirebaseApp;
let db: Firestore;
let auth: Auth; // Declare auth
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
  auth = getAuth(app); // Initialize auth
  storage = getStorage(app);
  
  if (db && db.app) {
    console.log(`Firestore initialized and associated with project: ${db.app.options.projectId}`);
  } else {
    console.error("Firestore (db) object appears uninitialized or not correctly associated with an app after getFirestore(app).");
  }


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

export { app, db, auth, analytics, storage }; // Export auth

