import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Cell, PieChart, Pie,
} from 'recharts';
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Transaction, Booking, InventoryLog, Product } from '../types';
import { Card, StatCard } from '../components/ui/Card';
import { formatCurrency, cn } from '../lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { Download, Loader2 } from 'lucide-react';

const DAYS_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const DAY_MAP: Record<number, string> = { 0: 'SUN', 1: 'MON', 2: 'TUE', 3: 'WED', 4: 'THU', 5: 'FRI', 6: 'SAT' };

function safeDate(val: any): Date {
  if (!val) return new Date(0);
  if (val?.toDate) return val.toDate();
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export default function Analytics() {
  const { userData } = useFirebase();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'30d' | 'ytd'>('30d');

  useEffect(() => {
    let loadCount = 0;
    const checkDone = () => { loadCount++; if (loadCount >= 4) setLoading(false); };

    // Transactions — no timestamp where clause (avoids composite index requirement)
    const qT = query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(500));
    const unsubT = onSnapshot(qT, (snap) => {
      setTransactions(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        timestamp: safeDate(d.data().timestamp),
      })) as Transaction[]);
      checkDone();
    }, err => { handleFirestoreError(err, OperationType.LIST, 'transactions'); checkDone(); });

    const qB = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsubB = onSnapshot(qB, (snap) => {
      setBookings(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: safeDate(d.data().createdAt),
      })) as Booking[]);
      checkDone();
    }, err => { handleFirestoreError(err, OperationType.LIST, 'bookings'); checkDone(); });

    const qL = query(collection(db, 'inventoryLogs'), orderBy('timestamp', 'desc'), limit(200));
    const unsubL = onSnapshot(qL, (snap) => {
      setInventoryLogs(snap.docs.map(d => ({
        id: d.id, ...d.data(),
        timestamp: safeDate(d.data().timestamp),
      })) as InventoryLog[]);
      checkDone();
    }, err => { checkDone(); });

    const qP = query(collection(db, 'products'));
    const unsubP = onSnapshot(qP, (snap) => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[]);
      checkDone();
    }, err => { checkDone(); });

    return () => { unsubT(); unsubB(); unsubL(); unsubP(); };
  }, []);

  // Filter by date range
  const filteredTransactions = transactions.filter(t => {
    const tDate = safeDate(t.timestamp);
    const now = new Date();
    if (dateRange === '30d') {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30);
      return tDate >= cutoff;
    } else {
      return tDate.getFullYear() === now.getFullYear();
    }
  });

  // Revenue by day of week
  const revenueByDay = filteredTransactions.reduce((acc: Record<string, number>, t) => {
    const day = DAY_MAP[safeDate(t.timestamp).getDay()];
    acc[day] = (acc[day] || 0) + (t.total || 0);
    return acc;
  }, {});
  const revenueData = DAYS_ORDER.map(day => ({
    day, current: revenueByDay[day] || 0, projected: 50000,
  }));

  // Sales velocity by hour
  const velocityByHour = filteredTransactions.reduce((acc: Record<string, number>, t) => {
    const h = safeDate(t.timestamp).getHours();
    const key = `${String(h).padStart(2, '0')}:00`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const velocityData = Object.entries(velocityByHour)
    .map(([time, value]) => ({ time, value }))
    .sort((a, b) => a.time.localeCompare(b.time));

  // Top products
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  filteredTransactions.forEach(t => {
    (t.items || []).forEach(item => {
      if (!productSales[item.productId]) productSales[item.productId] = { name: item.name, qty: 0, revenue: 0 };
      productSales[item.productId].qty += item.quantity;
      productSales[item.productId].revenue += item.price * item.quantity;
    });
  });
  const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // KPIs
  const totalRevenue = filteredTransactions.reduce((sum, t) => sum + (t.total || 0), 0);
  const avgOrderValue = filteredTransactions.length > 0 ? totalRevenue / filteredTransactions.length : 0;
  const totalRefunds = filteredTransactions.filter(t => t.isRefunded).length;
  const completedBookings = bookings.filter(b => b.status === 'Completed' || b.status === 'Claimed').length;
  const workshopEfficiency = bookings.length > 0 ? (completedBookings / bookings.length) * 100 : 0;

  // Branch split
  const imusRevenue = filteredTransactions.filter(t => t.branch === 'Imus').reduce((s, t) => s + t.total, 0);
  const qcRevenue = filteredTransactions.filter(t => t.branch === 'Quezon City').reduce((s, t) => s + t.total, 0);
  const branchData = [
    { name: 'IMUS', value: imusRevenue },
    { name: 'QC', value: qcRevenue },
  ];

  // Export CSV
  const exportCSV = () => {
    const rows = [
      ['Transaction ID', 'Date', 'Branch', 'Staff', 'Customer', 'Items', 'Subtotal', 'Discount', 'Tax', 'Total', 'Payment Method', 'Refunded'],
      ...filteredTransactions.map(t => [
        t.id,
        safeDate(t.timestamp).toLocaleDateString('en-PH'),
        t.branch,
        t.staffName,
        t.customerName || 'Walk-in',
        (t.items || []).map(i => `${i.name} x${i.quantity}`).join(' | '),
        t.subtotal,
        t.discount,
        t.tax,
        t.total,
        t.paymentMethod,
        t.isRefunded ? 'YES' : 'NO',
      ]),
    ];
    const bom = '\uFEFF';
    const csv = bom + rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `fermata-sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="animate-spin text-accent mx-auto mb-4" size={48} />
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">COMPILING_ANALYTICS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <p className="text-[11px] text-accent uppercase font-bold tracking-[0.4em]">FERMATA PERFORMANCE SUITE</p>
        <div className="flex items-end justify-between flex-wrap gap-4">
          <h1 className="text-7xl font-bold text-white tracking-tighter leading-none">BUSINESS ANALYTICS</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={exportCSV}
              className="fermata-button-secondary flex items-center gap-2 px-4 py-2 text-[10px]"
            >
              <Download size={14} /> EXPORT CSV
            </button>
            <div className="flex bg-surface border border-border p-1">
              <button
                onClick={() => setDateRange('30d')}
                className={cn('px-4 py-2 text-[10px] font-bold uppercase tracking-widest', dateRange === '30d' ? 'bg-accent text-white' : 'text-text-secondary hover:text-white')}
              >LAST 30 DAYS</button>
              <button
                onClick={() => setDateRange('ytd')}
                className={cn('px-4 py-2 text-[10px] font-bold uppercase tracking-widest', dateRange === 'ytd' ? 'bg-accent text-white' : 'text-text-secondary hover:text-white')}
              >YEAR TO DATE</button>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label={`TOTAL REVENUE (${dateRange === '30d' ? '30D' : 'YTD'})`} value={formatCurrency(totalRevenue)} trend="+12.4%" />
        <StatCard label="TRANSACTIONS" value={filteredTransactions.length.toString()} trend="+5.2%" />
        <StatCard label="AVG ORDER VALUE" value={formatCurrency(avgOrderValue)} trend="-2.1%" trendType="down" />
        <StatCard label="TOTAL REFUNDS" value={totalRefunds.toString()} trend="" trendType="down" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card title="WEEKLY REVENUE PERFORMANCE" subtitle="CURRENT VS PROJECTED">
          <div className="h-[280px] mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="day" stroke="#555" fontSize={10} tickLine={false} axisLine={false} dy={10} tick={{ fill: '#888', fontWeight: 'bold' }} />
                <YAxis stroke="#555" fontSize={10} tickLine={false} axisLine={false} tickFormatter={v => `₱${(v / 1000).toFixed(0)}K`} tick={{ fill: '#888', fontWeight: 'bold' }} />
                <Tooltip cursor={{ fill: '#222' }} contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '0px' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 'bold' }} labelStyle={{ color: '#fff', fontSize: '10px' }}
                  formatter={(v: any, name: string) => [formatCurrency(v), name === 'current' ? 'Actual' : 'Projected']} />
                <Bar dataKey="current" fill="#DC2626" radius={0} barSize={20} name="current" />
                <Bar dataKey="projected" fill="#3D3D3D" radius={0} barSize={20} name="projected" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-6 mt-4 pt-4 border-t border-border">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-accent"></div>
              <span className="text-[9px] text-text-secondary uppercase tracking-widest font-bold">CURRENT</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-[#3D3D3D]"></div>
              <span className="text-[9px] text-text-secondary uppercase tracking-widest font-bold">PROJECTED</span>
            </div>
          </div>
        </Card>

        <Card title="SALES VELOCITY" subtitle="TRANSACTION VOLUME BY HOUR">
          <div className="h-[280px] mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={velocityData.length > 0 ? velocityData : [{ time: '—', value: 0 }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                <XAxis dataKey="time" stroke="#555" fontSize={9} tickLine={false} axisLine={false} dy={10} tick={{ fill: '#888', fontWeight: 'bold' }} />
                <YAxis stroke="#555" fontSize={10} tickLine={false} axisLine={false} tick={{ fill: '#888', fontWeight: 'bold' }} />
                <Tooltip contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: '0px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }} />
                <Line type="monotone" dataKey="value" stroke="#DC2626" strokeWidth={3}
                  dot={{ fill: '#DC2626', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-border">
            <div>
              <p className="text-[10px] text-text-secondary uppercase font-bold mb-1">TOTAL ITEMS</p>
              <p className="text-xl font-bold text-white">
                {filteredTransactions.reduce((sum, t) => sum + (t.items || []).reduce((s, i) => s + i.quantity, 0), 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase font-bold mb-1">DISCOUNTS</p>
              <p className="text-xl font-bold text-white">{formatCurrency(filteredTransactions.reduce((sum, t) => sum + (t.discount || 0), 0))}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase font-bold mb-1">TAX COLLECTED</p>
              <p className="text-xl font-bold text-white">{formatCurrency(filteredTransactions.reduce((sum, t) => sum + (t.tax || 0), 0))}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Branch Split + Top Products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Branch */}
        <Card title="BRANCH REVENUE SPLIT" className="flex flex-col items-center justify-center text-center">
          <div className="relative w-48 h-48 flex items-center justify-center mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={branchData} innerRadius={60} outerRadius={80} startAngle={90} endAngle={450} dataKey="value" stroke="none">
                  <Cell fill="#DC2626" />
                  <Cell fill="#3D3D3D" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-white">
                {totalRevenue > 0 ? Math.round((imusRevenue / totalRevenue) * 100) : 0}%
              </span>
              <span className="text-[8px] text-text-secondary font-bold uppercase tracking-widest">IMUS</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 w-full">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent"></div>
              <div className="text-left">
                <p className="text-[9px] text-text-secondary uppercase font-bold">IMUS</p>
                <p className="text-sm font-bold text-white">{formatCurrency(imusRevenue)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-[#3D3D3D]"></div>
              <div className="text-left">
                <p className="text-[9px] text-text-secondary uppercase font-bold">QC</p>
                <p className="text-sm font-bold text-white">{formatCurrency(qcRevenue)}</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Workshop Gauge */}
        <Card title="WORKSHOP EFFICIENCY" className="flex flex-col items-center justify-center text-center">
          <div className="relative w-48 h-48 flex items-center justify-center mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={[{ value: workshopEfficiency }, { value: 100 - workshopEfficiency }]}
                  innerRadius={60} outerRadius={80} startAngle={90} endAngle={450} dataKey="value" stroke="none">
                  <Cell fill="#DC2626" />
                  <Cell fill="#2A2A2A" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold text-white">{Math.round(workshopEfficiency)}%</span>
              <span className="text-[8px] text-text-secondary font-bold uppercase tracking-widest">DONE</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4 w-full">
            <div><p className="text-[9px] text-text-secondary uppercase font-bold">COMPLETED</p><p className="text-xl font-bold text-white">{completedBookings}</p></div>
            <div><p className="text-[9px] text-text-secondary uppercase font-bold">TOTAL JOBS</p><p className="text-xl font-bold text-white">{bookings.length}</p></div>
          </div>
        </Card>

        {/* Top Products */}
        <Card title="TOP SELLING PRODUCTS" subtitle="BY UNIT VOLUME">
          <div className="space-y-4 mt-4">
            {topProducts.length === 0 ? (
              <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-8">NO SALES DATA YET</p>
            ) : topProducts.map((p, i) => (
              <div key={p.name} className="flex items-center gap-4">
                <span className="text-[10px] font-bold text-text-muted w-4">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold text-white uppercase line-clamp-1">{p.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 bg-border overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${Math.round((p.qty / (topProducts[0]?.qty || 1)) * 100)}%` }}
                      ></div>
                    </div>
                    <span className="text-[8px] text-text-secondary font-bold">{p.qty} UNITS</span>
                  </div>
                </div>
                <p className="text-[10px] font-bold text-white">{formatCurrency(p.revenue)}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* History Logs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales History */}
        <Card title="SALES HISTORY" subtitle={`${filteredTransactions.length} TRANSACTIONS`}>
          <div className="space-y-3 max-h-[400px] overflow-y-auto mt-4">
            {filteredTransactions.slice(0, 50).map(t => (
              <div key={t.id} className={cn(
                'flex items-start justify-between p-3 bg-surface-elevated border text-[10px]',
                t.isRefunded ? 'border-text-muted opacity-60' : 'border-border'
              )}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-white uppercase">{t.staffName}</span>
                    {t.isRefunded && <span className="bg-text-muted text-black px-1 text-[8px] font-bold">REFUNDED</span>}
                  </div>
                  <p className="text-text-secondary">{t.customerName || 'Walk-in'} · {t.branch} · {t.paymentMethod}</p>
                  <p className="text-text-muted">{(t.items || []).map(i => i.name).slice(0, 2).join(', ')}{(t.items || []).length > 2 ? ` +${(t.items || []).length - 2} more` : ''}</p>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <p className="font-bold text-white">{formatCurrency(t.total)}</p>
                  <p className="text-text-muted text-[8px]">
                    {safeDate(t.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
            ))}
            {filteredTransactions.length === 0 && (
              <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-8">NO TRANSACTIONS YET</p>
            )}
          </div>
        </Card>

        {/* Inventory History */}
        <Card title="INVENTORY LOG HISTORY" subtitle="STOCK MOVEMENTS">
          <div className="space-y-3 max-h-[400px] overflow-y-auto mt-4">
            {inventoryLogs.slice(0, 50).map(log => (
              <div key={log.id} className="flex items-start justify-between p-3 bg-surface-elevated border border-border text-[10px]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('font-bold', log.type === 'IN' ? 'text-status-green' : 'text-accent')}>
                      {log.type === 'IN' ? '+' : ''}{log.delta} {log.type}
                    </span>
                    <span className="font-bold text-white uppercase line-clamp-1">{log.productName}</span>
                  </div>
                  <p className="text-text-secondary">PIC: {log.personInCharge} · {log.branch}</p>
                  {log.reason && <p className="text-text-muted">{log.reason}</p>}
                </div>
                <p className="text-text-muted text-[8px] flex-shrink-0 ml-4">
                  {safeDate(log.timestamp).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            ))}
            {inventoryLogs.length === 0 && (
              <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-8">NO INVENTORY LOGS YET</p>
            )}
          </div>
        </Card>
      </div>

      {/* Bottom Stats Strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 py-10 border-t border-border">
        <div>
          <h4 className="text-5xl font-bold text-white tracking-tighter mb-2">
            {totalRevenue > 0 ? (totalRevenue / Math.max(products.reduce((s, p) => s + p.price, 0), 1) * products.length || 1).toFixed(1) : '0.0'}X
          </h4>
          <p className="text-xs text-text-secondary uppercase font-bold tracking-widest">INVENTORY TURN (EST)</p>
        </div>
        <div>
          <h4 className="text-5xl font-bold text-white tracking-tighter mb-2">{Math.round(workshopEfficiency)}%</h4>
          <p className="text-xs text-text-secondary uppercase font-bold tracking-widest">WORKSHOP EFFICIENCY</p>
        </div>
        <div>
          <h4 className="text-5xl font-bold text-white tracking-tighter mb-2">
            {totalRevenue > 0 && filteredTransactions.length > 0
              ? `${Math.round(((totalRevenue - filteredTransactions.reduce((s, t) => s + (t.items || []).reduce((is, i) => {
                const prod = products.find(p => p.id === i.productId);
                return is + (prod?.costPrice || 0) * i.quantity;
              }, 0), 0)) / totalRevenue) * 100)}%`
              : 'N/A'}
          </h4>
          <p className="text-xs text-text-secondary uppercase font-bold tracking-widest">GROSS MARGIN</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <div className="w-2 h-2 bg-status-green rounded-full"></div>
        <span className="text-[10px] uppercase tracking-widest font-bold text-status-green">OPERATIONAL</span>
      </div>
    </div>
  );
}
