import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserData } from '../types';
import { identifyOneSignalUser, logoutOneSignalUser } from '../utils/onesignal';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: UserData | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  reloadUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);

  // Hardened Admin Role check using Firestore 'admin' collection and verified user role
  const verifyIsAdmin = async (username: string, email: string): Promise<boolean> => {
    try {
      // 1. Check doc in 'admin' collection with username
      const adminDocRef = doc(db, 'admin', username.toLowerCase());
      const adminDocSnap = await getDoc(adminDocRef);
      if (adminDocSnap.exists() && adminDocSnap.data()?.role === 'admin') {
        return true;
      }

      // 2. Check doc in 'admin' collection with email prefix
      const emailPrefix = email.split('@')[0].toLowerCase();
      if (emailPrefix && emailPrefix !== username.toLowerCase()) {
        const prefixDoc = await getDoc(doc(db, 'admin', emailPrefix));
        if (prefixDoc.exists() && prefixDoc.data()?.role === 'admin') {
          return true;
        }
      }

      return false;
    } catch (e) {
      console.warn("Admin verification check warning:", e);
      return false;
    }
  };

  const fetchUserData = async (uid: string, firebaseUser?: FirebaseUser) => {
    try {
      const docRef = doc(db, 'users', uid);
      const docSnap = await getDoc(docRef);
      const userEmail = (firebaseUser?.email || currentUser?.email || '').toLowerCase();
      const baseUsername = userEmail.split('@')[0] || 'user';

      if (docSnap.exists()) {
        const data = docSnap.data();
        let activeRole = data.role || 'deacon';

        // Verify if user is declared in 'admin' collection
        const isAdminInFirestore = await verifyIsAdmin(data.username || baseUsername, userEmail);
        if (isAdminInFirestore && activeRole !== 'admin') {
          await updateDoc(docRef, { role: 'admin' });
          activeRole = 'admin';
        }

        setUserData({ id: docSnap.id, ...data, role: activeRole } as UserData);
      } else {
        // Document with Auth UID not found. Let's check if there is an existing doc with matching username
        let existingDoc: any = null;
        try {
          const q = query(collection(db, 'users'), where('username', '==', baseUsername));
          const querySnap = await getDocs(q);
          if (!querySnap.empty) {
            existingDoc = querySnap.docs[0];
          }
        } catch (e) {
          console.warn("Could not query existing username:", e);
        }

        const isAdmin = await verifyIsAdmin(baseUsername, userEmail);

        if (existingDoc) {
          const exData = existingDoc.data();
          const roleToSet = isAdmin ? 'admin' : (exData.role || 'deacon');
          const newProfile = {
            ...exData,
            role: roleToSet,
            email: userEmail,
            isFirstLogin: false
          };
          await setDoc(docRef, newProfile);
          setUserData({ id: uid, ...newProfile } as UserData);
        } else {
          // Check if system is completely empty (first initialization)
          let shouldBeAdmin = isAdmin;
          try {
            const allUsersSnap = await getDocs(collection(db, 'users'));
            if (allUsersSnap.empty) {
              shouldBeAdmin = true;
              // Also bootstrap the admin doc
              await setDoc(doc(db, 'admin', baseUsername), { role: 'admin', createdAt: new Date().toISOString() });
            }
          } catch (e) {
            console.warn("Initial admin bootstrap notice:", e);
          }

          const defaultProfile = {
            username: baseUsername,
            role: shouldBeAdmin ? 'admin' : 'deacon',
            fullName: firebaseUser?.displayName || baseUsername || (shouldBeAdmin ? 'مدير النظام' : 'شماس'),
            email: userEmail,
            createdAt: new Date().toISOString(),
            isFirstLogin: false,
            photoUrl: firebaseUser?.photoURL || '',
            ownPhone: '01000000000',
            parentPhone: '',
            grade: '',
            areaId: '',
            teamId: '',
            assignedAssistantId: ''
          };

          await setDoc(docRef, defaultProfile);
          setUserData({ id: uid, ...defaultProfile } as UserData);
        }
      }
    } catch (error) {
      console.error("Error fetching or initializing user data:", error);
      // Secure fallback
      setUserData({
        id: uid,
        username: 'deacon',
        role: 'deacon',
        fullName: 'شماس',
        createdAt: new Date().toISOString(),
        isFirstLogin: false
      } as UserData);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      setCurrentUser(user);
      if (user) {
        await fetchUserData(user.uid, user);
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (usernameOrEmail: string, password: string) => {
    const trimmed = usernameOrEmail.trim();
    const email = trimmed.includes('@') ? trimmed : `${trimmed}@deacons-app.local`;
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setCurrentUser(userCredential.user);
      await fetchUserData(userCredential.user.uid, userCredential.user);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userData?.id) {
      identifyOneSignalUser(userData);
    }
  }, [userData?.id]);

  const logout = async () => {
    setLoading(true);
    await logoutOneSignalUser();
    await signOut(auth);
    setCurrentUser(null);
    setUserData(null);
    setLoading(false);
  };

  const reloadUserData = async () => {
    if (currentUser) {
      await fetchUserData(currentUser.uid);
    }
  };

  return (
    <AuthContext.Provider value={{ currentUser, userData, loading, login, logout, reloadUserData }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
