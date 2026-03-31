import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Minus, CreditCard, Banknote, Wallet, Smartphone,
  MoreHorizontal, ShoppingCart, Tag, X, CheckCircle2, User, Mail,
  Printer, RotateCcw, ChevronDown, Loader2, Trash2,
} from 'lucide-react';
import {
  collection, onSnapshot, query, addDoc, doc, updateDoc,
  increment, serverTimestamp, where, getDocs, orderBy, limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, CartItem, Transaction, Branch } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn, formatCurrency } from '../lib/utils';
import { useFirebase } from '../components/FirebaseProvider';

const CATEGORIES = [
  { id: '01', label: 'ALL' },
  { id: '02', label: 'GUITARS' },
  { id: '03', label: 'AMPS' },
  { id: '04', label: 'ACCESSORIES' },
  { id: '05', label: 'PARTS' },
  { id: '06', label: 'STRINGS' },
];

const PAYMENT_METHODS = [
  { id: 'Cash', label: 'CASH', icon: Banknote },
  { id: 'GCash', label: 'GCASH', icon: Smartphone },
  { id: 'Credit Card', label: 'CARD', icon: CreditCard },
  { id: 'Bank Transfer', label: 'BANK', icon: Wallet },
];

export default function POS() {
  const { userData } = useFirebase();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [activeCategory, setActiveCategory] = useState('01');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<Branch>(
    userData?.role === 'Super Admin' ? 'Imus' : (userData?.branch || 'Imus')
  );

  // Customer & transaction info
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');

  // Modals
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [showInclusionModal, setShowInclusionModal] = useState<{ show: boolean; itemId: string | null }>({ show: false, itemId: null });
  const [inclusionText, setInclusionText] = useState('');
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundTransactionId, setRefundTransactionId] = useState('');
  const [refundReason, setRefundReason] = useState('');

  const [isProcessing, setIsProcessing] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<any>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = userData?.role === 'Super Admin'
      ? query(collection(db, 'products'), where('branch', '==', selectedBranch))
      : query(collection(db, 'products'), where('branch', '==', userData?.branch || 'Imus'));

    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    return () => unsub();
  }, [userData, selectedBranch]);

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase());
    if (activeCategory === '01') return matchSearch;
    const catLabel = CATEGORIES.find(c => c.id === activeCategory)?.label.toLowerCase() || '';
    return matchSearch && p.category.toLowerCase().includes(catLabel);
  });

  const addToCart = (product: Product) => {
    if (product.stockQty <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stockQty) return prev;
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1, cartInclusions: [] }];
    });
  };

  const removeFromCart = (id: string) => setCart(prev => prev.filter(item => item.id !== id));

  const updateQty = (id: string, delta: number) => {
    setCart(prev => {
      return prev.reduce<CartItem[]>((acc, item) => {
        if (item.id !== id) { acc.push(item); return acc; }
        const product = products.find(p => p.id === id);
        const newQty = item.quantity + delta;
        if (newQty <= 0) return acc; // remove when hits 0
        if (product && newQty > product.stockQty) { acc.push(item); return acc; }
        acc.push({ ...item, quantity: newQty });
        return acc;
      }, []);
    });
  };

  const addInclusion = () => {
    if (showInclusionModal.itemId && inclusionText.trim()) {
      setCart(prev => prev.map(item => {
        if (item.id === showInclusionModal.itemId) {
          return { ...item, cartInclusions: [...(item.cartInclusions || []), inclusionText.trim()] };
        }
        return item;
      }));
      setInclusionText('');
      setShowInclusionModal({ show: false, itemId: null });
    }
  };

  const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const discountAmount = discountType === 'percent'
    ? subtotal * (discountValue / 100)
    : Math.min(discountValue, subtotal);
  const taxableAmount = subtotal - discountAmount;
  const tax = taxableAmount * 0.12;
  const total = taxableAmount + tax;

  const handleConfirmPayment = async () => {
    if (cart.length === 0 || isProcessing) return;
    setIsProcessing(true);
    try {
      const branch: Branch = (userData?.role === 'Super Admin' ? selectedBranch : userData?.branch) as Branch || 'Imus';
      const txData: Omit<Transaction, 'id'> = {
        items: cart.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          inclusions: item.cartInclusions || item.inclusions || [],
        })),
        subtotal,
        tax,
        discount: discountAmount,
        discountReason: discountReason || null,
        total,
        paymentMethod,
        customerName: customerName.trim() || null,
        customerEmail: customerEmail.trim() || null,
        staffName: userData?.name || 'Unknown',
        branch,
        timestamp: serverTimestamp(),
      };

      // Strip null/undefined before saving to Firestore
      const cleanTx = Object.fromEntries(
        Object.entries(txData).filter(([_, v]) => v !== undefined)
      );

      const txRef = await addDoc(collection(db, 'transactions'), cleanTx);

      // Deduct stock
      for (const item of cart) {
        await updateDoc(doc(db, 'products', item.id), {
          stockQty: increment(-item.quantity),
        });
        // Log inventory out
        await addDoc(collection(db, 'inventoryLogs'), {
          productId: item.id,
          productName: item.name,
          delta: -item.quantity,
          type: 'OUT',
          personInCharge: userData?.name || 'POS Staff',
          branch,
          timestamp: serverTimestamp(),
          reason: `POS Sale - TX: ${txRef.id.slice(-6).toUpperCase()}`,
        });
      }

      setLastTransaction({ ...txData, id: txRef.id });
      setCart([]);
      setDiscountValue(0);
      setDiscountReason('');
      setCustomerName('');
      setCustomerEmail('');
      setPaymentMethod('Cash');
      setShowSuccess(true);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefund = async () => {
    if (!refundTransactionId.trim() || !refundReason.trim()) return;
    try {
      const txQuery = query(
        collection(db, 'transactions'),
        where('__name__', '==', refundTransactionId.trim()),
        limit(1)
      );
      const snap = await getDocs(collection(db, 'transactions'));
      const txDoc = snap.docs.find(d => d.id === refundTransactionId.trim() || d.id.endsWith(refundTransactionId.trim()));

      if (!txDoc) { alert('Transaction not found. Check the transaction ID.'); return; }
      const txData = txDoc.data() as Transaction;
      if (txData.isRefunded) { alert('This transaction has already been refunded.'); return; }

      // Mark transaction as refunded
      await updateDoc(doc(db, 'transactions', txDoc.id), { isRefunded: true });

      // Restock items
      for (const item of txData.items) {
        await updateDoc(doc(db, 'products', item.productId), {
          stockQty: increment(item.quantity),
        });
        await addDoc(collection(db, 'inventoryLogs'), {
          productId: item.productId,
          productName: item.name,
          delta: item.quantity,
          type: 'IN',
          personInCharge: userData?.name || 'POS Staff',
          branch: txData.branch,
          timestamp: serverTimestamp(),
          reason: `Refund - TX: ${txDoc.id.slice(-6).toUpperCase()}`,
        });
      }

      // Log refund
      await addDoc(collection(db, 'refunds'), {
        transactionId: txDoc.id,
        amount: txData.total,
        reason: refundReason,
        staffName: userData?.name || 'Unknown',
        branch: txData.branch,
        timestamp: serverTimestamp(),
      });

      alert(`Refund of ${formatCurrency(txData.total)} processed successfully. Inventory restocked.`);
      setShowRefundModal(false);
      setRefundTransactionId('');
      setRefundReason('');
    } catch (error) {
      console.error('Refund error:', error);
      alert('Refund failed. Please try again.');
    }
  };

  const handlePrintReceipt = () => {
    if (!lastTransaction) return;
    const win = window.open('', '_blank', 'width=350,height=600');
    if (!win) return;
    win.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body{font-family:monospace;font-size:12px;padding:20px;max-width:320px;margin:auto;}
        .title{text-align:center;font-size:18px;font-weight:bold;letter-spacing:2px;margin-bottom:4px;}
        .sub{text-align:center;font-size:10px;margin-bottom:16px;color:#666;}
        .divider{border-top:1px dashed #999;margin:10px 0;}
        .row{display:flex;justify-content:space-between;margin-bottom:4px;}
        .total{font-size:16px;font-weight:bold;}
        .label{color:#666;font-size:10px;}
      </style></head><body>
      <div class="title">FERMATA</div>
      <div class="sub">${lastTransaction.branch} Branch</div>
      <div class="sub">TX: ${lastTransaction.id?.slice(-8).toUpperCase()}</div>
      <div class="divider"></div>
      ${lastTransaction.customerName ? `<div class="row"><span>Customer</span><span>${lastTransaction.customerName}</span></div>` : ''}
      <div class="row"><span>Staff</span><span>${lastTransaction.staffName}</span></div>
      <div class="row"><span>Payment</span><span>${lastTransaction.paymentMethod}</span></div>
      <div class="divider"></div>
      ${(lastTransaction.items || []).map((item: any) => `
        <div class="row"><span>${item.name} x${item.quantity}</span><span>${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(item.price * item.quantity)}</span></div>
        ${item.inclusions?.length ? `<div class="label">+ ${item.inclusions.join(', ')}</div>` : ''}
      `).join('')}
      <div class="divider"></div>
      <div class="row"><span>Subtotal</span><span>${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(lastTransaction.subtotal)}</span></div>
      ${lastTransaction.discount > 0 ? `<div class="row"><span>Discount</span><span>-${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(lastTransaction.discount)}</span></div>` : ''}
      <div class="row"><span>Tax (12%)</span><span>${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(lastTransaction.tax)}</span></div>
      <div class="divider"></div>
      <div class="row total"><span>TOTAL</span><span>${new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(lastTransaction.total)}</span></div>
      <div class="divider"></div>
      <div class="sub">Thank you for shopping at Fermata!</div>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>
    `);
    win.document.close();
  };

  return (
    <div className="flex h-full gap-8 relative animate-in fade-in duration-500">
      {/* Product Grid */}
      <div className="flex-1 flex flex-col gap-6 min-w-0">
        {/* Branch selector for Super Admin */}
        {userData?.role === 'Super Admin' && (
          <div className="flex items-center gap-4 p-4 bg-surface border border-border">
            <span className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">ACTIVE BRANCH:</span>
            <div className="flex gap-2">
              {(['Imus', 'Quezon City'] as Branch[]).map(b => (
                <button
                  key={b}
                  onClick={() => setSelectedBranch(b)}
                  className={cn(
                    'px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all',
                    selectedBranch === b ? 'bg-accent text-white' : 'text-text-secondary hover:text-white border border-border'
                  )}
                >{b}</button>
              ))}
            </div>
          </div>
        )}

        {/* Category Tabs */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex gap-6 overflow-x-auto">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'flex items-center gap-2 pb-2 border-b-2 transition-all whitespace-nowrap',
                  activeCategory === cat.id ? 'border-accent text-white' : 'border-transparent text-text-secondary hover:text-white'
                )}
              >
                <span className="text-[10px] font-bold text-accent">{cat.id}</span>
                <span className="text-xs font-bold uppercase tracking-widest">{cat.label}</span>
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
            <input
              type="text"
              placeholder="SCAN OR SEARCH..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-64 bg-surface border border-border pl-10 pr-4 py-2 text-[10px] uppercase tracking-widest focus:outline-none focus:border-accent"
            />
          </div>
        </div>

        {/* Product Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-1" style={{ maxHeight: 'calc(100vh - 300px)' }}>
          {filteredProducts.map(product => (
            <div
              key={product.id}
              className={cn(
                'bg-surface border border-border group cursor-pointer hover:border-accent transition-all',
                product.stockQty <= 0 && 'opacity-50 grayscale cursor-not-allowed'
              )}
              onClick={() => addToCart(product)}
            >
              <div className="aspect-[4/3] bg-background relative overflow-hidden">
                <img
                  src={product.imageUrl || `https://picsum.photos/seed/${product.sku}/400/300`}
                  alt={product.name}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  referrerPolicy="no-referrer"
                />
                <span className={cn(
                  'absolute top-3 right-3 px-2 py-1 text-[8px] font-bold uppercase tracking-widest',
                  product.stockQty <= 0 ? 'bg-black text-white' :
                    product.stockQty <= product.lowStockThreshold ? 'bg-accent text-white' :
                    'bg-surface-elevated text-text-secondary'
                )}>
                  {product.stockQty <= 0 ? 'OUT OF STOCK' : product.stockQty <= product.lowStockThreshold ? 'LOW STOCK' : 'IN STOCK'}
                </span>
                {product.isSale && (
                  <span className="absolute top-3 left-3 px-2 py-1 text-[8px] font-bold uppercase tracking-widest bg-amber-600 text-white">SALE</span>
                )}
              </div>
              <div className="p-4">
                <p className="text-[9px] text-text-secondary uppercase tracking-[0.2em] mb-1">{product.category} / {product.brand}</p>
                <h4 className="text-sm font-bold text-white tracking-wider mb-1 uppercase line-clamp-1">{product.name}</h4>
                {product.isSale && product.salePrice ? (
                  <div className="flex items-baseline gap-2">
                    <p className="text-lg font-bold text-accent">{formatCurrency(product.salePrice)}</p>
                    <p className="text-xs text-text-muted line-through">{formatCurrency(product.price)}</p>
                  </div>
                ) : (
                  <p className="text-lg font-bold text-accent">{formatCurrency(product.price)}</p>
                )}
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-3 flex items-center justify-center py-20">
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">NO PRODUCTS FOUND</p>
            </div>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 bg-status-green rounded-full animate-pulse"></div>
            <span className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">
              TERMINAL_01 · BRANCH: {(userData?.role === 'Super Admin' ? selectedBranch : userData?.branch)?.toUpperCase()}
            </span>
          </div>
          <button
            onClick={() => setShowRefundModal(true)}
            className="flex items-center gap-2 text-[10px] text-text-secondary hover:text-accent uppercase font-bold tracking-widest transition-colors"
          >
            <RotateCcw size={12} /> PROCESS REFUND
          </button>
        </div>
      </div>

      {/* POS Terminal Panel */}
      <div className="w-[380px] flex flex-col gap-4 flex-shrink-0">
        <Card className="flex-1 flex flex-col p-0">
          {/* Terminal Header */}
          <div className="p-5 border-b border-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-white tracking-widest uppercase">TERMINAL_01 · ACTIVE</h3>
              <MoreHorizontal size={18} className="text-text-secondary" />
            </div>

            {/* Customer Info */}
            <div className="space-y-3">
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                <input
                  type="text"
                  placeholder="CUSTOMER NAME (OPTIONAL)"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full bg-surface-elevated border border-border pl-9 pr-3 py-2.5 text-[10px] uppercase tracking-widest focus:outline-none focus:border-accent text-white"
                />
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={14} />
                <input
                  type="email"
                  placeholder="CUSTOMER EMAIL (OPTIONAL)"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  className="w-full bg-surface-elevated border border-border pl-9 pr-3 py-2.5 text-[10px] tracking-widest focus:outline-none focus:border-accent text-white"
                />
              </div>
            </div>
          </div>

          {/* Cart Items */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: '260px' }}>
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-text-muted opacity-50 py-8">
                <ShoppingCart size={40} className="mb-3" />
                <p className="text-xs uppercase tracking-widest font-bold">CART IS EMPTY</p>
                <p className="text-[9px] text-text-muted mt-1">CLICK PRODUCTS TO ADD</p>
              </div>
            ) : cart.map(item => (
              <div key={item.id} className="flex gap-3">
                <div className="w-14 h-14 bg-background border border-border overflow-hidden flex-shrink-0">
                  <img src={item.imageUrl || `https://picsum.photos/seed/${item.sku}/400/300`} alt={item.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] text-text-secondary uppercase tracking-widest mb-0.5">{item.category}</p>
                  <h5 className="text-[10px] font-bold text-white tracking-wider mb-1 uppercase line-clamp-1">{item.name}</h5>
                  {item.cartInclusions && item.cartInclusions.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-1">
                      {item.cartInclusions.map((inc, idx) => (
                        <span key={idx} className="text-[7px] bg-accent/10 text-accent border border-accent/30 px-1 py-0.5 uppercase font-bold">{inc}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <div className="flex items-center border border-border">
                        <button onClick={() => updateQty(item.id, -1)} className="px-2 py-1 text-text-secondary hover:text-white border-r border-border">
                          <Minus size={9} />
                        </button>
                        <span className="px-2 py-1 text-[10px] font-bold text-white">{item.quantity}</span>
                        <button onClick={() => updateQty(item.id, 1)} className="px-2 py-1 text-text-secondary hover:text-white border-l border-border">
                          <Plus size={9} />
                        </button>
                      </div>
                      <button
                        onClick={() => setShowInclusionModal({ show: true, itemId: item.id })}
                        className="text-[7px] text-text-secondary hover:text-accent uppercase font-bold border border-border px-1.5 py-1"
                      >+INC</button>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-white">{formatCurrency(item.price * item.quantity)}</p>
                      <button onClick={() => removeFromCart(item.id)} className="text-text-muted hover:text-accent transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Payment Summary */}
          <div className="p-5 bg-surface-elevated border-t border-border space-y-4">
            {/* Payment Method */}
            <div>
              <p className="text-[9px] text-text-secondary uppercase tracking-widest font-bold mb-2">PAYMENT METHOD</p>
              <div className="grid grid-cols-4 gap-1">
                {PAYMENT_METHODS.map(pm => (
                  <button
                    key={pm.id}
                    onClick={() => setPaymentMethod(pm.id)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 border text-[8px] font-bold uppercase tracking-widest transition-all',
                      paymentMethod === pm.id
                        ? 'border-accent bg-accent/10 text-accent'
                        : 'border-border text-text-secondary hover:text-white hover:border-text-muted'
                    )}
                  >
                    <pm.icon size={14} />
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Totals */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-widest font-bold">
                <span>SUBTOTAL</span><span>{formatCurrency(subtotal)}</span>
              </div>
              {discountValue > 0 && (
                <div className="flex justify-between text-[10px] text-accent uppercase tracking-widest font-bold">
                  <span>DISCOUNT {discountType === 'percent' ? `(${discountValue}%)` : '(FIXED)'}</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-[10px] text-text-secondary uppercase tracking-widest font-bold">
                <span>TAX (12%)</span><span>{formatCurrency(tax)}</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-white tracking-tight pt-2 border-t border-border/50">
                <span>TOTAL</span>
                <span className="text-accent">{formatCurrency(total)}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" className="py-3 text-[10px]" onClick={() => setCart([])}>CLEAR</Button>
              <Button
                variant="secondary"
                onClick={() => setShowDiscountModal(true)}
                className="py-3 text-[10px] flex items-center justify-center gap-2"
              >
                <Tag size={12} /> DISCOUNT
              </Button>
            </div>

            <Button
              onClick={handleConfirmPayment}
              disabled={cart.length === 0 || isProcessing}
              className="w-full py-4 text-sm tracking-widest"
            >
              {isProcessing ? <><Loader2 size={14} className="animate-spin mr-2" />PROCESSING...</> : 'CONFIRM PAYMENT'}
            </Button>

            <div className="flex justify-between items-center">
              <p className="text-[8px] text-text-muted uppercase tracking-widest font-bold">STAFF: {userData?.name?.toUpperCase()}</p>
              <div className="w-2 h-2 bg-status-green rounded-full animate-pulse"></div>
            </div>
          </div>
        </Card>
      </div>

      {/* Success Overlay */}
      {showSuccess && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 backdrop-blur-md animate-in fade-in zoom-in duration-300">
          <div className="text-center space-y-6">
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto border border-green-500/30">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
            <div>
              <h2 className="text-4xl font-bold text-white tracking-tighter uppercase">TRANSACTION COMPLETE</h2>
              <p className="text-[10px] text-text-secondary uppercase tracking-[0.4em] mt-2 font-bold">
                {paymentMethod.toUpperCase()} · {formatCurrency(lastTransaction?.total || 0)}
              </p>
            </div>
            <div className="flex gap-4 justify-center">
              <button
                onClick={handlePrintReceipt}
                className="fermata-button-secondary flex items-center gap-2 px-6 py-3"
              >
                <Printer size={16} /> PRINT RECEIPT
              </button>
              <button
                onClick={() => setShowSuccess(false)}
                className="fermata-button-primary px-8 py-3"
              >
                NEW SALE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inclusion Modal */}
      {showInclusionModal.show && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold text-white tracking-widest uppercase">ADD INCLUSION</h3>
              <button onClick={() => setShowInclusionModal({ show: false, itemId: null })} className="text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <input
                className="fermata-input w-full uppercase text-[10px] tracking-widest"
                placeholder="E.G. GUITAR STRAP, PICKS, CASE..."
                value={inclusionText}
                onChange={e => setInclusionText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInclusion(); } }}
                autoFocus
              />
              <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setShowInclusionModal({ show: false, itemId: null })} className="flex-1">CANCEL</Button>
                <Button onClick={addInclusion} className="flex-1">ADD TO ITEM</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest uppercase">APPLY DISCOUNT</h3>
                <p className="text-[9px] text-text-secondary uppercase tracking-widest mt-1">MANAGER OVERRIDE</p>
              </div>
              <button onClick={() => setShowDiscountModal(false)} className="text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-6">
              <div className="flex gap-2">
                {(['percent', 'fixed'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setDiscountType(type)}
                    className={cn(
                      'flex-1 py-2 text-[10px] font-bold uppercase tracking-widest border transition-all',
                      discountType === type ? 'bg-accent border-accent text-white' : 'border-border text-text-secondary hover:text-white'
                    )}
                  >{type === 'percent' ? 'PERCENTAGE (%)' : 'FIXED AMOUNT (₱)'}</button>
                ))}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">
                  {discountType === 'percent' ? 'DISCOUNT %' : 'DISCOUNT AMOUNT (₱)'}
                </label>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step="0.01"
                  className="fermata-input"
                  value={discountValue || ''}
                  onChange={e => setDiscountValue(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">REASON FOR DISCOUNT</label>
                <textarea
                  value={discountReason}
                  onChange={e => setDiscountReason(e.target.value)}
                  className="fermata-input w-full h-20 resize-none uppercase text-[10px] tracking-widest py-3"
                  placeholder="E.G. PROMO CODE, LOYALTY, DAMAGE..."
                />
              </div>
              <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setShowDiscountModal(false)} className="flex-1">CANCEL</Button>
                <Button onClick={() => setShowDiscountModal(false)} className="flex-1">APPLY</Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Refund Modal */}
      {showRefundModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-6">
          <Card className="w-full max-w-md p-8">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-sm font-bold text-white tracking-widest uppercase">PROCESS REFUND</h3>
                <p className="text-[9px] text-text-secondary uppercase tracking-widest mt-1">INVENTORY AUTO-RESTOCKED</p>
              </div>
              <button onClick={() => setShowRefundModal(false)} className="text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">TRANSACTION ID</label>
                <input
                  className="fermata-input uppercase text-[10px] tracking-widest"
                  placeholder="PASTE FULL TRANSACTION ID"
                  value={refundTransactionId}
                  onChange={e => setRefundTransactionId(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">REASON FOR REFUND</label>
                <textarea
                  className="fermata-input w-full h-20 resize-none uppercase text-[10px] tracking-widest py-3"
                  placeholder="E.G. DEFECTIVE ITEM, WRONG ORDER..."
                  value={refundReason}
                  onChange={e => setRefundReason(e.target.value)}
                />
              </div>
              <div className="flex gap-4">
                <Button variant="secondary" onClick={() => setShowRefundModal(false)} className="flex-1">CANCEL</Button>
                <Button
                  onClick={handleRefund}
                  disabled={!refundTransactionId.trim() || !refundReason.trim()}
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                >
                  CONFIRM REFUND
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}