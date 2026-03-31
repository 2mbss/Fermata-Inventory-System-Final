import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { User as UserType } from '../types';

interface FirebaseContextType {
  user: User | null;
  userData: UserType | null;
  loading: boolean;
  login: () => Promise<void>;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
}

const FirebaseContext = createContext<FirebaseContextType | undefined>(undefined);

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userData, setUserData] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch or create user document
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          setUserData(userSnap.data() as UserType);
        } else {
          // Create default user profile for first-time login
          // We use the email from the runtime context as the master admin
          const masterAdminEmail = 'jamescamarines28@gmail.com';
          const isMasterAdmin = currentUser.email === masterAdminEmail;

          const defaultUser: UserType = {
            id: currentUser.uid,
            email: currentUser.email || '',
            name: currentUser.displayName || (isMasterAdmin ? 'Master Admin' : 'Staff Member'),
            role: isMasterAdmin ? 'Super Admin' : 'Branch Staff',
            branch: 'Imus', // Default branch
            permissions: isMasterAdmin ? ['all'] : ['pos', 'inventory'],
            active: true
          };
          await setDoc(userRef, defaultUser);
          setUserData(defaultUser);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  const loginWithEmail = async (email: string, pass: string) => {
    const { signInWithEmailAndPassword } = await import('firebase/auth');
    await signInWithEmailAndPassword(auth, email, pass);
  };

  const logout = async () => {
    await signOut(auth);
  };

  return (
    <FirebaseContext.Provider value={{ user, userData, loading, login, loginWithEmail, logout }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}
