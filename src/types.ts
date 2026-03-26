import { Timestamp } from 'firebase/firestore';

export interface Dish {
  id?: string;
  name: string;
  description?: string;
  category: 'Lunch' | 'Snack' | 'Creative';
  imageUrl: string;
  creatorId: string;
  createdAt: Timestamp;
}

export interface OrderItem {
  dishId: string;
  name: string;
  quantity: number;
}

export interface Order {
  id?: string;
  userId: string;
  userName: string;
  items: OrderItem[];
  status: 'pending' | 'preparing' | 'ready' | 'completed';
  createdAt: Timestamp;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: 'admin' | 'member';
}
