import React from 'react';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Wrench, 
  BarChart3, 
  BrainCircuit, 
  Users, 
  Settings, 
  LifeBuoy,
  Plus
} from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { id: 'inventory', label: 'Inventory', icon: Package, path: '/inventory' },
  { id: 'pos', label: 'Terminal POS', icon: ShoppingCart, path: '/pos' },
  { id: 'workshop', label: 'Luthier Workshop', icon: Wrench, path: '/workshop' },
  { id: 'analytics', label: 'Business Analytics', icon: BarChart3, path: '/analytics' },
  { id: 'dss', label: 'Fermata DSS', icon: BrainCircuit, path: '/dss' },
  { id: 'users', label: 'User Management', icon: Users, path: '/users' },
];

export const BOTTOM_NAV_ITEMS = [
  { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' },
  { id: 'support', label: 'Support', icon: LifeBuoy, path: '/support' },
];
