import { useState, useEffect, createContext, useContext, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithCustomToken,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import type { User, Auth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  onSnapshot,
  serverTimestamp,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

// Import Recharts components
import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Line
} from 'recharts';

// --- Global Variable Declarations for Canvas Environment ---
declare const __app_id: string | undefined;
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;

// --- Firebase Configuration and Initialization ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

const firebaseConfigRaw = typeof __firebase_config !== 'undefined' ? __firebase_config : '{"apiKey": "AIzaSyCjjrUEhfPiWgj_ErXBnqva9o8vs8am9tg", "authDomain": "spenditure-f7819.firebaseapp.com", "projectId": "spenditure-f7819", "storageBucket": "spenditure-f7819.firebase-app.com", "messagingSenderId": "912399104178", "appId": "1:912399104178:web:57adc5279811477fd6731ab", "measurementId": "G-0LPD65KQFG"}';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  const firebaseConfig = JSON.parse(firebaseConfigRaw);
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e: unknown) {
  console.error("Failed to initialize Firebase:", e);
  let errorMessage = "An unknown error occurred during Firebase initialization.";
  if (e instanceof Error) {
    errorMessage = `Firebase Initialization Error: ${e.message}`;
  }
}

const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- TypeScript Interfaces for Data Structures ---
interface BankAccount {
  id: string;
  bankName: string;
  fullName: string;
  last4Digits: string;
  expirationDate?: string;
  amount: number;
  createdAt?: Timestamp | Date;
  lastUpdated?: Timestamp | Date;
}

interface IncomeEntry {
  id: string;
  businessName: string;
  industry: string;
  incomeAmount: number;
  incomeDate: Date | Timestamp;
  createdAt?: Timestamp | Date;
  lastUpdated?: Timestamp | Date;
}

interface ExpenseEntry {
  id: string;
  name: string;
  category: string;
  expenseAmount: number;
  expenseDate: Date | Timestamp;
  createdAt?: Timestamp | Date;
  lastUpdated?: Timestamp | Date;
}

interface SalaryDetails {
  salary: number;
  frequency: 'Weekly' | 'Fortnightly' | 'Monthly';
  paydaySpecific: string;
  dayOffInMonth: '1' | '2';
  sss: number;
  philhealth: number;
  pagibig: number;
  tax: number;
  loans: number;
  voluntary: number;
  lastUpdated?: Date | Timestamp;
}

interface UserProfile {
  name: string;
  email: string;
  phoneNumber?: string;
  receiveEmailNotifications: boolean;
  receivePhoneNotifications: boolean;
  createdAt?: Timestamp | Date;
  lastUpdated?: Timestamp | Date;
}

interface AuthContextType {
  user: User | null;
  handleLogout: () => Promise<void>;
  db: Firestore | null;
  appId: string;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  totalBankBalance: number;
  totalIncome: number;
  totalExpenses: number;
  salaryDetails: SalaryDetails | null;
  upcomingIncome: number;
  monthlyNetCashFlow: number;
}


// --- Context for Authentication and Firebase instances ---
const AuthContext = createContext<AuthContextType | null>(null);

// Custom Hook to use AuthContext
const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthContext.Provider');
  }
  return context;
};

// --- Components ---

/**
 * LoadingSpinner Component
 */
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-purple-500"></div>
  </div>
);

/**
 * FullPageSpinnerOverlay Component
 */
const FullPageSpinnerOverlay = () => (
  <div className="fixed inset-0 flex justify-center items-center z-[1000]" style={{ backgroundColor: 'rgba(0, 0, 0, 0.75)' }}>
    <LoadingSpinner />
  </div>
);


/**
 * MessageBox Component
 */
