// firebaseConfig.js
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDjbKKZeqB_KweQTL3b1_ay_comP5WQm1A",
  authDomain: "booky-app-6b1bf.firebaseapp.com",
  projectId: "booky-app-6b1bf",
  storageBucket: "booky-app-6b1bf.firebasestorage.app",
  messagingSenderId: "222072348931",
  appId: "1:222072348931:web:b204b807c42651ad6cc936",
  measurementId: "G-CKCMF4GXZ9"
};

const app = initializeApp(firebaseConfig);

let auth;

// ✅ תמיכה גם ב-Web וגם במובייל
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
  console.log("Auth persistence: React Native mode ✅");
} catch (e) {
  auth = getAuth(app);
  console.log("Auth persistence: Web fallback ⚙️");
}

export { app, auth };
export const db = getFirestore(app);
export const firebaseAppConfig = firebaseConfig;
