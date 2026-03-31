export type Branch = "Imus" | "Quezon City";

export type Role = "Super Admin" | "Branch Staff";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  branch?: Branch;
  permissions: string[];
  active: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  branch: Branch;
  imageUrl: string;
  status: "IN STOCK" | "LOW STOCK" | "OUT OF STOCK";
  inclusions?: string[];
  isSale?: boolean;
  salePrice?: number;
  personInCharge?: string;
  barcode?: string;
}

export interface CartItem extends Product {
  quantity: number;
  cartInclusions?: string[];
}

export interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  inclusions: string[];
}

export interface Transaction {
  id: string;
  items: TransactionItem[];
  subtotal: number;
  tax: number;
  discount: number;
  discountReason?: string;
  total: number;
  paymentMethod: string;
  customerName?: string;
  customerEmail?: string;
  staffName: string;
  branch: Branch;
  timestamp: any;
  isRefunded?: boolean;
}

export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  staffName: string;
  branch: Branch;
  timestamp: any;
}

export interface Booking {
  id: string;
  customerName: string;
  contact: string;
  email: string;
  instrumentType: string;
  instrumentModel: string;
  serviceType: string;
  description: string;
  preferredDate: string;
  branch: Branch;
  status: "Pending" | "Ongoing" | "Completed" | "Claimed";
  technician?: string;
  progress: number;
  createdAt: any;
  notes?: string;
}

export interface InventoryLog {
  id: string;
  productId: string;
  productName: string;
  delta: number;
  type: "IN" | "OUT" | "ADJUSTMENT";
  personInCharge: string;
  branch: Branch;
  timestamp: any;
  reason?: string;
}
