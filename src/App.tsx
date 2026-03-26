/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { 
  signInWithPopup, 
  onAuthStateChanged, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  Timestamp, 
  orderBy,
  setDoc,
  getDoc,
  getDocFromServer
} from 'firebase/firestore';
import { 
  Plus, 
  Trash2, 
  ShoppingCart, 
  LogOut, 
  ChefHat, 
  Utensils, 
  Clock, 
  CheckCircle2, 
  Camera,
  X,
  Edit2,
  ChevronRight,
  User as UserIcon,
  Sparkles,
  RefreshCw,
  Cat,
  PawPrint
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { auth, db, googleProvider } from './firebase';
import { Dish, Order, OrderItem, UserProfile } from './types';
import { cn } from './lib/utils';

// --- AI Service ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function getHealthyRecommendations() {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: "为家庭菜单生成5个健康菜品推荐。用户喜欢西兰花、银鳕鱼、芦笋、牛肉等健康食材。每个菜品包含：名称(name)、描述(description)、分类(category: Chinese, Western, French, Japanese, Dessert, Drink, Breakfast, Lunch, Dinner, 或 Snack)、以及一个建议的图片搜索关键词(imageQuery)。",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            category: { type: Type.STRING, enum: ['Chinese', 'Western', 'French', 'Japanese', 'Dessert', 'Drink', 'Breakfast', 'Lunch', 'Dinner', 'Snack'] },
            imageQuery: { type: Type.STRING }
          },
          required: ['name', 'description', 'category', 'imageQuery']
        }
      }
    }
  });
  return JSON.parse(response.text);
}

const CATEGORY_LABELS: Record<Dish['category'], string> = {
  Lunch: '午餐',
  Snack: '小吃',
  Creative: '创意菜'
};

// --- Components ---

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: any;
}