const MessageBox = ({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) => {
  if (!message) return null;

  let bgColor = '';
  let textColor = '';
  switch (type) {
    case 'success':
      bgColor = 'bg-green-100';
      textColor = 'text-green-800';
      break;
    case 'error':
      bgColor = 'bg-red-100';
      textColor = 'text-red-800';
      break;
    case 'info':
    default:
      bgColor = 'bg-blue-100';
      textColor = 'text-blue-800';
      break;
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className={`relative ${bgColor} rounded-lg shadow-xl p-6 max-w-sm w-full border border-gray-200`}>
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl font-bold"
          aria-label="Close"
        >
          &times;
        </button>
        <p className={`text-center font-semibold ${textColor}`}>{message}</p>
      </div>
    </div>
  );
};


/**
 * Auth Component
 */
const Auth = () => {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  if (!auth || !db) {
    return <MessageBox message="Firebase is not initialized. Please check console for errors." type="error" onClose={() => {}} />;
  }

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage('');

    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
        setMessageType('success');
        setMessage('Login successful!');
      } else {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        if (userCredential.user) {
          await updateProfile(userCredential.user, { displayName: name });

          const userDocRef = doc(db, `artifacts/${appId}/users/${userCredential.user.uid}/profile/details`);
          const initialProfileData: UserProfile = {
            name: name,
            email: email,
            phoneNumber: '',
            receiveEmailNotifications: true,
            receivePhoneNotifications: false,
            createdAt: serverTimestamp(),
          };
          await setDoc(userDocRef, initialProfileData);
        }

        setMessageType('success');
        setMessage('Sign-up successful! You are now logged in.');
      }
    } catch (error: unknown) {
      setMessageType('error');
      let errorMessage = 'An unknown error occurred.';
      if (error instanceof Error) {
        const firebaseErrorCode = (error as { code?: string }).code;
        if (firebaseErrorCode === 'auth/email-already-in-use') {
          errorMessage = 'Email already in use. Try logging in or use a different email.';
        } else if (firebaseErrorCode === 'auth/invalid-email') {
          errorMessage = 'Invalid email address.';
        } else if (firebaseErrorCode === 'auth/weak-password') {
          errorMessage = 'Password should be at least 6 characters.';
        } else if (firebaseErrorCode === 'auth/user-not-found' || firebaseErrorCode === 'auth/wrong-password') {
          errorMessage = 'Invalid email or password.';
        } else if (firebaseErrorCode === 'auth/operation-not-allowed') {
          errorMessage = 'Email/Password authentication is not enabled. Please enable it in your Firebase project settings (Authentication > Sign-in method).';
        } else if (firebaseErrorCode === 'auth/admin-restricted-operation') {
          errorMessage = 'Admin restricted operation. This typically means the authentication method is not enabled in your Firebase project settings (Authentication > Sign-in method).';
        }
        else {
          errorMessage = error.message;
        }
      }
      setMessage(errorMessage);
      console.error('Auth Error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const closeMessageBox = () => {
    setMessage('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-r from-purple-500 to-indigo-600 p-4">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-md border-b-4 border-indigo-700">
        <h2 className="text-3xl font-extrabold text-center text-gray-800 mb-6">
          {isLoginMode ? 'Login' : 'Sign Up'}
        </h2>
        <form onSubmit={handleAuth} className="space-y-5">
          {!isLoginMode && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                Full Name
              </label>
              <input
                type="text"
                id="name"
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required={!isLoginMode}
              />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              id="password"
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500 transition duration-150 ease-in-out"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition duration-300 ease-in-out transform hover:scale-105"
            disabled={isLoading}
          >
            {isLoading ? <LoadingSpinner /> : (isLoginMode ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="mt-6 text-center text-gray-600">
          {isLoginMode ? "Don't have an account?" : "Already have an account?"}{' '}
          <button
            onClick={() => setIsLoginMode(!isLoginMode)}
            className="text-purple-600 hover:text-purple-800 font-medium transition duration-150 ease-in-out"
            disabled={isLoading}
          >
            {isLoginMode ? 'Sign Up' : 'Login'}
          </button>
        </p>
      </div>
    </div>
  );
};

/**
 * Sidebar Component
 */
const Sidebar = ({ isOpen, onClose, setCurrentPage, user, handleLogout }: {
  isOpen: boolean;
  onClose: () => void;
  setCurrentPage: (page: string) => void;
  user: User | null;
  handleLogout: () => Promise<void>;
}) => {
  const sidebarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target as Node) && isOpen) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const userName = user?.displayName || user?.email || 'Guest';

  const navItems = [
    { name: 'Dashboard', page: 'dashboard' },
    { name: 'Banks', page: 'banks' },
    { name: 'Incomes', page: 'incomes' },
    { name: 'Salary', page: 'salary' },
    { name: 'Expenses', page: 'expenses' },
    { name: 'Profile', page: 'profile' },
    { name: 'History', page: 'history' },
  ];

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 animate-fade-in"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.25)' }}
          onClick={onClose}
        ></div>
      )}

      {/* Sidebar */}
      <div
        ref={sidebarRef}
        className={`fixed inset-y-0 left-0 w-64 bg-gray-800 text-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-4 flex flex-col h-full">
          {/* Header */}
          <div className="flex justify-between items-center pb-4 border-b border-gray-700 mb-4">
            <div className="flex items-center space-x-2">
              {/* Updated logo source to use a generic LOGO placeholder image */}
              <img src="https://placehold.co/100x40/6b46c1/ffffff?text=LOGO" alt="Spendt Logo" className="h-8 w-auto rounded-md" onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.onerror = null; // Prevent infinite loop if fallback also fails
                target.src = "https://placehold.co/40x40/6b46c1/ffffff?text=LOGO"; // Fallback placeholder
              }} />
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white transition duration-200">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="flex-grow">
            <ul className="space-y-2">
              {navItems.map((item) => (
                <li key={item.page}>
                  <button
                    onClick={() => { setCurrentPage(item.page); onClose(); }}
                    className="w-full text-left px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-700 transition duration-300 ease-in-out"
                  >
                    {item.name}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* User Info and Logout at bottom */}
          <div className="mt-auto pt-4 border-t border-gray-700">
            <p className="text-gray-400 text-sm mb-2">Logged in as:</p>
            <span className="block text-white text-md font-semibold mb-3">{userName}</span>
            <button
              onClick={() => { handleLogout(); onClose(); }}
              className="w-full bg-purple-600 text-white py-2 px-4 rounded-md text-sm font-medium hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
};


/**
 * Navbar Component
 */
const Navbar = ({ toggleSidebar, user }: { toggleSidebar: () => void; user: User | null }) => {
  return (
    <nav className="bg-gray-800 p-4 shadow-lg flex justify-between items-center relative z-30"> {/* Increased z-index */}
      <div className="flex items-center space-x-3">
        <button onClick={toggleSidebar} className="text-white focus:outline-none focus:ring-2 focus:ring-gray-600 rounded-md">
          <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {/* Updated logo source to use a generic LOGO placeholder image for desktop */}
        <img src="https://placehold.co/100x40/6b46c1/ffffff?text=LOGO" alt="Spendt Logo" className="h-8 w-auto hidden sm:block rounded-md" onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.onerror = null; // Prevent infinite loop if fallback also fails
          target.src = "https://placehold.co/40x40/6b46c1/ffffff?text=LOGO"; // Fallback placeholder
        }} />
      </div>
      {/* Updated logo source to use a generic LOGO placeholder image for mobile */}
      <img src="https://placehold.co/100x40/6b46c1/ffffff?text=LOGO" alt="Spendt Logo" className="h-8 w-auto sm:hidden rounded-md" onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.onerror = null; // Prevent infinite loop if fallback also fails
          target.src = "https://placehold.co/40x40/6b46c1/ffffff?text=LOGO"; // Fallback placeholder
      }}/>
    </nav>
  );
};

/**
 * PageLayout Component
 */
const PageLayout = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="container mx-auto p-6 bg-white rounded-lg shadow-md my-6 border-b-2 border-purple-500">
    <h1 className="text-3xl font-extrabold text-gray-800 mb-6 border-b pb-3">{title}</h1>
    {children}
  </div>
);

/**
 * Dashboard Page Component
 */
const Dashboard = () => {
  const { user, totalBankBalance, totalIncome, totalExpenses, salaryDetails, upcomingIncome, monthlyNetCashFlow } = useAuth();

  const forecastData = [];
  let currentProjectedBalance = totalBankBalance;
  forecastData.push({ name: 'Current', Balance: parseFloat(totalBankBalance.toFixed(2)) });

  for (let i = 1; i <= 6; i++) {
    currentProjectedBalance += monthlyNetCashFlow;
    forecastData.push({
      name: `Month ${i}`,
      Balance: parseFloat(currentProjectedBalance.toFixed(2))
    });
  }


  return (
    <PageLayout title="Dashboard">
      <p className="text-gray-700">Welcome to your expense tracker dashboard! Here you will see an overview of your finances.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
        <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
          <h3 className="font-semibold text-blue-800 mb-2">Total Current Balance</h3>
          <p className="text-2xl font-bold text-blue-900">
            {totalBankBalance.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg shadow-sm border border-green-200">
          <h3 className="font-semibold text-green-800 mb-2">Total Income (YTD)</h3>
          <p className="text-2xl font-bold text-green-900">
            {totalIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg shadow-sm border border-red-200">
          <h3 className="font-semibold text-red-800 mb-2">Total Expenses (YTD)</h3>
          <p className="text-2xl font-bold text-red-900">
            {totalExpenses.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="bg-purple-50 p-4 rounded-lg shadow-sm border border-purple-200">
          <h3 className="font-semibold text-purple-800 mb-2">Gross Monthly Salary</h3>
          <p className="text-2xl font-bold text-purple-900">
            {salaryDetails?.salary?.toLocaleString('en-US', { style: 'currency', currency: 'USD' }) || '$0.00'}
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded-lg shadow-sm border border-yellow-200">
          <h3 className="font-semibold text-yellow-800 mb-2">Upcoming Income</h3>
          <p className="text-2xl font-bold text-yellow-900">
            {upcomingIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
        <div className="bg-indigo-50 p-4 rounded-lg shadow-sm border border-indigo-200">
          <h3 className="font-semibold text-indigo-800 mb-2">Projected Monthly Net Cash Flow</h3>
          <p className="text-2xl font-bold text-indigo-900">
            {monthlyNetCashFlow.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
      </div>

      <div className="mt-8 bg-white p-6 rounded-lg shadow-md border-b-2 border-purple-500">
        <h3 className="text-2xl font-extrabold text-gray-800 mb-4">Financial Forecast (Next 6 Months)</h3>
        <p className="text-gray-700 mb-6">This chart projects your current balance based on your average monthly net cash flow (salary + recent incomes - recent expenses).</p>
        <div style={{ width: '100%', height: 400 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={forecastData}
              margin={{
                top: 5,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} />
              <Legend />
              <Line type="monotone" dataKey="Balance" stroke="#8884d8" activeDot={{ r: 8 }} strokeWidth={2}/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PageLayout>
  );
};

/**
 * Banks Page Component
 */
const Banks = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditAccount, setCurrentEditAccount] = useState<BankAccount | null>(null);

  const [bankName, setBankName] = useState('');
  const [fullName, setFullName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [amount, setAmount] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const closeMessageBox = () => {
    setMessage('');
  };

  const resetForm = () => {
    setBankName('');
    setFullName('');
    setCardNumber('');
    setExpirationDate('');
    setAmount('');
    setCurrentEditAccount(null);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!user || !db) {
      setBankAccounts([]);
      return;
    }

    const banksCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/banks`);
    const q = query(banksCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const accounts: BankAccount[] = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<BankAccount, 'id'>;
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt as Date) || undefined,
          lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate() : (data.lastUpdated as Date) || undefined,
        };
      });
      accounts.sort((a, b) => {
        const dateA = (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : a.createdAt)?.getTime() || 0;
        const dateB = (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
      setBankAccounts(accounts);
    }, (error: unknown) => {
      let errorMessage = 'Error fetching bank accounts.';
      if (error instanceof Error) {
        errorMessage = `Error fetching bank accounts: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error fetching bank accounts:", error);
    });

    return () => unsubscribe();
  }, [user, db, appId]);


  const handleAddBankClick = () => {
    resetForm();
    setShowForm(true);
    setMessage('');
  };

  const handleEditBankClick = (account: BankAccount) => {
    setCurrentEditAccount(account);
    setBankName(account.bankName);
    setFullName(account.fullName);
    setCardNumber(account.last4Digits === '0000' ? '' : account.last4Digits);
    setExpirationDate(account.expirationDate || '');
    setAmount(account.amount.toString());
    setIsEditing(true);
    setShowForm(true);
    setMessage('');
  };

  const handleCloseForm = () => {
    setShowForm(false);
    resetForm();
    setMessage('');
  };

  const handleSaveBank = async () => {
    if (!bankName || !fullName || !amount) {
      setMessage('Please fill in Bank Name, Full Name, and Amount.');
      setMessageType('error');
      return;
    }
    if (isNaN(parseFloat(amount))) {
      setMessage('Amount must be a valid number.');
      setMessageType('error');
      return;
    }

    setGlobalIsLoading(true);
    setMessage('');

    try {
      if (!user || !db) {
        setMessage('Firebase or user not initialized. Cannot save data.');
        setMessageType('error');
        setGlobalIsLoading(false);
        return;
      }
      const last4Digits = cardNumber.length >= 4 ? cardNumber.slice(-4) : '0000';
      const bankData: Omit<BankAccount, 'id' | 'createdAt' | 'lastUpdated'> = {
        bankName,
        fullName,
        last4Digits,
        expirationDate: expirationDate || '',
        amount: parseFloat(amount),
      };

      const banksCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/banks`);
      if (isEditing && currentEditAccount) {
        await setDoc(doc(banksCollectionRef, currentEditAccount.id), {
          ...bankData,
          createdAt: currentEditAccount.createdAt instanceof Timestamp ? currentEditAccount.createdAt : (currentEditAccount.createdAt ? Timestamp.fromDate(currentEditAccount.createdAt as Date) : serverTimestamp()),
          lastUpdated: serverTimestamp(),
        });
        setMessage('Bank account updated successfully!');
      } else {
        await setDoc(doc(banksCollectionRef), {
          ...bankData,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        setMessage('Bank account added successfully!');
      }
      setMessageType('success');
      setShowForm(false);
      resetForm();
      setTimeout(() => setMessage(''), 3000);

    } catch (error: unknown) {
      let errorMessage = 'Error saving bank account.';
      if (error instanceof Error) {
        errorMessage = `Error saving bank account: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error saving bank account:", error);
    } finally {
      setGlobalIsLoading(false);
    }
  };


  return (
    <PageLayout title="Banks">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <p className="text-gray-700 mb-4">Manage your bank accounts and financial institutions here.</p>

      <div className="bg-orange-100 border-l-4 border-orange-500 text-orange-700 p-4 mb-6 rounded-md" role="alert">
        <p className="font-bold">Important Note on Security:</p>
        <p className="text-sm">For your safety and privacy, this application does **NOT** automatically fetch bank data from any financial institution. Please manually provide the bank's name, your full name, and the amount. Your financial data is stored securely within your personal account on this app, not directly linked to external banks.</p>
      </div>

      {!showForm && (
        <button
          onClick={handleAddBankClick}
          className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-105"
        >
          Add New Bank Account
        </button>
      )}

      {showForm && (
        <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            {isEditing ? 'Edit Bank Account' : 'Add New Bank Account'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="bankName" className="block text-sm font-medium text-gray-700 mb-1">Bank's Name</label>
              <input
                type="text"
                id="bankName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="e.g., BPI, Metrobank"
                required
              />
            </div>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full Name (on card/account)</label>
              <input
                type="text"
                id="fullName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g., Juan Dela Cruz"
                required
              />
            </div>
            <div>
              <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">16-Digit Card (Optional)</label>
              <input
                type="text"
                id="cardNumber"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={cardNumber}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                  setCardNumber(val);
                }}
                placeholder="•••• •••• •••• ••••"
                maxLength={16}
              />
            </div>
            <div>
              <label htmlFor="expirationDate" className="block text-sm font-medium text-gray-700 mb-1">Expiration Date (MM/YY - Optional)</label>
              <input
                type="text"
                id="expirationDate"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={expirationDate}
                onChange={(e) => {
                  let val = e.target.value.replace(/\D/g, '');
                  if (val.length > 2) {
                    val = val.slice(0, 2) + '/' + val.slice(2, 4);
                  }
                  setExpirationDate(val);
                }}
                placeholder="MM/YY"
                maxLength={5}
              />
            </div>
            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                id="amount"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g., 1500.75"
                required
                step="0.01"
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={handleCloseForm}
              className="px-5 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition duration-300 ease-in-out"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveBank}
              className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              {isEditing ? 'Save Changes' : 'Save Bank Account'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Your Bank Accounts</h3>
        {bankAccounts.length === 0 ? (
          <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200">
            No bank accounts added yet. Click "Add New Bank Account" to get started!
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((account: BankAccount) => (
              <div key={account.id} className="bg-white p-4 rounded-lg shadow-md border-b-2 border-indigo-300">
                <h4 className="font-bold text-lg text-indigo-700">{account.bankName}</h4>
                <p className="text-gray-700 text-sm">Account Holder: <span className="font-medium">{account.fullName}</span></p>
                <p className="text-gray-700 text-sm">Card No: <span className="font-mono">•••• {account.last4Digits}</span></p>
                {account.expirationDate && (
                  <p className="text-gray-700 text-sm">Expires: <span className="font-mono">{account.expirationDate}</span></p>
                )}
                <p className="text-gray-800 text-xl font-bold mt-2">
                  {account.amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </p>
                 <p className="text-gray-500 text-xs mt-1">
                  Added: {(account.createdAt instanceof Timestamp ? account.createdAt.toDate() : (account.createdAt as Date))?.toLocaleDateString() || 'N/A'}
                </p>
                <div className="mt-3 text-right">
                  <button
                    onClick={() => handleEditBankClick(account)}
                    className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
};

/**
 * Incomes Page Component
 */
const Incomes = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditIncome, setCurrentEditIncome] = useState<IncomeEntry | null>(null);

  const [businessName, setBusinessName] = useState('');
  const [industry, setIndustry] = useState('');
  const [incomeAmount, setIncomeAmount] = useState('');
  const [incomeDate, setIncomeDate] = useState('');

  const [incomeEntries, setIncomeEntries] = useState<IncomeEntry[]>([]);
  const [filterPeriod, setFilterPeriod] = useState('month');
  const [filteredIncomes, setFilteredIncomes] = useState<IncomeEntry[]>([]);
  const [totalFilteredIncome, setTotalFilteredIncome] = useState(0);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const closeMessageBox = () => {
    setMessage('');
  };

  const resetForm = () => {
    setBusinessName('');
    setIndustry('');
    setIncomeAmount('');
    setIncomeDate('');
    setCurrentEditIncome(null);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!user || !db) {
      setIncomeEntries([]);
      return;
    }

    const incomesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/incomes`);
    const q = query(incomesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: IncomeEntry[] = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<IncomeEntry, 'id'>;
        return {
          id: doc.id,
          ...data,
          incomeDate: data.incomeDate instanceof Timestamp ? data.incomeDate.toDate() : (data.incomeDate as Date),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt as Date),
        };
      });
      entries.sort((a, b) => {
        const dateA = (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : a.createdAt)?.getTime() || 0;
        const dateB = (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
      setIncomeEntries(entries);
    }, (error: unknown) => {
      let errorMessage = 'Error fetching income entries.';
      if (error instanceof Error) {
        errorMessage = `Error fetching income entries: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error fetching income entries:", error);
    });

    return () => unsubscribe();
  }, [user, db, appId]);

  useEffect(() => {
    const now = new Date();
    let filtered: IncomeEntry[] = incomeEntries;

    if (filterPeriod === 'day') {
      filtered = incomeEntries.filter(entry => {
        const entryDate = entry.incomeDate instanceof Timestamp ? entry.incomeDate.toDate() : (entry.incomeDate as Date);
        if (!entryDate) return false;
        return (
          entryDate.getDate() === now.getDate() &&
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      });
    } else if (filterPeriod === 'week') {
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
      filtered = incomeEntries.filter(entry => {
        const entryDate = entry.incomeDate instanceof Timestamp ? entry.incomeDate.toDate() : (entry.incomeDate as Date);
        if (!entryDate) return false;
        return entryDate >= startOfWeek && entryDate < endOfWeek;
      });
    } else if (filterPeriod === 'month') {
      filtered = incomeEntries.filter(entry => {
        const entryDate = entry.incomeDate instanceof Timestamp ? entry.incomeDate.toDate() : (entry.incomeDate as Date);
        if (!entryDate) return false;
        return (
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      });
    } else if (filterPeriod === 'year') {
      filtered = incomeEntries.filter(entry => {
        const entryDate = entry.incomeDate instanceof Timestamp ? entry.incomeDate.toDate() : (entry.incomeDate as Date);
        if (!entryDate) return false;
        return entryDate.getFullYear() === now.getFullYear();
      });
    } else if (filterPeriod === 'all') {
      filtered = incomeEntries;
    }

    setFilteredIncomes(filtered);
    const total = filtered.reduce((sum, entry) => sum + (parseFloat(String(entry.incomeAmount)) || 0), 0);
    setTotalFilteredIncome(total);
  }, [incomeEntries, filterPeriod]);


  const handleAddIncomeClick = () => {
    resetForm();
    const today = new Date();
    setIncomeDate(today.toISOString().split('T')[0]);
    setShowForm(true);
    setMessage('');
  };

  const handleEditIncomeClick = (income: IncomeEntry) => {
    setCurrentEditIncome(income);
    setBusinessName(income.businessName);
    setIndustry(income.industry);
    setIncomeAmount(income.incomeAmount.toString());
    const dateValue = income.incomeDate instanceof Timestamp ? income.incomeDate.toDate() : (income.incomeDate as Date | null);
    setIncomeDate(dateValue ? dateValue.toISOString().split('T')[0] : '');
    setIsEditing(true);
    setShowForm(true);
    setMessage('');
  };

  const handleCloseForm = () => {
    setShowForm(false);
    resetForm();
    setMessage('');
  };

  const handleSaveIncome = async () => {
    if (!businessName || !industry || !incomeAmount || !incomeDate) {
      setMessage('Please fill in all required fields.');
      setMessageType('error');
      return;
    }
    if (isNaN(parseFloat(incomeAmount))) {
      setMessage('Amount must be a valid number.');
      setMessageType('error');
      return;
    }

    setGlobalIsLoading(true);
    setMessage('');

    try {
      if (!user || !db) {
        setMessage('Firebase or user not initialized. Cannot save data.');
        setMessageType('error');
        setGlobalIsLoading(false);
        return;
      }
      const incomeData: Omit<IncomeEntry, 'id' | 'createdAt' | 'lastUpdated'> = {
        businessName,
        industry,
        incomeAmount: parseFloat(incomeAmount),
        incomeDate: new Date(incomeDate),
      };

      const incomesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/incomes`);
      if (isEditing && currentEditIncome) {
        await setDoc(doc(incomesCollectionRef, currentEditIncome.id), {
          ...incomeData,
          createdAt: currentEditIncome.createdAt instanceof Timestamp ? currentEditIncome.createdAt : (currentEditIncome.createdAt ? Timestamp.fromDate(currentEditIncome.createdAt as Date) : serverTimestamp()),
          lastUpdated: serverTimestamp(),
        });
        setMessage('Income entry updated successfully!');
      } else {
        await setDoc(doc(incomesCollectionRef), {
          ...incomeData,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        setMessage('Income entry added successfully!');
      }
      setMessageType('success');
      setShowForm(false);
      resetForm();
      setTimeout(() => setMessage(''), 3000);
    } catch (error: unknown) {
      let errorMessage = 'Error saving income entry.';
      if (error instanceof Error) {
        errorMessage = `Error saving income entry: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error saving income entry:", error);
    } finally {
      setGlobalIsLoading(false);
    }
  };

  return (
    <PageLayout title="Incomes">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <p className="text-gray-700 mb-4">Track all your sources of income.</p>

      {!showForm && (
        <button
          onClick={handleAddIncomeClick}
          className="bg-teal-600 text-white py-2 px-4 rounded-md hover:bg-teal-700 transition duration-300 ease-in-out transform hover:scale-105"
        >
          Add New Income Entry
        </button>
      )}

      {showForm && (
        <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            {isEditing ? 'Edit Income Entry' : 'Add New Income Entry'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="businessName" className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
              <input
                type="text"
                id="businessName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g., Freelance Project, Company X"
                required
              />
            </div>
            <div>
              <label htmlFor="industry" className="block text-sm font-medium text-gray-700 mb-1">Industry (Category)</label>
              <input
                type="text"
                id="industry"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g., Tech, Consulting, Sales"
                required
              />
            </div>
            <div>
              <label htmlFor="incomeAmount" className="block text-sm font-medium text-gray-700 mb-1">Amount Received</label>
              <input
                type="number"
                id="incomeAmount"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                value={incomeAmount}
                onChange={(e) => setIncomeAmount(e.target.value)}
                placeholder="e.g., 2500.00"
                required
                step="0.01"
              />
            </div>
            <div>
              <label htmlFor="incomeDate" className="block text-sm font-medium text-gray-700 mb-1">Date Received</label>
              <input
                type="date"
                id="incomeDate"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
                value={incomeDate}
                onChange={(e) => setIncomeDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={handleCloseForm}
              className="px-5 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition duration-300 ease-in-out"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveIncome}
              className="px-5 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              {isEditing ? 'Save Changes' : 'Save Income Entry'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Your Income Entries</h3>
          {incomeEntries.length === 0 ? (
            <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200">
              No income entries found. Click "Add New Income Entry" to get started!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredIncomes.map((entry: IncomeEntry) => (
                <div key={entry.id} className="bg-white p-4 rounded-lg shadow-md border-b-2 border-teal-300">
                  <h4 className="font-bold text-lg text-teal-700">{entry.businessName}</h4>
                  <p className="text-gray-700 text-sm">Industry: <span className="font-medium">{entry.industry}</span></p>
                  <p className="text-gray-700 text-sm">Date: <span className="font-mono">{(entry.incomeDate instanceof Timestamp ? entry.incomeDate.toDate() : (entry.incomeDate as Date))?.toLocaleDateString() || 'N/A'}</span></p>
                  <p className="text-gray-800 text-xl font-bold mt-2">
                    {entry.incomeAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Added: {(entry.createdAt instanceof Timestamp ? entry.createdAt.toDate() : (entry.createdAt as Date))?.toLocaleDateString() || 'N/A'}
                  </p>
                  <div className="mt-3 flex justify-end space-x-2">
                    <button
                      onClick={() => handleEditIncomeClick(entry)}
                      className="text-teal-600 hover:text-teal-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
              {filteredIncomes.length === 0 && incomeEntries.length > 0 && (
                <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200 col-span-full">
                  No income entries found for the selected filter period.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-1 bg-green-50 p-6 rounded-lg shadow-md border border-green-200 h-fit sticky top-24">
          <h3 className="text-xl font-semibold text-green-800 mb-4">Total Income Summary</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setFilterPeriod('day')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'day' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
            >
              Day
            </button>
            <button
              onClick={() => setFilterPeriod('week')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'week' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
            >
              Week
            </button>
            <button
              onClick={() => setFilterPeriod('month')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'month' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterPeriod('year')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'year' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
            >
              Year
            </button>
            <button
              onClick={() => setFilterPeriod('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'all' ? 'bg-green-600 text-white' : 'bg-green-200 text-green-800 hover:bg-green-300'}`}
            >
              All
            </button>
          </div>
          <p className="text-4xl font-bold text-green-900">
            {totalFilteredIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
      </div>
    </PageLayout>
  );
};

/**
 * Expenses Page Component
 */
const Expenses = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentEditExpense, setCurrentEditExpense] = useState<ExpenseEntry | null>(null);

  const [expenseName, setExpenseName] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDate, setExpenseDate] = useState('');

  const [expenseEntries, setExpenseEntries] = useState<ExpenseEntry[]>([]);
  const [filterPeriod, setFilterPeriod] = useState('month');
  const [filteredExpenses, setFilteredExpenses] = useState<ExpenseEntry[]>([]);
  const [totalFilteredExpense, setTotalFilteredExpense] = useState(0);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const categories = [
    'Bills', 'Food', 'Transportation', 'Shopping', 'Entertainment',
    'Health', 'Education', 'Personal Care', 'Loans', 'Miscellaneous'
  ];

  const closeMessageBox = () => {
    setMessage('');
  };

  const resetForm = () => {
    setExpenseName('');
    setExpenseCategory('');
    setExpenseAmount('');
    setExpenseDate('');
    setCurrentEditExpense(null);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!user || !db) {
      setExpenseEntries([]);
      return;
    }

    const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/expenses`);
    const q = query(expensesCollectionRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const entries: ExpenseEntry[] = snapshot.docs.map(doc => {
        const data = doc.data() as Omit<ExpenseEntry, 'id'>;
        return {
          id: doc.id,
          ...data,
          expenseDate: data.expenseDate instanceof Timestamp ? data.expenseDate.toDate() : (data.expenseDate as Date),
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate() : (data.createdAt as Date),
        };
      });
      entries.sort((a, b) => {
        const dateA = (a.createdAt instanceof Timestamp ? a.createdAt.toDate() : a.createdAt)?.getTime() || 0;
        const dateB = (b.createdAt instanceof Timestamp ? b.createdAt.toDate() : b.createdAt)?.getTime() || 0;
        return dateB - dateA;
      });
      setExpenseEntries(entries);
    }, (error: unknown) => {
      let errorMessage = 'Error fetching expense entries.';
      if (error instanceof Error) {
        errorMessage = `Error fetching expense entries: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error fetching expense entries:", error);
    });

    return () => unsubscribe();
  }, [user, db, appId]);

  useEffect(() => {
    const now = new Date();
    let filtered: ExpenseEntry[] = expenseEntries;

    if (filterPeriod === 'day') {
      filtered = expenseEntries.filter(entry => {
        const entryDate = entry.expenseDate instanceof Timestamp ? entry.expenseDate.toDate() : (entry.expenseDate as Date);
        if (!entryDate) return false;
        return (
          entryDate.getDate() === now.getDate() &&
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      });
    } else if (filterPeriod === 'week') {
      const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()) + 1);
      filtered = expenseEntries.filter(entry => {
        const entryDate = entry.expenseDate instanceof Timestamp ? entry.expenseDate.toDate() : (entry.expenseDate as Date);
        if (!entryDate) return false;
        return entryDate >= startOfWeek && entryDate < endOfWeek;
      });
    } else if (filterPeriod === 'month') {
      filtered = expenseEntries.filter(entry => {
        const entryDate = entry.expenseDate instanceof Timestamp ? entry.expenseDate.toDate() : (entry.expenseDate as Date);
        if (!entryDate) return false;
        return (
          entryDate.getMonth() === now.getMonth() &&
          entryDate.getFullYear() === now.getFullYear()
        );
      });
    } else if (filterPeriod === 'year') {
      filtered = expenseEntries.filter(entry => {
        const entryDate = entry.expenseDate instanceof Timestamp ? entry.expenseDate.toDate() : (entry.expenseDate as Date);
        if (!entryDate) return false;
        return entryDate.getFullYear() === now.getFullYear();
      });
    } else if (filterPeriod === 'all') {
      filtered = expenseEntries;
    }

    setFilteredExpenses(filtered);
    const total = filtered.reduce((sum, entry) => sum + (parseFloat(String(entry.expenseAmount)) || 0), 0);
    setTotalFilteredExpense(total);
  }, [expenseEntries, filterPeriod]);


  const handleAddExpenseClick = () => {
    resetForm();
    const today = new Date();
    setExpenseDate(today.toISOString().split('T')[0]);
    setShowForm(true);
    setMessage('');
  };

  const handleEditExpenseClick = (expense: ExpenseEntry) => {
    setCurrentEditExpense(expense);
    setExpenseName(expense.name);
    setExpenseCategory(expense.category);
    setExpenseAmount(expense.expenseAmount.toString());
    const dateValue = expense.expenseDate instanceof Timestamp ? expense.expenseDate.toDate() : (expense.expenseDate as Date | null);
    setExpenseDate(dateValue ? dateValue.toISOString().split('T')[0] : '');
    setIsEditing(true);
    setShowForm(true);
    setMessage('');
  };

  const handleCloseForm = () => {
    setShowForm(false);
    resetForm();
    setMessage('');
  };

  const handleSaveExpense = async () => {
    if (!expenseName || !expenseCategory || !expenseAmount || !expenseDate) {
      setMessage('Please fill in all required fields.');
      setMessageType('error');
      return;
    }
    if (isNaN(parseFloat(expenseAmount))) {
      setMessage('Amount must be a valid number.');
      setMessageType('error');
      return;
    }

    setGlobalIsLoading(true);
    setMessage('');

    try {
      if (!user || !db) {
        setMessage('Firebase or user not initialized. Cannot save data.');
        setMessageType('error');
        setGlobalIsLoading(false);
        return;
      }
      const expenseData: Omit<ExpenseEntry, 'id' | 'createdAt' | 'lastUpdated'> = {
        name: expenseName,
        category: expenseCategory,
        expenseAmount: parseFloat(expenseAmount),
        expenseDate: new Date(expenseDate),
      };

      const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/expenses`);
      if (isEditing && currentEditExpense) {
        const originalCreatedAt = currentEditExpense.createdAt instanceof Timestamp
          ? currentEditExpense.createdAt
          : (currentEditExpense.createdAt ? Timestamp.fromDate(currentEditExpense.createdAt as Date) : serverTimestamp());

        await setDoc(doc(expensesCollectionRef, currentEditExpense.id), {
          ...expenseData,
          createdAt: originalCreatedAt,
          lastUpdated: serverTimestamp(),
        });
        setMessage('Expense entry updated successfully!');
      } else {
        await setDoc(doc(expensesCollectionRef), {
          ...expenseData,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
        });
        setMessage('Expense entry added successfully!');
      }
      setMessageType('success');
      setShowForm(false);
      resetForm();
      setTimeout(() => setMessage(''), 3000);
    } catch (error: unknown) {
      let errorMessage = 'Error saving expense entry.';
      if (error instanceof Error) {
        errorMessage = `Error saving expense entry: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Error saving expense entry:", error);
    } finally {
      setGlobalIsLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!user || !expenseId) {
      setMessage('User not authenticated or invalid expense ID.');
      setMessageType('error');
      return;
    }

    if (window.confirm("Are you sure you want to delete this expense entry?")) {
      setGlobalIsLoading(true);
      setMessage('');
      try {
        if (!db) {
          setMessage('Firebase not initialized. Cannot delete data.');
          setMessageType('error');
          setGlobalIsLoading(false);
          return;
        }
        const expenseDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/expenses/${expenseId}`);
        await deleteDoc(expenseDocRef);
        setMessage('Expense entry deleted successfully!');
        setMessageType('success');
        setTimeout(() => setMessage(''), 3000);
      } catch (error: unknown) {
        let errorMessage = 'Error deleting expense entry.';
        if (error instanceof Error) {
          errorMessage = `Error deleting expense entry: ${error.message}`;
        }
        setMessage(errorMessage);
        setMessageType('error');
        console.error("Error deleting expense entry:", error);
      } finally {
        setGlobalIsLoading(false);
      }
    }
  };

  return (
    <PageLayout title="Expenses">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <p className="text-gray-700 mb-4">Log and categorize all your daily, weekly, and monthly expenses.</p>

      {!showForm && (
        <button
          onClick={handleAddExpenseClick}
          className="bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105"
        >
          Add New Expense Entry
        </button>
      )}

      {showForm && (
        <div className="mt-6 p-6 bg-gray-50 rounded-lg border border-gray-200 shadow-inner">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">
            {isEditing ? 'Edit Expense Entry' : 'Add New Expense Entry'}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="expenseName" className="block text-sm font-medium text-gray-700 mb-1">Expense Name</label>
              <input
                type="text"
                id="expenseName"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                value={expenseName}
                onChange={(e) => setExpenseName(e.target.value)}
                placeholder="e.g., Electricity Bill, Groceries"
                required
              />
            </div>
            <div>
              <label htmlFor="expenseCategory" className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                id="expenseCategory"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                required
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="expenseAmount" className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input
                type="number"
                id="expenseAmount"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="e.g., 50.00"
                required
                step="0.01"
              />
            </div>
            <div>
              <label htmlFor="expenseDate" className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input
                type="date"
                id="expenseDate"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={handleCloseForm}
              className="px-5 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition duration-300 ease-in-out"
            >
              Close
            </button>
            <button
              onClick={handleSaveExpense}
              className="px-5 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition duration-300 ease-in-out transform hover:scale-105"
            >
              {isEditing ? 'Save Changes' : 'Save Expense'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Your Expense Entries</h3>
          {expenseEntries.length === 0 ? (
            <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200">
              No expense entries found. Click "Add New Expense Entry" to get started!
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredExpenses.map((entry: ExpenseEntry) => (
                <div key={entry.id} className="bg-white p-4 rounded-lg shadow-md border-b-2 border-red-300">
                  <h4 className="font-bold text-lg text-red-700">{entry.name}</h4>
                  <p className="text-gray-700 text-sm">Category: <span className="font-medium">{entry.category}</span></p>
                  <p className="text-gray-700 text-sm">Date: <span className="font-mono">{(entry.expenseDate instanceof Timestamp ? entry.expenseDate.toDate() : (entry.expenseDate as Date))?.toLocaleDateString() || 'N/A'}</span></p>
                  <p className="text-gray-800 text-xl font-bold mt-2">
                    {entry.expenseAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  </p>
                  <p className="text-gray-500 text-xs mt-1">
                    Added: {(entry.createdAt instanceof Timestamp ? entry.createdAt.toDate() : (entry.createdAt as Date))?.toLocaleDateString() || 'N/A'}
                  </p>
                  <div className="mt-3 flex justify-end space-x-2">
                    <button
                      onClick={() => handleEditExpenseClick(entry)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteExpense(entry.id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {filteredExpenses.length === 0 && expenseEntries.length > 0 && (
                <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200 col-span-full">
                  No expense entries found for the selected filter period.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="lg:col-span-1 bg-red-50 p-6 rounded-lg shadow-md border border-red-200 h-fit sticky top-24">
          <h3 className="text-xl font-semibold text-red-800 mb-4">Total Expenses Summary</h3>
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => setFilterPeriod('day')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'day' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'}`}
            >
              Day
            </button>
            <button
              onClick={() => setFilterPeriod('week')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'week' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'}`}
            >
              Week
            </button>
            <button
              onClick={() => setFilterPeriod('month')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'month' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'}`}
            >
              Month
            </button>
            <button
              onClick={() => setFilterPeriod('year')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'year' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'}`}
            >
              Year
            </button>
            <button
              onClick={() => setFilterPeriod('all')}
              className={`px-3 py-1 rounded-md text-sm font-medium ${filterPeriod === 'all' ? 'bg-red-600 text-white' : 'bg-red-200 text-red-800 hover:bg-red-300'}`}
            >
              All
            </button>
          </div>
          <p className="text-4xl font-bold text-red-900">
            {totalFilteredExpense.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
      </div>
    </PageLayout>
  );
};

/**
 * Salary Page Component
 */
const Salary = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();

  const [salary, setSalary] = useState<string | number>('');
  const [frequency, setFrequency] = useState<'Weekly' | 'Fortnightly' | 'Monthly'>('Monthly');
  const [paydaySpecific, setPaydaySpecific] = useState<string | number>('');
  const [dayOffInMonth, setDayOffInMonth] = useState<'1' | '2'>('2');
  const [sss, setSss] = useState<string | number>('');
  const [philhealth, setPhilhealth] = useState<string | number>('');
  const [pagibig, setPagibig] = useState<string | number>('');
  const [tax, setTax] = useState<string | number>('');
  const [loans, setLoans] = useState<string | number>('');
  const [voluntary, setVoluntary] = useState<string | number>('');

  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [dailyIncome, setDailyIncome] = useState(0);
  const [totalDeductions, setTotalDeductions] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  // New state to track if user is actively typing/editing
  const [isActivelyEditing, setIsActivelyEditing] = useState(false);
  // Ref to hold the current salary data from Firestore, to compare for updates
  const latestSalaryDataRef = useRef<SalaryDetails | null>(null);


  const salaryDocRef = (user && db) ? doc(db, `artifacts/${appId}/users/${user.uid}/salary/details`) : null;

  // Use onSnapshot for real-time updates but conditionally apply them to state
  useEffect(() => {
    if (!user || !db || !salaryDocRef) return;

    const unsubscribe = onSnapshot(salaryDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SalaryDetails;
        latestSalaryDataRef.current = data; // Keep track of the latest data from Firestore

        // Only update form fields if the user is NOT actively editing
        // or if the data from Firestore is genuinely different
        if (!isActivelyEditing) {
          setSalary(data.salary || '');
          setFrequency(data.frequency || 'Monthly');
          setPaydaySpecific(data.paydaySpecific || '');
          setDayOffInMonth(data.dayOffInMonth || '2');
          setSss(data.sss || '');
          setPhilhealth(data.philhealth || '');
          setPagibig(data.pagibig || '');
          setTax(data.tax || '');
          setLoans(data.loans || '');
          setVoluntary(data.voluntary || '');
          calculateSalary(
            data.salary,
            data.frequency,
            data.dayOffInMonth,
            data.sss,
            data.philhealth,
            data.pagibig,
            data.tax,
            data.loans,
            data.voluntary
          );
        } else {
          // If actively editing, still update calculation, but not form fields
          calculateSalary(
            salary, frequency, dayOffInMonth, // Use current input values for calculation
            sss, philhealth, pagibig, tax, loans, voluntary
          );
        }
      } else {
        latestSalaryDataRef.current = null;
        if (!isActivelyEditing) { // Clear fields only if not editing and doc doesn't exist
          setSalary('');
          setFrequency('Monthly');
          setPaydaySpecific('');
          setDayOffInMonth('2');
          setSss('');
          setPhilhealth('');
          setPagibig('');
          setTax('');
          setLoans('');
          setVoluntary('');
          setMonthlyIncome(0);
          setDailyIncome(0);
          setTotalDeductions(0);
        }
      }
    }, (error: unknown) => {
      let errorMessage = 'Error fetching salary data.';
      if (error instanceof Error) {
        errorMessage = `Error fetching salary data: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error('Error fetching salary data:', error);
    });

    return () => unsubscribe();
  }, [user, db, appId, isActivelyEditing, salaryDocRef]); // Added isActivelyEditing to dependencies


  // Helper function to handle input changes and set isActivelyEditing
  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string | number>>) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setter(e.target.value);
    setIsActivelyEditing(true); // User is now actively modifying inputs
  };

  const calculateSalary = (
    currentSalary: string | number,
    currentFrequency: 'Weekly' | 'Fortnightly' | 'Monthly',
    currentDayOffInMonth: '1' | '2',
    currentSss: string | number,
    currentPhilhealth: string | number,
    currentPagibig: string | number,
    currentTax: string | number,
    currentLoans: string | number,
    currentVoluntary: string | number
  ) => {
    const parsedSalary = parseFloat(String(currentSalary)) || 0;
    const parsedSss = parseFloat(String(currentSss)) || 0;
    const parsedPhilhealth = parseFloat(String(currentPhilhealth)) || 0;
    const parsedPagibig = parseFloat(String(currentPagibig)) || 0;
    const parsedTax = parseFloat(String(currentTax)) || 0;
    const parsedLoans = parseFloat(String(currentLoans)) || 0;
    const parsedVoluntary = parseFloat(String(currentVoluntary)) || 0;

    let calculatedMonthlyIncome = 0;
    switch (currentFrequency) {
      case 'Weekly':
        calculatedMonthlyIncome = parsedSalary * (365 / 7 / 12);
        break;
      case 'Fortnightly':
        calculatedMonthlyIncome = parsedSalary * (365 / 14 / 12);
        break;
      case 'Monthly':
      default:
        calculatedMonthlyIncome = parsedSalary;
        break;
    }
    setMonthlyIncome(calculatedMonthlyIncome);

    let workdaysInMonth = 22;
    if (currentDayOffInMonth === '1') {
      workdaysInMonth = 26;
    } else if (currentDayOffInMonth === '2') {
      workdaysInMonth = 22;
    }

    const calculatedDailyIncome = workdaysInMonth > 0 ? (calculatedMonthlyIncome / workdaysInMonth) : 0;
    setDailyIncome(calculatedDailyIncome);

    const calculatedTotalDeductions =
      parsedSss + parsedPhilhealth + parsedPagibig + parsedTax + parsedLoans + parsedVoluntary;
    setTotalDeductions(calculatedTotalDeductions);
  };

  const handleCalculateAndSave = async () => {
    setGlobalIsLoading(true);
    setMessage('');

    try {
      if (!user || !salaryDocRef) {
        setMessage('Firebase or user not initialized. Cannot save data.');
        setMessageType('error');
        setGlobalIsLoading(false);
        return;
      }

      // Ensure calculations are based on current form state before saving
      calculateSalary(
        salary, frequency, dayOffInMonth,
        sss, philhealth, pagibig, tax, loans, voluntary
      );

      const salaryData: Omit<SalaryDetails, 'lastUpdated'> = {
        salary: parseFloat(String(salary)) || 0,
        frequency,
        paydaySpecific: String(paydaySpecific),
        dayOffInMonth,
        sss: parseFloat(String(sss)) || 0,
        philhealth: parseFloat(String(philhealth)) || 0,
        pagibig: parseFloat(String(pagibig)) || 0,
        tax: parseFloat(String(tax)) || 0,
        loans: parseFloat(String(loans)) || 0,
        voluntary: parseFloat(String(voluntary)) || 0,
      };

      await setDoc(salaryDocRef, {
        ...salaryData,
        lastUpdated: serverTimestamp(),
      });
      setMessage('Salary data saved successfully!');
      setMessageType('success');
      setIsActivelyEditing(false); // Reset editing state after successful save
      setTimeout(() => {
        setMessage('');
      }, 3000);

    } catch (error: unknown) {
      let errorMessage = 'Error saving salary data.';
      if (error instanceof Error) {
        errorMessage = `Error saving salary data: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error('Error saving salary data:', error);
    } finally {
      setGlobalIsLoading(false);
    }
  };

  const closeMessageBox = () => {
    setMessage('');
  };

  const renderPaydayInput = () => {
    if (frequency === 'Monthly') {
      return (
        <select
          id="paydaySpecific"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          value={paydaySpecific}
          onChange={handleInputChange(setPaydaySpecific)}
        >
          <option value="">Select Day</option>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
            <option key={day} value={day}>
              {day}{day === 1 || day === 21 || day === 31 ? 'st' : day === 2 || day === 22 ? 'nd' : day === 3 || day === 23 ? 'rd' : 'th'}
            </option>
          ))}
        </select>
      );
    } else if (frequency === 'Weekly') {
      return (
        <select
          id="paydaySpecific"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          value={paydaySpecific}
          onChange={handleInputChange(setPaydaySpecific)}
        >
          <option value="">Select Day</option>
          <option value="Monday">Monday</option>
          <option value="Tuesday">Tuesday</option>
          <option value="Wednesday">Wednesday</option>
          <option value="Thursday">Thursday</option>
          <option value="Friday">Friday</option>
        </select>
      );
    } else { // Fortnightly
      return (
        <input
          type="date"
          id="paydaySpecific"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
          value={paydaySpecific}
          onChange={handleInputChange(setPaydaySpecific)}
        />
      );
    }
  };


  return (
    <PageLayout title="Salary">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <div className="bg-white p-6 rounded-lg shadow-md border-b-2 border-purple-500">
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Salary Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="salary" className="block text-sm font-medium text-gray-700 mb-1">
              Gross Salary
            </label>
            <input
              type="number"
              id="salary"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              value={salary}
              onChange={handleInputChange(setSalary)}
              placeholder="e.g., 50000"
            />
          </div>
          <div>
            <label htmlFor="frequency" className="block text-sm font-medium text-gray-700 mb-1">
              Frequency
            </label>
            <select
              id="frequency"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              value={frequency}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setFrequency(e.target.value as 'Weekly' | 'Fortnightly' | 'Monthly');
                setPaydaySpecific(''); // Reset payday specific when frequency changes
                setIsActivelyEditing(true); // User is now actively modifying inputs
              }}
            >
              <option value="Weekly">Weekly</option>
              <option value="Fortnightly">Fortnightly</option>
              <option value="Monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label htmlFor="paydaySpecific" className="block text-sm font-medium text-gray-700 mb-1">
              Payday
            </label>
            {renderPaydayInput()}
          </div>
          <div>
            <label htmlFor="dayOffInMonth" className="block text-sm font-medium text-gray-700 mb-1">
              Days Off Per Week (1 or 2)
            </label>
            <select
              id="dayOffInMonth"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
              value={dayOffInMonth}
              onChange={handleInputChange(setDayOffInMonth)}
            >
              <option value="1">1 Day (e.g., Sunday)</option>
              <option value="2">2 Days (e.g., Sat & Sun)</option>
            </select>
          </div>
        </div>

        <h3 className="text-xl font-semibold text-gray-800 mt-8 mb-4 border-t pt-4">Deductions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="sss" className="block text-sm font-medium text-gray-700 mb-1">SSS</label>
            <input type="number" id="sss" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={sss} onChange={handleInputChange(setSss)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="philhealth" className="block text-sm font-medium text-gray-700 mb-1">Philhealth</label>
            <input type="number" id="philhealth" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={philhealth} onChange={handleInputChange(setPhilhealth)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="pagibig" className="block text-sm font-medium text-gray-700 mb-1">Pag-ibig</label>
            <input type="number" id="pagibig" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={pagibig} onChange={handleInputChange(setPagibig)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="tax" className="block text-sm font-medium text-gray-700 mb-1">Tax</label>
            <input type="number" id="tax" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={tax} onChange={handleInputChange(setTax)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="loans" className="block text-sm font-medium text-gray-700 mb-1">Loans</label>
            <input type="number" id="loans" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={loans} onChange={handleInputChange(setLoans)} placeholder="0.00" />
          </div>
          <div>
            <label htmlFor="voluntary" className="block text-sm font-medium text-gray-700 mb-1">Voluntary</label>
            <input type="number" id="voluntary" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" value={voluntary} onChange={handleInputChange(setVoluntary)} placeholder="0.00" />
          </div>
        </div>

        <button
          onClick={handleCalculateAndSave}
          className="mt-8 w-full bg-purple-600 text-white py-3 px-4 rounded-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
        >
          Save/Update Salary
        </button>

        <div className="mt-8 p-4 bg-purple-50 rounded-lg shadow-inner border border-purple-200">
          <h3 className="text-xl font-bold text-purple-800 mb-3">Calculated Summary</h3>
          <p className="text-gray-800 mb-2">
            <span className="font-semibold">Monthly Income:</span> {monthlyIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
          <p className="text-gray-800 mb-2">
            <span className="font-semibold">Total Deductions:</span> {totalDeductions.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
          <p className="text-gray-800">
            <span className="font-semibold">Daily Income:</span> {dailyIncome.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
          </p>
        </div>
      </div>
    </PageLayout>
  );
};


/**
 * Profile Page Component
 */
const Profile = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [userName, setUserName] = useState(user?.displayName || '');
  const [userEmail, setUserEmail] = useState(user?.email || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [receiveEmailNotifications, setReceiveEmailNotifications] = useState(false);
  const [receivePhoneNotifications, setReceivePhoneNotifications] = useState(false);

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const closeMessageBox = () => {
    setMessage('');
  };

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user || !db) return;
      try {
        setGlobalIsLoading(true);
        const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/details`);
        const docSnap = await getDoc(userDocRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as UserProfile;
          setUserName(data.name || user?.displayName || '');
          setUserEmail(data.email || user?.email || '');
          setPhoneNumber(data.phoneNumber || '');
          setReceiveEmailNotifications(data.receiveEmailNotifications || false);
          setReceivePhoneNotifications(data.receivePhoneNotifications || false);
        } else {
          const initialProfileData: UserProfile = {
            name: user?.displayName || '',
            email: user?.email || '',
            phoneNumber: '',
            receiveEmailNotifications: true,
            receivePhoneNotifications: false,
            createdAt: serverTimestamp(),
          };
          await setDoc(userDocRef, initialProfileData);
          setUserName(initialProfileData.name);
          setUserEmail(initialProfileData.email);
          setPhoneNumber(initialProfileData.phoneNumber);
          setReceiveEmailNotifications(initialProfileData.receiveEmailNotifications);
          setReceivePhoneNotifications(initialProfileData.receivePhoneNotifications);
        }
      } catch (error: unknown) {
        let errorMessage = 'Error loading profile data.';
        if (error instanceof Error) {
          errorMessage = `Error loading profile data: ${error.message}`;
        }
        setMessage(errorMessage);
        setMessageType('error');
        console.error('Error loading profile data:', error);
      } finally {
        setGlobalIsLoading(false);
      }
    };
    fetchProfileData();
  }, [user, db, appId, setGlobalIsLoading]);


  const handleEditClick = () => {
    setIsEditing(true);
    setMessage('');
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    const fetchCurrentSettings = async () => {
      if (!user || !db) return;
      const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/details`);
      const docSnap = await getDoc(userDocRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as UserProfile;
        setPhoneNumber(data.phoneNumber || '');
        setReceiveEmailNotifications(data.receiveEmailNotifications || false);
        setReceivePhoneNotifications(data.receivePhoneNotifications || false);
      }
    };
    fetchCurrentSettings();
    setMessage('');
  };

  const handleSaveChanges = async () => {
    if (!userName.trim()) {
      setMessage('Name cannot be empty.');
      setMessageType('error');
      return;
    }

    setGlobalIsLoading(true);
    setMessage('');

    try {
      if (!user || !db) {
        setMessage('Firebase or user not initialized. Cannot save data.');
        setMessageType('error');
        setGlobalIsLoading(false);
        return;
      }
      await updateProfile(user, { displayName: userName });

      const userDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/profile/details`);
      const updatedProfileData: Partial<UserProfile> = {
        name: userName,
        phoneNumber: phoneNumber,
        receiveEmailNotifications: receiveEmailNotifications,
        receivePhoneNotifications: receivePhoneNotifications,
        lastUpdated: serverTimestamp(),
      };
      await setDoc(userDocRef, updatedProfileData, { merge: true });

      setMessage('Profile updated successfully!');
      setMessageType('success');
      setIsEditing(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (error: unknown) {
      let errorMessage = 'Error updating profile.';
      if (error instanceof Error) {
        errorMessage = `Error updating profile: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Profile update error:", error);
    } finally {
      setGlobalIsLoading(false);
    }
  };

  const [totalIncomeSummary, setTotalIncomeSummary] = useState(0);
  const [totalExpensesSummary, setTotalExpensesSummary] = useState(0);
  const netSavingsSummary = totalIncomeSummary - totalExpensesSummary;

  useEffect(() => {
    if (!user || !db) {
      setTotalIncomeSummary(0);
      return;
    }
    const incomesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/incomes`);
    const unsubscribe = onSnapshot(incomesCollectionRef, (snapshot) => {
      const sum = snapshot.docs.reduce((acc, doc) => acc + (parseFloat(String(doc.data().incomeAmount)) || 0), 0);
      setTotalIncomeSummary(sum);
    }, (error) => {
      console.error("Error fetching total income for dashboard summary:", error);
    });
    return () => unsubscribe();
  }, [user, db, appId]);

  useEffect(() => {
    if (!user || !db) {
      setTotalExpensesSummary(0);
      return;
    }
    const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/expenses`);
    const unsubscribe = onSnapshot(expensesCollectionRef, (snapshot) => {
      const sum = snapshot.docs.reduce((acc, doc) => acc + (parseFloat(String(doc.data().expenseAmount)) || 0), 0);
      setTotalExpensesSummary(sum);
    }, (error) => {
      console.error("Error fetching total expenses for dashboard summary:", error);
    });
    return () => unsubscribe();
  }, [user, db, appId]);


  return (
    <PageLayout title="Profile">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-xl font-semibold text-gray-800 mb-4">Your Information</h3>
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label htmlFor="profileName" className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  id="profileName"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-md cursor-not-allowed"
                  value={userEmail}
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">Email cannot be changed here.</p>
              </div>
              <div>
                <label htmlFor="phoneNumber" className="block text-sm font-medium text-gray-700 mb-1">Phone Number (Optional)</label>
                <input
                  type="tel"
                  id="phoneNumber"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="e.g., +639171234567"
                />
              </div>

              <h4 className="text-lg font-semibold text-gray-800 mt-6 pt-4 border-t">Notification Settings</h4>
              <div className="space-y-2">
                <div className="flex items-center">
                  <input
                    id="emailNotifications"
                    type="checkbox"
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    checked={receiveEmailNotifications}
                    onChange={(e) => setReceiveEmailNotifications(e.target.checked)}
                  />
                  <label htmlFor="emailNotifications" className="ml-2 block text-sm text-gray-900">
                    Receive notifications via Email
                  </label>
                </div>
                <div className="flex items-center">
                  <input
                    id="phoneNotifications"
                    type="checkbox"
                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                    checked={receivePhoneNotifications}
                    onChange={(e) => setReceivePhoneNotifications(e.target.checked)}
                  />
                  <label htmlFor="phoneNotifications" className="ml-2 block text-sm text-gray-900">
                    Receive notifications via Phone (SMS)
                  </label>
                </div>
              </div>


              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={handleCancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 transition duration-300 ease-in-out"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition duration-300 ease-in-out transform hover:scale-105"
                >
                  Save Changes
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">Name:</span> {user?.displayName || 'N/A'}
              </p>
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">Email:</span> {user?.email || 'N/A'}
              </p>
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">Phone Number:</span> {phoneNumber || 'N/A'}
              </p>
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">User ID:</span> {user?.uid || 'N/A'}
              </p>

              <h4 className="text-lg font-semibold text-gray-800 mt-6 pt-4 border-t">Notification Settings</h4>
              <p className="text-gray-700 text-sm">
                Email Notifications: <span className="font-medium">{receiveEmailNotifications ? 'Enabled' : 'Disabled'}</span>
              </p>
              <p className="text-gray-700 text-sm">
                Phone Notifications: <span className="font-medium">{receivePhoneNotifications ? 'Enabled' : 'Disabled'}</span>
              </p>

              <div className="mt-6">
                <button
                  onClick={handleEditClick}
                  className="bg-purple-600 text-white py-2 px-4 rounded-md hover:bg-purple-700 transition duration-300 ease-in-out"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md border-b-2 border-purple-500">
          <h3 className="text-xl font-semibold text-gray-800 mb-4 border-b pb-2">Your Financial Summary</h3>
          <div className="grid grid-cols-1 gap-4 mt-4">
            <div className="bg-green-50 p-4 rounded-lg shadow-sm border border-green-200">
              <h4 className="font-semibold text-green-800 mb-2">Total Income</h4>
              <p className="text-2xl font-bold text-green-900">
                {totalIncomeSummary.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg shadow-sm border border-red-200">
              <h4 className="font-semibold text-red-800 mb-2">Total Expenses</h4>
              <p className="text-2xl font-bold text-red-900">
                {totalExpensesSummary.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
            </div>
            <div className="bg-blue-50 p-4 rounded-lg shadow-sm border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2">Net Savings</h4>
              <p className="text-2xl font-bold text-blue-900">
                {netSavingsSummary.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};


/**
 * History Page Component
 */
const History = () => {
  const { user, db, appId, setIsLoading: setGlobalIsLoading } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [salaryDetails, setSalaryDetails] = useState<SalaryDetails | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');

  const closeMessageBox = () => setMessage('');

  useEffect(() => {
    if (!user || !db) { setExpenses([]); return; }
    const expensesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/expenses`);
    const unsubscribe = onSnapshot(expensesCollectionRef, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<ExpenseEntry, 'id'>,
        expenseDate: doc.data().expenseDate instanceof Timestamp ? doc.data().expenseDate.toDate() : doc.data().expenseDate as Date,
        createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : doc.data().createdAt as Date
      })));
    }, (error) => {
      console.error("Error fetching history expenses:", error);
      setMessage(`Error fetching expenses for history: ${(error as Error).message}`);
      setMessageType('error');
    });
    return () => unsubscribe();
  }, [user, db, appId]);

  useEffect(() => {
    if (!user || !db) { setIncomes([]); return; }
    const incomesCollectionRef = collection(db, `artifacts/${appId}/users/${user.uid}/incomes`);
    const unsubscribe = onSnapshot(incomesCollectionRef, (snapshot) => {
      setIncomes(snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<IncomeEntry, 'id'>,
        incomeDate: doc.data().incomeDate instanceof Timestamp ? doc.data().incomeDate.toDate() : doc.data().incomeDate as Date,
        createdAt: doc.data().createdAt instanceof Timestamp ? doc.data().createdAt.toDate() : doc.data().createdAt as Date
      })));
    }, (error) => {
      console.error("Error fetching history incomes:", error);
      setMessage(`Error fetching incomes for history: ${(error as Error).message}`);
      setMessageType('error');
    });
    return () => unsubscribe();
  }, [user, db, appId]);

  useEffect(() => {
    if (!user || !db) { setSalaryDetails(null); return; }
    const salaryDocRef = doc(db, `artifacts/${appId}/users/${user.uid}/salary/details`);
    const unsubscribe = onSnapshot(salaryDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SalaryDetails;
        setSalaryDetails({
          ...data,
          lastUpdated: data.lastUpdated instanceof Timestamp ? data.lastUpdated.toDate() : data.lastUpdated as Date
        });
      } else {
        setSalaryDetails(null);
      }
    }, (error) => {
      console.error("Error fetching history salary details:", error);
      setMessage(`Error fetching salary details for history: ${(error as Error).message}`);
      setMessageType('error');
    });
    return () => unsubscribe();
  }, [user, db, appId]);


  const convertToCSV = (data: any, type: 'expenses' | 'incomes' | 'salary') => {
    const csvRows = [];
    if (type === 'expenses') {
      const headers = ['ID', 'Name', 'Category', 'Amount', 'Date', 'Added On'];
      csvRows.push(headers.join(','));
      (data as ExpenseEntry[]).forEach(item => {
        const row = [
          item.id,
          item.name,
          item.category,
          item.expenseAmount,
          (item.expenseDate instanceof Date || item.expenseDate instanceof Timestamp) ? (item.expenseDate instanceof Timestamp ? item.expenseDate.toDate().toLocaleDateString() : item.expenseDate.toLocaleDateString()) : '',
          (item.createdAt instanceof Date || item.createdAt instanceof Timestamp) ? (item.createdAt instanceof Timestamp ? item.createdAt.toDate().toLocaleDateString() : item.createdAt.toLocaleDateString()) : ''
        ];
        csvRows.push(row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    } else if (type === 'incomes') {
      const headers = ['ID', 'Business Name', 'Industry', 'Amount', 'Date Received', 'Added On'];
      csvRows.push(headers.join(','));
      (data as IncomeEntry[]).forEach(item => {
        const row = [
          item.id,
          item.businessName,
          item.industry,
          item.incomeAmount,
          (item.incomeDate instanceof Date || item.incomeDate instanceof Timestamp) ? (item.incomeDate instanceof Timestamp ? item.incomeDate.toDate().toLocaleDateString() : item.incomeDate.toLocaleDateString()) : '',
          (item.createdAt instanceof Date || item.createdAt instanceof Timestamp) ? (item.createdAt instanceof Timestamp ? item.createdAt.toDate().toLocaleDateString() : item.createdAt.toLocaleDateString()) : ''
        ];
        csvRows.push(row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      });
    } else if (type === 'salary') {
      const headers = [
        'Gross Salary', 'Frequency', 'Payday', 'Days Off Per Week',
        'SSS Deduction', 'Philhealth Deduction', 'Pag-ibig Deduction',
        'Tax Deduction', 'Loans Deduction', 'Voluntary Deduction', 'Last Updated'
      ];
      csvRows.push(headers.join(','));
      const salaryData = data as SalaryDetails;
      if (salaryData) {
        const row = [
          salaryData.salary || 0,
          salaryData.frequency || '',
          salaryData.paydaySpecific || '',
          salaryData.dayOffInMonth || '',
          salaryData.sss || 0,
          salaryData.philhealth || 0,
          salaryData.pagibig || 0,
          salaryData.tax || 0,
          salaryData.loans || 0,
          salaryData.voluntary || 0,
          (salaryData.lastUpdated instanceof Date || salaryData.lastUpdated instanceof Timestamp) ? (salaryData.lastUpdated instanceof Timestamp ? salaryData.lastUpdated.toDate().toLocaleDateString() : salaryData.lastUpdated.toLocaleDateString()) : ''
        ];
        csvRows.push(row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));
      }
    }
    return csvRows.join('\n');
  };

  const handleDownloadCSV = () => {
    setGlobalIsLoading(true);
    setMessage('');

    try {
      let fullCSVContent = '';

      if (expenses.length > 0) {
        fullCSVContent += "--- Expenses ---\n";
        fullCSVContent += convertToCSV(expenses, 'expenses') + '\n\n';
      }

      if (incomes.length > 0) {
        fullCSVContent += "--- Incomes ---\n";
        fullCSVContent += convertToCSV(incomes, 'incomes') + '\n\n';
      }

      if (salaryDetails) {
        fullCSVContent += "--- Salary Details ---\n";
        fullCSVContent += convertToCSV(salaryDetails, 'salary') + '\n\n';
      }

      if (!fullCSVContent) {
        setMessage('No data available to download.');
        setMessageType('info');
        setGlobalIsLoading(false);
        return;
      }

      const blob = new Blob([fullCSVContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'expense_tracker_history.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        setMessage('Your data has been downloaded!');
        setMessageType('success');
      } else {
        setMessage('Your browser does not support downloading files directly.');
        setMessageType('error');
      }
    } catch (error: unknown) {
      let errorMessage = 'Error generating CSV.';
      if (error instanceof Error) {
        errorMessage = `Error generating CSV: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("CSV download error:", error);
    } finally {
      setGlobalIsLoading(false);
    }
  };


  return (
    <PageLayout title="History">
      <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
      <p className="text-gray-700 mb-6">
        View your complete financial history and download it as a CSV file for offline analysis.
      </p>

      <button
        onClick={handleDownloadCSV}
        className="bg-blue-600 text-white py-2 px-6 rounded-md hover:bg-blue-700 transition duration-300 ease-in-out transform hover:scale-105 mb-8"
      >
        Download All Data as CSV
      </button>

      <div className="space-y-8">
        {expenses.length > 0 && (
          <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Expense History ({expenses.length} entries)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {expenses.map((expense: ExpenseEntry) => (
                    <tr key={expense.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{expense.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.category}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{expense.expenseAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(expense.expenseDate instanceof Timestamp ? expense.expenseDate.toDate() : expense.expenseDate as Date)?.toLocaleDateString() || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {incomes.length > 0 && (
          <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Income History ({incomes.length} entries)</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business Name</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Industry</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date Received</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {incomes.map((income: IncomeEntry) => (
                    <tr key={income.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{income.businessName}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{income.industry}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{(income.incomeDate instanceof Timestamp ? income.incomeDate.toDate() : income.incomeDate as Date)?.toLocaleDateString() || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{income.incomeAmount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {salaryDetails && (
          <div className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Salary Details</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gross Salary</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Frequency</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payday</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Days Off / Week</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Deductions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  <tr>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{salaryDetails.salary?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{salaryDetails.frequency}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{salaryDetails.paydaySpecific}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{salaryDetails.dayOffInMonth}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {( (salaryDetails.sss || 0) + (salaryDetails.philhealth || 0) + (salaryDetails.pagibig || 0) + (salaryDetails.tax || 0) + (salaryDetails.loans || 0) + (salaryDetails.voluntary || 0) ).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                    </td>
                  </tr>
                </tbody>
              </table>
              <p className="text-gray-500 text-sm mt-4">
                Deductions: SSS: {salaryDetails.sss?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, Philhealth: {salaryDetails.philhealth?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, Pag-ibig: {salaryDetails.pagibig?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, Tax: {salaryDetails.tax?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, Loans: {salaryDetails.loans?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}, Voluntary: {salaryDetails.voluntary?.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </p>
          </div>
          </div>
        )}

        {expenses.length === 0 && incomes.length === 0 && !salaryDetails && (
          <p className="text-gray-600 p-4 bg-gray-50 rounded-lg border border-gray-200 text-center">
            No financial history recorded yet. Add some data on the other pages!
          </p>
        )}
      </div>
    </PageLayout>
  );
};


/**
 * Main App Component
 */
const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | 'info'>('info');
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // New state for sidebar

  const [totalBankBalance, setTotalBankBalance] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [salaryDetails, setSalaryDetails] = useState<SalaryDetails | null>(null);
  const [upcomingIncome, setUpcomingIncome] = useState(0);
  const [monthlyNetCashFlow, setMonthlyNetCashFlow] = useState(0);


  useEffect(() => {
    if (!auth) {
      setMessage('Firebase Authentication is not initialized. Please check Firebase config and console for errors.');
      setMessageType('error');
      setLoading(false);
      return;
    }

    const signIn = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
          console.log("Signed in with custom token.");
        } else {
          // No anonymous sign-in, user will be directed to login/signup
          console.log("No initial auth token. User will be directed to login/signup.");
        }
      } catch (error: unknown) {
        setMessageType('error');
        let errorMessage = `Firebase Auth Error: ${(error as Error).message}`;
        if (error instanceof Error) {
          const firebaseErrorCode = (error as { code?: string }).code;
          if (firebaseErrorCode === 'auth/operation-not-allowed') {
            errorMessage = 'Authentication method (e.g., Anonymous or Email/Password) is not enabled in your Firebase project. Please check Firebase Console > Authentication > Sign-in method.';
          } else if (firebaseErrorCode === 'auth/api-key-not-valid') {
              errorMessage = 'Firebase API key is not valid. Please ensure your Firebase config in App.tsx is correct and authorized domains are set in Firebase Console.';
          } else if (firebaseErrorCode === 'auth/admin-restricted-operation') {
            errorMessage = 'Admin restricted operation. This usually means the authentication method used (e.g., Anonymous, Email/Password) is not enabled in your Firebase project settings (Authentication > Sign-in method).';
          }
        }
        setMessage(errorMessage);
        console.error("Firebase initial sign-in error:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);

      if (currentUser) {
        setCurrentPage('dashboard');
      } else {
        setCurrentPage('auth');
      }
    });

    signIn();

    return () => unsubscribe();
  }, []);


  useEffect(() => {
    if (!user || !db) {
      setTotalBankBalance(0);
      setTotalIncome(0);
      setTotalExpenses(0);
      setSalaryDetails(null);
      setUpcomingIncome(0);
      setMonthlyNetCashFlow(0);
      return;
    }

    const unsubscribeBanks = onSnapshot(collection(db, `artifacts/${appId}/users/${user.uid}/banks`), (snapshot) => {
      const sum = snapshot.docs.reduce((acc, doc) => acc + (parseFloat(String(doc.data().amount)) || 0), 0);
      setTotalBankBalance(sum);
    }, (error) => console.error("Error fetching bank balance:", error));

    const unsubscribeIncomes = onSnapshot(collection(db, `artifacts/${appId}/users/${user.uid}/incomes`), (snapshot) => {
      let currentTotal = 0;
      let currentUpcoming = 0;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      snapshot.docs.forEach(doc => {
        const incomeAmount = parseFloat(String(doc.data().incomeAmount)) || 0;
        const incomeDate = doc.data().incomeDate instanceof Timestamp ? doc.data().incomeDate.toDate() : doc.data().incomeDate;

        currentTotal += incomeAmount;

        if (incomeDate && (incomeDate instanceof Date) && incomeDate > today) {
          currentUpcoming += incomeAmount;
        }
      });
      setTotalIncome(currentTotal);
      setUpcomingIncome(currentUpcoming);
    }, (error) => console.error("Error fetching incomes:", error));

    const unsubscribeExpenses = onSnapshot(collection(db, `artifacts/${appId}/users/${user.uid}/expenses`), (snapshot) => {
      const sum = snapshot.docs.reduce((acc, doc) => acc + (parseFloat(String(doc.data().expenseAmount)) || 0), 0);
      setTotalExpenses(sum);
    }, (error) => console.error("Error fetching expenses:", error));

    const unsubscribeSalary = onSnapshot(doc(db, `artifacts/${appId}/users/${user.uid}/salary/details`), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as SalaryDetails;
        setSalaryDetails(data);

        const grossSalary = parseFloat(String(data.salary)) || 0;
        const sss = parseFloat(String(data.sss)) || 0;
        const philhealth = parseFloat(String(data.philhealth)) || 0;
        const pagibig = parseFloat(String(data.pagibig)) || 0;
        const tax = parseFloat(String(data.tax)) || 0;
        const loans = parseFloat(String(data.loans)) || 0;
        const voluntary = parseFloat(String(data.voluntary)) || 0;

        let estimatedMonthlyGross = 0;
        switch (data.frequency) {
          case 'Weekly':
            estimatedMonthlyGross = grossSalary * (365 / 7 / 12);
            break;
          case 'Fortnightly':
            estimatedMonthlyGross = grossSalary * (365 / 14 / 12);
            break;
          case 'Monthly':
          default:
            estimatedMonthlyGross = grossSalary;
            break;
        }

        const totalFixedDeductions = sss + philhealth + pagibig + tax + loans + voluntary;
        const estimatedMonthlyNetSalary = estimatedMonthlyGross - totalFixedDeductions;

        setMonthlyNetCashFlow(estimatedMonthlyNetSalary);
      } else {
        setSalaryDetails(null);
        setMonthlyNetCashFlow(0);
      }
    }, (error) => console.error("Error fetching salary details:", error));

    return () => {
      unsubscribeBanks();
      unsubscribeIncomes();
      unsubscribeExpenses();
      unsubscribeSalary();
    };
  }, [user, db, appId]);


  const handleLogout = async () => {
    setIsGlobalLoading(true);
    try {
      if (auth) {
        await signOut(auth);
        setMessage('Logged out successfully.');
        setMessageType('success');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Firebase Authentication is not initialized. Cannot logout.');
      }
    } catch (error: unknown) {
      let errorMessage = 'Logout failed.';
      if (error instanceof Error) {
        errorMessage = `Logout failed: ${error.message}`;
      }
      setMessage(errorMessage);
      setMessageType('error');
      console.error("Logout error:", error);
    } finally {
      setIsGlobalLoading(false);
    }
  };

  const closeMessageBox = () => {
    setMessage('');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const renderPage = () => {
    if (!app || !auth || !db) {
      return (
        <div className="flex justify-center items-center h-screen bg-red-50">
          <MessageBox
            message="A critical error occurred: Firebase could not be initialized. Please check your Firebase configuration and network connection. See console for details."
            type="error"
            onClose={() => {}}
          />
        </div>
      );
    }

    if (loading) {
      return <LoadingSpinner />;
    }

    if (!user) {
      return <Auth />;
    }

    switch (currentPage) {
      case 'dashboard':
        return <Dashboard />;
      case 'banks':
        return <Banks />;
      case 'incomes':
        return <Incomes />;
      case 'salary':
        return <Salary />;
      case 'expenses':
        return <Expenses />;
      case 'profile':
        return <Profile />;
      case 'history':
        return <History />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <AuthContext.Provider value={{ user, handleLogout, db, appId, setIsLoading: setIsGlobalLoading, totalBankBalance, totalIncome, totalExpenses, salaryDetails, upcomingIncome, monthlyNetCashFlow }}>
      <div className="min-h-screen bg-gray-100 font-sans text-gray-900">
        <style>
          {`
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

            body {
              font-family: 'Inter', sans-serif;
            }

            /* Tailwind custom animation for fade-in effect */
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            .animate-fade-in {
              animation: fadeIn 0.3s ease-out forwards;
            }
          `}
        </style>
        <script src="https://cdn.tailwindcss.com"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/recharts/2.12.0/recharts.min.js"></script>

        {user && <Navbar toggleSidebar={toggleSidebar} user={user} />}
        {user && (
          <Sidebar
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            setCurrentPage={setCurrentPage}
            user={user}
            handleLogout={handleLogout}
          />
        )}

        <MessageBox message={message} type={messageType} onClose={closeMessageBox} />
        <main className="flex-grow p-4">
          {renderPage()}
        </main>
        {isGlobalLoading && <FullPageSpinnerOverlay />}
      </div>
    </AuthContext.Provider>
  );
};

export default App;
