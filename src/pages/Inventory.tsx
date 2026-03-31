import React, { useState, useEffect, useRef } from 'react';
import {
  Search, Plus, Download, MoreVertical, AlertCircle, X,
  Barcode, Tag, PackageOpen, Trash2, Loader2,
} from 'lucide-react';
import {
  collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc,
  orderBy, serverTimestamp, getDocs, limit,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Product, Branch, InventoryLog } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { formatCurrency, cn } from '../lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import JsBarcode from 'jsbarcode';

const EMPTY_FORM = {
  sku: '', name: '', brand: '', category: '', description: '',
  price: '', costPrice: '', stockQty: '', lowStockThreshold: '',
  branch: 'Imus' as Branch, imageUrl: '',
  personInCharge: '', inclusionInput: '', inclusions: [] as string[],
  isSale: false, salePrice: '',
};

const TABS = [
  { id: 'all', label: 'ALL PRODUCTS' },
  { id: 'imus', label: 'IMUS BRANCH' },
  { id: 'qc', label: 'QUEZON CITY' },
  { id: 'sale', label: 'SALE ITEMS' },
  { id: 'alerts', label: 'LOW STOCK' },
];

export default function Inventory() {
  const { userData } = useFirebase();
  const [products, setProducts] = useState<Product[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'products'));

    const logQ = query(collection(db, 'inventoryLogs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubLogs = onSnapshot(logQ, (snap) => {
      setInventoryLogs(snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
        };
      }) as InventoryLog[]);
    });

    return () => { unsub(); unsubLogs(); };
  }, []);

  const openModal = (product?: Product) => {
    if (product) {
      setEditingProduct(product);
      setForm({
        sku: product.sku || '',
        name: product.name || '',
        brand: product.brand || '',
        category: product.category || '',
        description: product.description || '',
        price: String(product.price || ''),
        costPrice: String(product.costPrice || ''),
        stockQty: String(product.stockQty || ''),
        lowStockThreshold: String(product.lowStockThreshold || ''),
        branch: product.branch || 'Imus',
        imageUrl: product.imageUrl || '',
        personInCharge: product.personInCharge || '',
        inclusionInput: '',
        inclusions: product.inclusions || [],
        isSale: product.isSale || false,
        salePrice: String(product.salePrice || ''),
      });
    } else {
      setEditingProduct(null);
      setForm({ ...EMPTY_FORM });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setForm({ ...EMPTY_FORM });
  };

  const addInclusion = () => {
    const val = form.inclusionInput.trim();
    if (val && !form.inclusions.includes(val)) {
      setForm(f => ({ ...f, inclusions: [...f.inclusions, val], inclusionInput: '' }));
    }
  };

  const removeInclusion = (idx: number) => {
    setForm(f => ({ ...f, inclusions: f.inclusions.filter((_, i) => i !== idx) }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.personInCharge.trim()) {
      alert('Person in charge is required.');
      return;
    }
    setSaving(true);

    const stockQty = Number(form.stockQty);
    const lowStockThreshold = Number(form.lowStockThreshold);
    let status: Product['status'] = 'IN STOCK';
    if (stockQty === 0) status = 'OUT OF STOCK';
    else if (stockQty <= lowStockThreshold) status = 'LOW STOCK';

    const productData: Omit<Product, 'id'> = {
      sku: form.sku.trim(),
      name: form.name.trim(),
      brand: form.brand.trim(),
      category: form.category.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      costPrice: Number(form.costPrice),
      stockQty,
      lowStockThreshold,
      branch: form.branch,
      imageUrl: form.imageUrl.trim() || `https://picsum.photos/seed/${form.sku}/400/300`,
      status,
      inclusions: form.inclusions,
      isSale: form.isSale,
      salePrice: form.isSale && form.salePrice ? Number(form.salePrice) : null,
      personInCharge: form.personInCharge.trim(),
      barcode: form.sku.trim(),
    };

    // Firestore rejects undefined values — strip them out before saving
    const cleanData = Object.fromEntries(
      Object.entries(productData).filter(([_, v]) => v !== undefined)
    ) as Omit<Product, 'id'>;

    try {
      if (editingProduct) {
        await updateDoc(doc(db, 'products', editingProduct.id), cleanData);
        // Log the update
        await addDoc(collection(db, 'inventoryLogs'), {
          productId: editingProduct.id,
          productName: cleanData.name,
          delta: stockQty - (editingProduct.stockQty || 0),
          type: stockQty >= (editingProduct.stockQty || 0) ? 'IN' : 'OUT',
          personInCharge: form.personInCharge.trim(),
          branch: form.branch,
          timestamp: serverTimestamp(),
          reason: 'Product updated',
        });
      } else {
        const ref = await addDoc(collection(db, 'products'), cleanData);
        // Log the creation
        await addDoc(collection(db, 'inventoryLogs'), {
          productId: ref.id,
          productName: cleanData.name,
          delta: stockQty,
          type: 'IN',
          personInCharge: form.personInCharge.trim(),
          branch: form.branch,
          timestamp: serverTimestamp(),
          reason: 'New product added',
        });
      }
      closeModal();
    } catch (error) {
      handleFirestoreError(error, editingProduct ? OperationType.UPDATE : OperationType.CREATE, 'products');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product: Product) => {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'products', product.id));
      closeModal();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `products/${product.id}`);
    }
  };

  const printBarcode = (product: Product) => {
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`
      <html><head><title>Barcode - ${product.name}</title>
      <style>body{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;font-family:sans-serif;background:#fff;}
      p{margin:4px 0;font-size:12px;font-weight:bold;text-transform:uppercase;}</style>
      </head><body>
      <svg id="bc"></svg>
      <p>${product.name}</p>
      <p>SKU: ${product.sku}</p>
      <p>${formatCurrency(product.price)}</p>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
      <script>JsBarcode("#bc","${product.sku}",{format:"CODE128",width:2,height:80,displayValue:true});<\/script>
      <script>window.onload=function(){window.print()}<\/script>
      </body></html>
    `);
    win.document.close();
  };

  const filteredProducts = products.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.brand?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchSearch) return false;
    if (activeTab === 'imus') return item.branch === 'Imus';
    if (activeTab === 'qc') return item.branch === 'Quezon City';
    if (activeTab === 'sale') return item.isSale === true;
    if (activeTab === 'alerts') return item.stockQty <= item.lowStockThreshold;
    return true;
  });

  const lowStockProducts = products.filter(p => p.stockQty <= p.lowStockThreshold);

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-6xl font-bold text-white tracking-tighter mb-2 uppercase">INVENTORY</h1>
          <p className="text-sm text-text-secondary uppercase tracking-[0.3em] font-medium">
            <span className="text-accent">{products.length} TOTAL SKUS</span> · MASTER CONTROL PANEL
          </p>
        </div>
        <div className="flex gap-4">
          {(userData?.role === 'Super Admin' || userData?.permissions?.includes('inventory')) && (
            <Button onClick={() => openModal()} className="flex items-center gap-2">
              <Plus size={16} />
              <span className="text-[10px]">ADD PRODUCT</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border overflow-x-auto">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-6 py-3 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap transition-all border-b-2 -mb-[2px]',
              activeTab === tab.id
                ? 'text-white border-accent'
                : 'text-text-secondary border-transparent hover:text-white'
            )}
          >
            <span className="text-accent">{String(i + 1).padStart(2, '0')}</span>
            {tab.label}
            {tab.id === 'alerts' && lowStockProducts.length > 0 && (
              <span className="ml-1 bg-accent text-white text-[8px] px-1.5 py-0.5 font-bold">{lowStockProducts.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
        <input
          type="text"
          placeholder="SEARCH BY NAME, SKU, OR BRAND..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full bg-surface border border-border pl-12 pr-4 py-4 text-xs uppercase tracking-widest focus:outline-none focus:border-accent"
        />
      </div>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-elevated border-b border-border">
                {['PRODUCT INFO', 'SKU / CATEGORY', 'BRANCH', 'STOCK LEVEL', 'PRICE', 'STATUS', 'ACTIONS'].map(h => (
                  <th key={h} className="p-5 text-[10px] font-bold text-text-secondary uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center">
                    <Loader2 className="animate-spin text-accent mx-auto mb-4" size={32} />
                    <p className="text-[10px] text-text-muted uppercase tracking-widest">FETCHING_DATA...</p>
                  </td>
                </tr>
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center">
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">NO PRODUCTS FOUND</p>
                  </td>
                </tr>
              ) : filteredProducts.map(item => (
                <tr key={item.id} className="hover:bg-surface-elevated transition-colors group">
                  <td className="p-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-background border border-border overflow-hidden">
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover opacity-80" referrerPolicy="no-referrer" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white tracking-wider uppercase">{item.name}</p>
                        <p className="text-[9px] text-text-secondary uppercase tracking-widest">{item.brand}</p>
                        {item.inclusions && item.inclusions.length > 0 && (
                          <p className="text-[8px] text-accent/70 mt-0.5">+{item.inclusions.length} INCLUSIONS</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    <p className="text-xs font-bold text-white uppercase tracking-tighter">{item.sku}</p>
                    <p className="text-[9px] text-text-secondary uppercase tracking-widest">{item.category}</p>
                  </td>
                  <td className="p-5">
                    <p className="text-[10px] font-bold text-white uppercase tracking-widest">{item.branch}</p>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        'text-lg font-bold',
                        item.stockQty <= item.lowStockThreshold ? 'text-accent' : 'text-white'
                      )}>{item.stockQty}</span>
                      <div className="flex-1 min-w-[60px] h-1 bg-background overflow-hidden">
                        <div
                          className={cn(
                            'h-full transition-all',
                            item.stockQty <= item.lowStockThreshold ? 'bg-accent' : 'bg-status-green'
                          )}
                          style={{ width: `${Math.min(100, (item.stockQty / Math.max(item.lowStockThreshold * 2, 10)) * 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="p-5">
                    {item.isSale && item.salePrice ? (
                      <>
                        <p className="text-xs font-bold text-accent">{formatCurrency(item.salePrice)}</p>
                        <p className="text-[9px] text-text-muted line-through">{formatCurrency(item.price)}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-white">{formatCurrency(item.price)}</p>
                        <p className="text-[9px] text-text-muted uppercase tracking-widest">COST: {formatCurrency(item.costPrice)}</p>
                      </>
                    )}
                  </td>
                  <td className="p-5">
                    <div className="flex flex-col gap-1">
                      <span className={cn(
                        'px-2 py-1 text-[8px] font-bold uppercase tracking-widest w-fit',
                        item.status === 'LOW STOCK' || item.status === 'OUT OF STOCK'
                          ? 'bg-accent text-white'
                          : 'bg-surface-elevated text-text-secondary'
                      )}>{item.status}</span>
                      {item.isSale && (
                        <span className="px-2 py-1 text-[8px] font-bold uppercase tracking-widest bg-amber-700/30 text-amber-400 w-fit">ON SALE</span>
                      )}
                    </div>
                  </td>
                  <td className="p-5">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => printBarcode(item)}
                        title="Print Barcode"
                        className="p-2 text-text-secondary hover:text-accent transition-colors"
                      >
                        <Barcode size={14} />
                      </button>
                      <button
                        onClick={() => openModal(item)}
                        className="p-2 text-text-secondary hover:text-white transition-colors"
                      >
                        <MoreVertical size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Low Stock + Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="CRITICAL STOCK ALERTS" className="border-l-4 border-l-accent">
          <div className="space-y-4">
            {lowStockProducts.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-4">NO CRITICAL ALERTS</p>
            ) : lowStockProducts.map(item => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-surface-elevated border border-border">
                <div className="flex items-center gap-4">
                  <AlertCircle className="text-accent" size={20} />
                  <div>
                    <p className="text-xs font-bold text-white uppercase tracking-wider">{item.name}</p>
                    <p className="text-[9px] text-text-secondary uppercase tracking-widest">
                      {item.branch} · {item.stockQty} REMAINING (THRESHOLD: {item.lowStockThreshold})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => openModal(item)}
                  className="text-[10px] font-bold text-accent uppercase tracking-widest hover:underline"
                >
                  REORDER
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card title="INVENTORY LOGS" subtitle="REAL-TIME ACTIVITY">
          <div className="space-y-3 max-h-[300px] overflow-y-auto">
            {inventoryLogs.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-4">NO LOGS YET</p>
            ) : inventoryLogs.map(log => (
              <div key={log.id} className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest py-2 border-b border-border last:border-0">
                <div className="flex gap-3">
                  <span className={cn('font-bold', log.type === 'IN' ? 'text-status-green' : 'text-accent')}>
                    {log.type === 'IN' ? '+' : ''}{log.delta}
                  </span>
                  <span className="text-white">{log.productName?.slice(0, 22)}</span>
                </div>
                <div className="text-right">
                  <span className="text-text-secondary">PIC: {log.personInCharge}</span>
                  <p className="text-text-muted text-[8px]">
                    {(log.timestamp instanceof Date ? log.timestamp : new Date()).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Product Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/90 backdrop-blur-sm">
          <Card className="w-full max-w-2xl p-8 border-accent/20 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tighter uppercase">
                  {editingProduct ? 'EDIT PRODUCT' : 'ADD NEW PRODUCT'}
                </h2>
                <p className="text-[10px] text-text-secondary uppercase tracking-[0.4em] mt-1 font-bold">
                  {editingProduct ? `SKU: ${editingProduct.sku}` : 'CREATE_NEW_ENTRY'}
                </p>
              </div>
              <button onClick={closeModal} className="p-2 text-text-muted hover:text-white">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              {/* Person in Charge — required */}
              <div className="p-4 bg-accent/10 border border-accent/30">
                <label className="text-[10px] text-accent uppercase tracking-widest font-bold block mb-2">
                  ⚠ PERSON IN CHARGE (REQUIRED FOR LOG)
                </label>
                <input
                  className="fermata-input w-full uppercase text-[11px] tracking-widest"
                  placeholder="FULL NAME OF STAFF RESPONSIBLE"
                  value={form.personInCharge}
                  onChange={e => setForm(f => ({ ...f, personInCharge: e.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">SKU / BARCODE</label>
                  <input className="fermata-input" value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">PRODUCT NAME</label>
                  <input className="fermata-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">BRAND</label>
                  <input className="fermata-input" value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">CATEGORY</label>
                  <select className="fermata-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required>
                    <option value="">SELECT CATEGORY</option>
                    {['Guitars', 'Amplifiers', 'Accessories', 'Parts', 'Strings', 'Effects', 'Other'].map(c => (
                      <option key={c} value={c}>{c.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">PRICE (PHP)</label>
                  <input type="number" min="0" step="0.01" className="fermata-input" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">COST PRICE (PHP)</label>
                  <input type="number" min="0" step="0.01" className="fermata-input" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">STOCK QUANTITY</label>
                  <input type="number" min="0" className="fermata-input" value={form.stockQty} onChange={e => setForm(f => ({ ...f, stockQty: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">LOW STOCK THRESHOLD</label>
                  <input type="number" min="0" className="fermata-input" value={form.lowStockThreshold} onChange={e => setForm(f => ({ ...f, lowStockThreshold: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">BRANCH</label>
                  <select className="fermata-input" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value as Branch }))}>
                    <option value="Imus">IMUS, CAVITE</option>
                    <option value="Quezon City">QUEZON CITY</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">IMAGE URL (OPTIONAL)</label>
                  <input className="fermata-input" placeholder="https://..." value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} />
                </div>
              </div>

              {/* Sale Toggle */}
              <div className="flex flex-col gap-3 p-4 bg-surface-elevated border border-border">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">MARK AS SALE ITEM</label>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, isSale: !f.isSale }))}
                    className={cn(
                      'w-12 h-6 rounded-full transition-colors relative',
                      form.isSale ? 'bg-accent' : 'bg-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-1 w-4 h-4 rounded-full bg-white transition-all',
                      form.isSale ? 'left-7' : 'left-1'
                    )}></span>
                  </button>
                </div>
                {form.isSale && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-accent uppercase tracking-widest font-bold">SALE PRICE (PHP)</label>
                    <input
                      type="number" min="0" step="0.01"
                      className="fermata-input"
                      placeholder="DISCOUNTED PRICE"
                      value={form.salePrice}
                      onChange={e => setForm(f => ({ ...f, salePrice: e.target.value }))}
                    />
                  </div>
                )}
              </div>

              {/* Inclusions */}
              <div className="flex flex-col gap-3 p-4 bg-surface-elevated border border-border">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">BUNDLE INCLUSIONS</label>
                <div className="flex gap-2">
                  <input
                    className="fermata-input flex-1 text-[10px] uppercase tracking-widest"
                    placeholder="E.G. GUITAR STRAP, PICKS, CASE..."
                    value={form.inclusionInput}
                    onChange={e => setForm(f => ({ ...f, inclusionInput: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInclusion(); } }}
                  />
                  <button type="button" onClick={addInclusion} className="fermata-button-secondary px-4 text-[10px]">ADD</button>
                </div>
                {form.inclusions.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {form.inclusions.map((inc, i) => (
                      <span key={i} className="flex items-center gap-1.5 bg-accent/10 border border-accent/30 text-accent text-[9px] px-2 py-1 uppercase font-bold">
                        {inc}
                        <button type="button" onClick={() => removeInclusion(i)} className="hover:text-white">
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">DESCRIPTION</label>
                <textarea
                  className="fermata-input w-full min-h-[80px] py-3 uppercase text-[10px] tracking-widest resize-none"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-border">
                {editingProduct && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => handleDelete(editingProduct)}
                    className="bg-accent/10 text-accent hover:bg-accent hover:text-white border-accent/20"
                  >
                    <Trash2 size={14} className="mr-2" /> DELETE
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={closeModal}>CANCEL</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                  {editingProduct ? 'UPDATE PRODUCT' : 'SAVE PRODUCT'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}