class ErrorBoundary extends (Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const { hasError, error } = this.state;
    if (hasError) {
      let errorMessage = "出错了，请稍后再试。";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error) errorMessage = `操作失败: ${parsed.error}`;
      } catch (e) {
        // Not a JSON error
      }

      return (
        <div className="min-h-screen bg-[#F5F5F0] flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white p-12 rounded-3xl shadow-xl border border-[#E6E6D6]">
            <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
              <X className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-serif font-bold text-[#5A5A40] mb-4">抱歉，出了点问题</h2>
            <p className="text-[#8E8E7E] mb-8">{errorMessage}</p>
            <Button onClick={() => window.location.reload()} className="w-full">
              刷新页面
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const Button = ({ 
  className, 
  variant = 'primary', 
  size = 'md', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}) => {
  const variants = {
    primary: 'bg-[#C17D5C] text-white hover:bg-[#A66A4D] shadow-md shadow-[#C17D5C]/10',
    secondary: 'bg-[#E8D5B5] text-[#8B5E3C] hover:bg-[#DBC6A3]',
    outline: 'border-2 border-[#C17D5C] text-[#C17D5C] hover:bg-[#C17D5C] hover:text-white',
    ghost: 'text-[#C17D5C] hover:bg-[#E8D5B5]/30',
    danger: 'bg-[#B56B6B] text-white hover:bg-[#9E5A5A]',
  };
  const sizes = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };
  return (
    <button 
      className={cn(
        'rounded-full font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
};

const Input = ({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input 
    className={cn(
      'w-full px-5 py-3 rounded-2xl border border-[#E8D5B5] focus:border-[#C17D5C] focus:ring-4 focus:ring-[#C17D5C]/5 outline-none transition-all bg-white/60 backdrop-blur-md',
      className
    )}
    {...props}
  />
);

const Select = ({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <select 
    className={cn(
      'w-full px-5 py-3 rounded-2xl border border-[#E8D5B5] focus:border-[#C17D5C] focus:ring-4 focus:ring-[#C17D5C]/5 outline-none transition-all bg-white/60 backdrop-blur-md appearance-none',
      className
    )}
    {...props}
  >
    {children}
  </select>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cart, setCart] = useState<OrderItem[]>([]);
  const [isDishModalOpen, setIsDishModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'admin' | 'ai'>('menu');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showCatPop, setShowCatPop] = useState(false);

  const triggerCatPop = () => {
    setShowCatPop(true);
    setTimeout(() => setShowCatPop(false), 2000);
  };

  const fetchAiRecommendations = async () => {
    setIsAiLoading(true);
    try {
      const recs = await getHealthyRecommendations();
      setAiRecommendations(recs);
    } catch (error) {
      console.error('AI Error:', error);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ai' && aiRecommendations.length === 0) {
      fetchAiRecommendations();
    }
  }, [activeTab]);

  // Test connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Sync user profile
        const userRef = doc(db, 'users', u.uid);
        try {
          const userSnap = await getDoc(userRef);
          
          const isDefaultAdmin = u.email === 'liyuqing5023@gmail.com';
          
          const profileData: UserProfile = {
            uid: u.uid,
            displayName: u.displayName || 'Family Member',
            email: u.email || '',
            photoURL: u.photoURL || '',
            role: userSnap.exists() ? userSnap.data().role : (isDefaultAdmin ? 'admin' : 'member')
          };

          if (!userSnap.exists()) {
            await setDoc(userRef, profileData);
          }
          setProfile(profileData);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) return;

    const dishesQuery = query(collection(db, 'dishes'), orderBy('createdAt', 'desc'));
    const unsubscribeDishes = onSnapshot(dishesQuery, (snapshot) => {
      setDishes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dish)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'dishes');
    });

    const ordersQuery = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
      setOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });

    return () => {
      unsubscribeDishes();
      unsubscribeOrders();
    };
  }, [user]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addToCart = (dish: Dish) => {
    setCart(prev => {
      const existing = prev.find(item => item.dishId === dish.id);
      if (existing) {
        return prev.map(item => 
          item.dishId === dish.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { dishId: dish.id!, name: dish.name, quantity: 1 }];
    });
  };

  const removeFromCart = (dishId: string) => {
    setCart(prev => prev.filter(item => item.dishId !== dishId));
  };

  const placeOrder = async () => {
    if (!user || cart.length === 0) return;
    setIsPlacingOrder(true);
    const path = 'orders';
    try {
      const newOrder: Omit<Order, 'id'> = {
        userId: user.uid,
        userName: user.displayName || 'Family Member',
        items: cart,
        status: 'pending',
        createdAt: Timestamp.now()
      };
      await addDoc(collection(db, path), newOrder);
      setCart([]);
      setActiveTab('orders');
      triggerCatPop();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setIsPlacingOrder(false);
    }
  };

  const saveDish = async (dishData: Partial<Dish>) => {
    if (!user) return;
    const path = 'dishes';
    // Remove undefined fields to avoid Firestore errors
    const cleanData = Object.fromEntries(
      Object.entries(dishData).filter(([_, v]) => v !== undefined)
    );
    try {
      if (editingDish?.id) {
        await updateDoc(doc(db, path, editingDish.id), cleanData);
      } else {
        const fullDish = {
          ...cleanData,
          creatorId: user.uid,
          createdAt: Timestamp.now()
        };
        await addDoc(collection(db, path), fullDish as any);
      }
      setIsDishModalOpen(false);
      setEditingDish(null);
      triggerCatPop();
    } catch (error) {
      handleFirestoreError(error, editingDish?.id ? OperationType.UPDATE : OperationType.CREATE, path);
    }
  };

  const deleteDish = async (id: string) => {
    if (deletingId !== id) {
      setDeletingId(id);
      // Auto-reset after 3 seconds
      setTimeout(() => setDeletingId(null), 3000);
      return;
    }

    const path = `dishes/${id}`;
    try {
      await deleteDoc(doc(db, 'dishes', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, path);
    }
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    const path = `orders/${orderId}`;
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, path);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9F7F2] flex flex-col items-center justify-center p-6">
        <motion.div
          animate={{ 
            rotate: [0, -10, 10, -10, 0],
            scale: [1, 1.1, 1, 1.1, 1]
          }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-[#C17D5C] mb-6"
        >
          <Cat size={64} strokeWidth={1.5} />
        </motion.div>
        <div className="space-y-2 text-center">
          <h2 className="text-xl font-serif font-bold text-[#8B5E3C]">喵呜... 正在准备中</h2>
          <p className="text-[#8B5E3C]/40 text-[10px] font-black uppercase tracking-widest">猫咪大厨正在为您加载灵感</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#F9F7F2] flex flex-col items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-12 rounded-3xl shadow-xl border border-[#E8D5B5]/30"
        >
          <div className="w-24 h-24 bg-[#E8D5B5]/30 rounded-full flex items-center justify-center mx-auto mb-8 relative">
            <Cat className="w-12 h-12 text-[#C17D5C]" />
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute -top-2 -right-2 bg-[#C17D5C] text-white p-2 rounded-full shadow-lg"
            >
              <PawPrint size={16} />
            </motion.div>
          </div>
          <h1 className="text-4xl font-serif font-bold text-[#8B5E3C] mb-4 tracking-tight">笛子与清子家宴定制</h1>
          <p className="text-[#8B5E3C]/60 mb-10 leading-relaxed text-sm">
            喵！欢迎来到猫咪的专属厨房。<br/>让我们一起探索美味的无限可能。
          </p>
          <Button onClick={handleLogin} size="lg" className="w-full py-6 rounded-3xl">
            开启美味之旅
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F9F7F2] text-[#3C3C3C] font-sans pb-32">
      {/* Mobile Header */}
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur-xl border-b border-[#E8D5B5]/20 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#C17D5C] rounded-2xl flex items-center justify-center text-white shadow-lg shadow-[#C17D5C]/20">
              <Cat size={20} />
            </div>
            <h1 className="text-xl font-serif font-bold text-[#8B5E3C] tracking-tight">笛子与清子家宴定制</h1>
          </div>
          <button onClick={handleLogout} className="w-10 h-10 flex items-center justify-center text-[#8B5E3C]/40 hover:text-[#B56B6B] transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6">
        {/* User Info Bar */}
        <div className="flex items-center justify-between mb-8 bg-white/40 p-4 rounded-3xl border border-[#E8D5B5]/20">
          <div className="flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 bg-[#E8D5B5]/30 rounded-full flex items-center justify-center text-[#C17D5C]">
                <UserIcon size={18} />
              </div>
            )}
            <div>
              <p className="text-xs text-[#8B5E3C]/50 font-bold uppercase tracking-wider">欢迎回来</p>
              <p className="text-sm font-bold text-[#8B5E3C]">{user.displayName}</p>
            </div>
          </div>
          <div className="bg-[#9A9B73]/10 text-[#9A9B73] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-[#9A9B73]/20">
            {user.email === 'liyuqing5023@gmail.com' ? '主理人' : '贵宾'}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              {/* Category Filter */}
              <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar -mx-6 px-6">
                <button
                  onClick={() => setSelectedCategory('All')}
                  className={cn(
                    'px-6 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border-2',
                    selectedCategory === 'All'
                      ? 'bg-[#C17D5C] border-[#C17D5C] text-white shadow-md shadow-[#C17D5C]/10'
                      : 'bg-white border-[#E8D5B5]/30 text-[#8B5E3C]/60 hover:border-[#C17D5C]/30'
                  )}
                >
                  全部
                </button>
                {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSelectedCategory(value as any)}
                    className={cn(
                      'px-6 py-2.5 rounded-2xl text-sm font-bold transition-all whitespace-nowrap border-2',
                      selectedCategory === value
                        ? 'bg-[#C17D5C] border-[#C17D5C] text-white shadow-md shadow-[#C17D5C]/10'
                        : 'bg-white border-[#E8D5B5]/30 text-[#8B5E3C]/60 hover:border-[#C17D5C]/30'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6">
                {dishes.filter(d => selectedCategory === 'All' || d.category === selectedCategory).length === 0 ? (
                  <div className="py-20 text-center bg-white/40 rounded-2xl border-2 border-dashed border-[#E8D5B5]/30">
                    <Utensils className="w-12 h-12 text-[#E8D5B5]/40 mx-auto mb-4" />
                    <p className="text-[#8B5E3C]/40 text-sm font-medium">该分类下还没有菜品</p>
                  </div>
                ) : (
                  dishes
                    .filter(d => selectedCategory === 'All' || d.category === selectedCategory)
                    .map((dish) => (
                      <motion.div
                        key={dish.id}
                        layout
                        className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#E8D5B5]/20 group active:scale-[0.98] transition-all duration-300"
                      >
                        <div className="aspect-[4/3] relative overflow-hidden">
                          <img 
                            src={dish.imageUrl} 
                            alt={dish.name} 
                            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute top-4 left-4">
                            <span className="bg-white/90 backdrop-blur-md text-[#C17D5C] px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border border-[#C17D5C]/10">
                              {CATEGORY_LABELS[dish.category]}
                            </span>
                          </div>
                        </div>
                        <div className="p-6">
                          <div className="flex justify-between items-start mb-2">
                            <h3 className="text-xl font-serif font-bold text-[#8B5E3C] tracking-tight">{dish.name}</h3>
                            <div className="flex items-center gap-1 text-[#9A9B73] font-bold">
                              <Sparkles size={14} />
                              <span className="text-[10px] uppercase tracking-wider">人气推荐</span>
                            </div>
                          </div>
                          <p className="text-[#8B5E3C]/60 text-sm mb-6 line-clamp-2 leading-relaxed">
                            {dish.description || '这道菜还没有描述，但一定很好吃！'}
                          </p>
                          <Button 
                            onClick={() => addToCart(dish)} 
                            className={cn(
                              "w-full rounded-2xl py-4 font-bold transition-all",
                              cart.some(i => i.dishId === dish.id) 
                                ? 'bg-[#E8D5B5]/30 text-[#8B5E3C] hover:bg-[#E8D5B5]/50' 
                                : 'bg-[#C17D5C] text-white hover:bg-[#A66A4D] shadow-md'
                            )}
                          >
                            {cart.some(i => i.dishId === dish.id) ? '已在清单中' : '加入清单'}
                          </Button>
                        </div>
                      </motion.div>
                    ))
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'orders' && (
            <motion.div
              key="orders"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-16"
            >
              {orders.length === 0 ? (
                <div className="py-20 text-center bg-white/50 rounded-3xl border-2 border-dashed border-[#FDE68A]">
                  <Clock className="w-16 h-16 text-[#FDE68A] mx-auto mb-4" />
                  <p className="text-[#92400E] font-medium">还没有点餐记录，去菜单看看吧！</p>
                </div>
              ) : (
                (Object.entries(
                  orders.reduce((acc, order) => {
                    const date = order.createdAt.toDate().toLocaleDateString('zh-CN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'long'
                    });
                    if (!acc[date]) acc[date] = [];
                    acc[date].push(order);
                    return acc;
                  }, {} as Record<string, Order[]>)
                ) as [string, Order[]][]).map(([date, dateOrders]) => {
                  // Calculate daily totals for admin
                  const dailyTotals: Record<string, number> = {};
                  dateOrders.forEach(order => {
                    order.items.forEach(item => {
                      dailyTotals[item.name] = (dailyTotals[item.name] || 0) + item.quantity;
                    });
                  });

                  return (
                    <div key={date} className="space-y-8">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-[#E8D5B5]/30" />
                        <h3 className="text-sm font-bold text-[#C17D5C] bg-white px-6 py-2 rounded-2xl border border-[#E8D5B5]/20 shadow-sm">
                          {date}
                        </h3>
                        <div className="h-px flex-1 bg-[#E8D5B5]/30" />
                      </div>

                      {/* Daily Summary */}
                      <div className="bg-white/60 p-6 rounded-2xl border border-[#E8D5B5]/20">
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-8 h-8 bg-[#C17D5C]/10 rounded-xl flex items-center justify-center text-[#C17D5C]">
                            <Utensils size={16} />
                          </div>
                          <h4 className="font-serif font-bold text-[#8B5E3C] text-lg">当日备餐汇总</h4>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          {Object.entries(dailyTotals).map(([name, count]) => (
                            <div key={name} className="flex justify-between items-center bg-white px-4 py-3 rounded-2xl border border-[#E8D5B5]/10 shadow-sm">
                              <span className="text-sm font-bold text-[#8B5E3C]">{name}</span>
                              <span className="bg-[#C17D5C]/10 text-[#C17D5C] px-2 py-0.5 rounded-lg text-[10px] font-black">x{count}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 gap-6">
                        {dateOrders.map((order) => (
                          <div key={order.id} className="bg-white p-6 rounded-2xl border border-[#E8D5B5]/20 shadow-sm flex flex-col">
                            <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-[#E8D5B5]/30 rounded-2xl flex items-center justify-center text-[#C17D5C]">
                                  <UserIcon size={20} />
                                </div>
                                <div>
                                  <h4 className="font-bold text-[#8B5E3C] text-sm">{order.userName}</h4>
                                  <p className="text-[10px] text-[#8B5E3C]/40 font-bold uppercase tracking-wider">
                                    {order.createdAt.toDate().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                              </div>
                              <span className={cn(
                                'px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-widest border',
                                order.status === 'pending' && 'bg-[#E8D5B5]/20 text-[#C17D5C] border-[#C17D5C]/10',
                                order.status === 'preparing' && 'bg-[#9A9B73]/10 text-[#9A9B73] border-[#9A9B73]/10',
                                order.status === 'ready' && 'bg-[#C17D5C]/10 text-[#C17D5C] border-[#C17D5C]/10',
                                order.status === 'completed' && 'bg-[#F9F7F2] text-[#8B5E3C]/40 border-[#E8D5B5]/20',
                              )}>
                                {order.status === 'pending' && '待处理'}
                                {order.status === 'preparing' && '制作中'}
                                {order.status === 'ready' && '已上桌'}
                                {order.status === 'completed' && '已完成'}
                              </span>
                            </div>
                            
                            <ul className="space-y-3 border-t border-[#F9F7F2] pt-6 flex-1">
                              {order.items.map((item, idx) => (
                                <li key={idx} className="flex justify-between items-center">
                                  <span className="flex items-center gap-2 text-sm font-medium text-[#8B5E3C]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#C17D5C]/30" />
                                    {item.name}
                                  </span>
                                  <span className="bg-[#F9F7F2] px-2.5 py-1 rounded-lg text-[10px] font-black text-[#8B5E3C]/60">x{item.quantity}</span>
                                </li>
                              ))}
                            </ul>

                            <div className="mt-8 pt-6 border-t border-[#F9F7F2] flex items-center gap-3">
                              <span className="text-[10px] font-black text-[#8B5E3C]/30 uppercase tracking-widest">状态更新</span>
                              <Select 
                                className="flex-1 py-2 text-xs font-bold rounded-xl border-[#E8D5B5]/30 bg-[#F9F7F2]/50"
                                value={order.status}
                                onChange={(e) => updateOrderStatus(order.id!, e.target.value as any)}
                              >
                                <option value="pending">待处理</option>
                                <option value="preparing">制作中</option>
                                <option value="ready">已上桌</option>
                                <option value="completed">已完成</option>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </motion.div>
          )}

          {activeTab === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-10"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-[#8B5E3C]">菜单管理</h2>
                  <p className="text-[#8B5E3C]/40 text-[10px] font-black uppercase tracking-widest mt-1">共 {dishes.length} 道家宴菜品</p>
                </div>
                <Button onClick={() => { setEditingDish(null); setIsDishModalOpen(true); }} className="rounded-2xl px-5 py-5 shadow-md">
                  <Plus size={20} />
                </Button>
              </div>

              {(Object.entries(
                dishes.reduce((acc, dish) => {
                  if (!acc[dish.category]) acc[dish.category] = [];
                  acc[dish.category].push(dish);
                  return acc;
                }, {} as Record<string, Dish[]>)
              ) as [Dish['category'], Dish[]][]).map(([cat, catDishes]) => (
                <div key={cat} className="space-y-6">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-bold text-[#C17D5C] bg-white px-4 py-1.5 rounded-xl border border-[#E8D5B5]/20 shadow-sm">{CATEGORY_LABELS[cat]}</h3>
                    <div className="h-px flex-1 bg-[#E8D5B5]/20" />
                    <span className="text-[10px] font-black text-[#8B5E3C]/30 uppercase tracking-widest">{catDishes.length} 道</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {catDishes.map((dish) => (
                      <div key={dish.id} className="bg-white p-4 rounded-2xl border border-[#E8D5B5]/20 shadow-sm flex gap-4 group active:scale-[0.98] transition-all">
                        <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-[#E8D5B5]/10">
                          <img src={dish.imageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                        <div className="flex-1 flex flex-col justify-between py-0.5">
                          <div>
                            <h3 className="font-bold text-[#8B5E3C] text-sm line-clamp-1">{dish.name}</h3>
                            <p className="text-[10px] text-[#8B5E3C]/40 line-clamp-1 mt-0.5">{dish.description || '暂无描述'}</p>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => { setEditingDish(dish); setIsDishModalOpen(true); }}
                              className="flex-1 bg-[#E8D5B5]/20 text-[#8B5E3C] py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-[#E8D5B5]/40 transition-colors flex items-center justify-center gap-1.5"
                            >
                              <Edit2 size={12} />
                              编辑
                            </button>
                            <button 
                              onClick={() => deleteDish(dish.id!)}
                              className={cn(
                                "px-3 py-2 rounded-xl transition-all flex items-center justify-center",
                                deletingId === dish.id 
                                  ? "bg-[#B56B6B] text-white w-24" 
                                  : "bg-[#B56B6B]/10 text-[#B56B6B] hover:bg-[#B56B6B]/20"
                              )}
                            >
                              {deletingId === dish.id ? (
                                <span className="text-[10px] font-black uppercase tracking-tighter">确认删除?</span>
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
          {activeTab === 'ai' && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-10"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-serif font-bold text-[#8B5E3C]">AI 灵感厨房</h2>
                  <p className="text-[#8B5E3C]/40 text-[10px] font-black uppercase tracking-widest mt-1">为您定制专属美味</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={fetchAiRecommendations}
                  disabled={isAiLoading}
                  className="rounded-2xl border-[#E8D5B5]/30 text-[#C17D5C] hover:bg-[#E8D5B5]/20"
                >
                  <RefreshCw size={16} className={cn(isAiLoading && "animate-spin")} />
                </Button>
              </div>

              {isAiLoading ? (
                <div className="grid grid-cols-1 gap-6">
                  {[1, 2].map(i => (
                    <div key={i} className="bg-white rounded-2xl p-8 border border-[#E8D5B5]/20 animate-pulse">
                      <div className="w-12 h-12 bg-[#E8D5B5]/20 rounded-2xl mb-6" />
                      <div className="h-6 bg-[#E8D5B5]/20 rounded-xl w-3/4 mb-4" />
                      <div className="h-4 bg-[#E8D5B5]/20 rounded-lg w-full mb-2" />
                      <div className="h-4 bg-[#E8D5B5]/20 rounded-lg w-5/6 mb-8" />
                      <div className="h-12 bg-[#E8D5B5]/20 rounded-2xl w-full" />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {aiRecommendations.map((rec, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="bg-white rounded-2xl p-8 border border-[#E8D5B5]/20 shadow-sm relative overflow-hidden group"
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-[#9A9B73]/5 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110" />
                      <div className="flex justify-between items-start mb-6">
                        <div className="w-12 h-12 bg-[#9A9B73]/10 rounded-2xl flex items-center justify-center text-[#9A9B73] group-hover:scale-110 transition-transform">
                          <Sparkles size={24} />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#C17D5C] bg-[#E8D5B5]/20 px-3 py-1 rounded-xl border border-[#C17D5C]/10">
                          {CATEGORY_LABELS[rec.category as Dish['category']] || rec.category}
                        </span>
                      </div>
                      <h3 className="text-xl font-serif font-bold text-[#8B5E3C] mb-2">{rec.name}</h3>
                      <p className="text-[#8B5E3C]/60 text-sm mb-8 leading-relaxed line-clamp-3 min-h-[3.75rem]">
                        {rec.description}
                      </p>
                      <Button 
                        variant="secondary" 
                        className="w-full rounded-2xl py-4 font-bold"
                        onClick={() => {
                          setEditingDish({
                            name: rec.name,
                            description: rec.description,
                            category: rec.category,
                            imageUrl: `https://picsum.photos/seed/${rec.imageQuery}/800/600`,
                            creatorId: user.uid,
                            createdAt: Timestamp.now()
                          });
                          setIsDishModalOpen(true);
                        }}
                      >
                        添加到菜单
                      </Button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-2xl border-t border-[#E8D5B5]/20 pb-safe">
        <div className="max-w-2xl mx-auto flex justify-around items-center h-20 px-4">
          {[
            { id: 'menu', label: '菜单', icon: Utensils },
            { id: 'orders', label: '记录', icon: Clock },
            { id: 'admin', label: '管理', icon: ChefHat },
            { id: 'ai', label: '灵感', icon: Sparkles },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                'flex flex-col items-center gap-1.5 transition-all w-16',
                activeTab === tab.id 
                  ? 'text-[#C17D5C]' 
                  : 'text-[#8B5E3C]/40 hover:text-[#8B5E3C]'
              )}
            >
              <div className={cn(
                'p-2 rounded-2xl transition-all',
                activeTab === tab.id && 'bg-[#C17D5C]/10'
              )}>
                <tab.icon size={22} strokeWidth={activeTab === tab.id ? 2.5 : 2} />
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Cat Pop-up Animation */}
      <AnimatePresence>
        {showCatPop && (
          <motion.div
            initial={{ y: 200, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: 200, x: '-50%', opacity: 0 }}
            className="fixed bottom-0 left-1/2 z-50 pointer-events-none"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, -5, 5, -5, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
                className="bg-white p-6 rounded-t-[48px] border-x-4 border-t-4 border-[#E8D5B5] shadow-2xl flex flex-col items-center"
              >
                <div className="text-[#C17D5C] mb-2">
                  <Cat size={80} strokeWidth={1.5} />
                </div>
                <div className="bg-[#C17D5C] text-white px-6 py-2 rounded-full font-black text-sm whitespace-nowrap mb-4">
                  喵！操作成功啦！
                </div>
                <div className="flex gap-4 mb-8">
                  <PawPrint size={24} className="text-[#E8D5B5]" />
                  <PawPrint size={24} className="text-[#E8D5B5] rotate-12" />
                  <PawPrint size={24} className="text-[#E8D5B5] -rotate-12" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cart Floating Bar */}
      <AnimatePresence>
        {cart.length > 0 && activeTab === 'menu' && (
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            exit={{ y: 100 }}
            className="fixed bottom-24 left-6 right-6 z-40"
          >
            <div className="max-w-2xl mx-auto bg-[#C17D5C] text-white p-4 rounded-3xl shadow-2xl shadow-[#C17D5C]/30 flex items-center justify-between gap-4 border border-white/10">
              <div className="flex items-center gap-4 overflow-hidden">
                <div className="relative flex-shrink-0">
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                    <ShoppingCart size={24} />
                  </div>
                  <span className="absolute -top-2 -right-2 bg-white text-[#C17D5C] w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow-md">
                    {cart.reduce((acc, i) => acc + i.quantity, 0)}
                  </span>
                </div>
                <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
                  {cart.map(item => (
                    <div key={item.dishId} className="flex items-center gap-2 bg-white/10 px-3 py-1.5 rounded-xl whitespace-nowrap border border-white/5">
                      <span className="text-xs font-bold tracking-tight">{item.name}</span>
                      <button onClick={() => removeFromCart(item.dishId)} className="hover:text-white/80 transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <button 
                onClick={placeOrder}
                disabled={isPlacingOrder}
                className="bg-white text-[#C17D5C] px-6 py-3 rounded-2xl font-black text-xs hover:bg-[#F9F7F2] transition-colors disabled:opacity-50 shadow-xl flex-shrink-0"
              >
                {isPlacingOrder ? '提交中...' : '确认点餐'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dish Modal */}
      <AnimatePresence>
        {isDishModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDishModalOpen(false)}
              className="absolute inset-0 bg-[#92400E]/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden border border-[#FFE4D1]"
            >
              <div className="p-10">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-3xl font-serif font-bold text-[#1D1D1F]">
                    {editingDish ? '编辑菜品' : '添加新菜品'}
                  </h2>
                  <button onClick={() => setIsDishModalOpen(false)} className="text-[#FF6B35]/50 hover:text-[#FF6B35] transition-colors">
                    <X size={28} />
                  </button>
                </div>

                <DishForm 
                  initialData={editingDish || undefined} 
                  onSave={saveDish} 
                  onCancel={() => setIsDishModalOpen(false)} 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </ErrorBoundary>
  );
}

function DishForm({ initialData, onSave, onCancel }: { 
  initialData?: Dish; 
  onSave: (data: Partial<Dish>) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [category, setCategory] = useState<Dish['category']>(initialData?.category || 'Lunch');
  const [imageUrl, setImageUrl] = useState(initialData?.imageUrl || '');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 600;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to JPEG with 0.7 quality
      };
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        if (base64.length > 500000) { // If larger than ~500KB, compress
          const compressed = await compressImage(base64);
          setImageUrl(compressed);
        } else {
          setImageUrl(base64);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    setIsSaving(true);
    let finalImageUrl = imageUrl || 'https://picsum.photos/seed/food/800/600';
    
    // Final safety check for base64 size
    if (finalImageUrl.startsWith('data:image') && finalImageUrl.length > 800000) {
      finalImageUrl = await compressImage(finalImageUrl);
    }

    try {
      await onSave({ 
        name, 
        description, 
        category, 
        imageUrl: finalImageUrl 
      });
    } catch (error) {
      console.error('Form Save Error:', error);
      // The ErrorBoundary or parent handleFirestoreError will handle the display
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#FF6B35]/60 uppercase tracking-widest ml-1">菜名</label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：红烧肉" />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-[#C17D5C]/60 uppercase tracking-widest ml-1">分类</label>
          <Select value={category} onChange={e => setCategory(e.target.value as any)}>
            <option value="Lunch">午餐</option>
            <option value="Snack">小吃</option>
            <option value="Creative">创意菜</option>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-[#FF6B35]/60 uppercase tracking-widest ml-1">描述</label>
        <textarea 
          className="w-full px-4 py-4 rounded-2xl border border-[#FFE4D1]/50 focus:border-[#FF6B35] focus:ring-4 focus:ring-[#FF6B35]/10 outline-none transition-all bg-[#FFF0E6]/50 backdrop-blur-sm min-h-[120px]"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="介绍一下这道菜..."
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold text-[#FF6B35]/60 uppercase tracking-widest ml-1">图片</label>
        <div className="flex gap-4">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 h-32 border-2 border-dashed border-[#FFE4D1] rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-[#FFF0E6] transition-all overflow-hidden bg-[#FFF0E6]/30"
          >
            {imageUrl ? (
              <img src={imageUrl} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <>
                <Camera className="text-[#FF6B35]/60 mb-2" />
                <span className="text-xs text-[#FF6B35]/60">上传图片</span>
              </>
            )}
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleImageUpload} 
            className="hidden" 
            accept="image/*"
          />
          <div className="flex-1 space-y-2">
            <Input 
              value={imageUrl} 
              onChange={e => setImageUrl(e.target.value)} 
              placeholder="或者输入图片 URL"
              className="text-sm"
            />
            <p className="text-[10px] text-[#FF6B35]/60 leading-tight">
              支持 URL 或本地上传。大图将自动压缩以符合存储限制 (1MB)。
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <Button variant="secondary" className="flex-1 py-6" onClick={onCancel} disabled={isSaving}>取消</Button>
        <Button 
          className="flex-1 py-6" 
          disabled={!name || isSaving}
          onClick={handleSubmit}
        >
          {isSaving ? '保存中...' : '保存菜品'}
        </Button>
      </div>
    </div>
  );
}
