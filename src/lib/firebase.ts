import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getMessaging } from "firebase/messaging";
import { getAnalytics } from "firebase/analytics";

export const firebaseConfig = {
  apiKey: "AIzaSyBCuDXcwIpxHJ_bwkYyahSroJWOIXLz3bc",
  authDomain: "stmarydiacons.firebaseapp.com",
  projectId: "stmarydiacons",
  storageBucket: "stmarydiacons.firebasestorage.app",
  messagingSenderId: "211834403090",
  appId: "1:211834403090:web:eed94db35a69bb1892dbcb",
  measurementId: "G-XVRB59WXLN"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// explicitly try to set local persistence to fix login loops on mobile browsers/webviews
setPersistence(auth, browserLocalPersistence).catch(() => {
  setPersistence(auth, browserSessionPersistence).catch(console.error);
});

export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);

// Only initialize messaging if supported in the browser
export let messaging = null;
if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  try {
    messaging = getMessaging(app);
  } catch (error) {
    console.error("Firebase Messaging not supported", error);
  }
}
