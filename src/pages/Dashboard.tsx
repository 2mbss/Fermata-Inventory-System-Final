import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Wrench,
  AlertTriangle,
  ArrowUpRight,
  Package,
  Loader2,
  Clock,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { cn, formatCurrency } from '../lib/utils';
import { collection, onSnapshot, query, orderBy, limit, where } from 'firebase/firestore';
import { db } from '../firebase';
import { Transaction, Booking, Product } from '../types';
import { useFirebase } from '../components/FirebaseProvider';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export default function Dashboard() {
  const { userData } = useFirebase();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    dailyRevenue: 0,
    monthlyRevenue: 0,
    activeJobs: 0,
    lowStockItems: 0,
  });
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [recentBookings, setRecentBookings] = useState<Booking[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Fetch Transactions
    const transQuery = query(
      collection(db, 'transactions'),
      orderBy('timestamp', 'desc'),
      limit(100)
    );

    const unsubTrans = onSnapshot(transQuery, (snapshot) => {
      const trans = snapshot.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Handle both Firestore Timestamp and ISO string
          timestamp: data.timestamp?.toDate ? data.timestamp.toDate() : new Date(data.timestamp),
        };
      }) as Transaction[];

      setRecentTransactions(trans.slice(0, 5));

      let daily = 0;
      let monthly = 0;
      const dailyMap: Record<string, number> = {};

      trans.forEach(t => {
        const tDate = t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp);
        if (tDate >= today) daily += t.total;
        if (tDate >= firstDayOfMonth) monthly += t.total;

        const dateKey = tDate.toLocaleDateString('en-US', { weekday: 'short' });
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + t.total;
      });

      const last7Days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { weekday: 'short' });
        last7Days.push({ name: key, revenue: dailyMap[key] || 0 });
      }
      setChartData(last7Days);
      setStats(prev => ({ ...prev, dailyRevenue: daily, monthlyRevenue: monthly }));
    });

    // Fetch Active Bookings — only statuses that exist in the type
    const bookingsQuery = query(
      collection(db, 'bookings'),
      where('status', 'in', ['Pending', 'Ongoing'])
    );

    const unsubBookings = onSnapshot(bookingsQuery, (snapshot) => {
      setStats(prev => ({ ...prev, activeJobs: snapshot.size }));
      const bookings = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(d.data().createdAt),
      })) as Booking[];
      setRecentBookings(bookings.slice(0, 5));
    });

    // Fetch Low Stock Items
    const productsQuery = query(collection(db, 'products'));
    const unsubProducts = onSnapshot(productsQuery, (snapshot) => {
      const lowStock = snapshot.docs.filter(d => {
        const data = d.data();
        return Number(data.stockQty) <= Number(data.lowStockThreshold);
      }).length;
      setStats(prev => ({ ...prev, lowStockItems: lowStock }));
      setLoading(false);
    });

    return () => {
      unsubTrans();
      unsubBookings();
      unsubProducts();
    };
  }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={48} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-7xl font-bold tracking-tighter leading-none mb-2">
            <span className="text-white">FERMATA</span>{' '}
            <span className="text-accent">DASHBOARD</span>
          </h1>
          <p className="text-xs text-text-secondary uppercase tracking-[0.4em] font-bold">
            SYSTEM STATUS: OPERATIONAL · BRANCH:{' '}
            {userData?.branch?.toUpperCase() || 'ALL BRANCHES'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">
            {new Date().toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <p className="text-[10px] text-accent font-bold uppercase tracking-widest">LIVE_SYNC ACTIVE</p>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <DollarSign size={64} />
          </div>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-1">DAILY REVENUE</p>
          <h3 className="text-3xl font-bold text-white mb-2">{formatCurrency(stats.dailyRevenue)}</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-status-green flex items-center gap-0.5">
              <TrendingUp size={10} /> TODAY
            </span>
            <span className="text-text-muted uppercase">TOTAL SALES</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <ShoppingCart size={64} />
          </div>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-1">MONTHLY REVENUE</p>
          <h3 className="text-3xl font-bold text-white mb-2">{formatCurrency(stats.monthlyRevenue)}</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-text-secondary uppercase tracking-widest">THIS MONTH</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Wrench size={64} />
          </div>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest mb-1">ACTIVE WORK ORDERS</p>
          <h3 className="text-3xl font-bold text-white mb-2">{stats.activeJobs}</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-white uppercase tracking-widest">IN QUEUE</span>
          </div>
        </Card>

        <Card className="relative overflow-hidden group border-accent/30">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <AlertTriangle size={64} />
          </div>
          <p className="text-[10px] text-accent font-bold uppercase tracking-widest mb-1">INVENTORY ALERTS</p>
          <h3 className="text-3xl font-bold text-white mb-2">{stats.lowStockItems}</h3>
          <div className="flex items-center gap-2 text-[10px] font-bold">
            <span className="text-accent uppercase tracking-widest">LOW STOCK SKUS</span>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <Card title="REVENUE VELOCITY" subtitle="LAST 7 DAYS PERFORMANCE">
            <div className="h-[300px] w-full mt-6">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#555"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#888', fontWeight: 'bold' }}
                  />
                  <YAxis
                    stroke="#555"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `₱${(v / 1000).toFixed(0)}k`}
                    tick={{ fill: '#888', fontWeight: 'bold' }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1A1A1A', border: '1px solid #333', borderRadius: '0' }}
                    itemStyle={{ color: '#DC2626', fontSize: '12px', fontWeight: 'bold' }}
                    labelStyle={{ color: '#FFF', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase' }}
                    cursor={{ fill: '#222' }}
                    formatter={(v: any) => [formatCurrency(v), 'Revenue']}
                  />
                  <Bar dataKey="revenue" fill="#DC2626" radius={[2, 2, 0, 0]} barSize={40} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card title="RECENT TRANSACTIONS" subtitle="LIVE SALES FEED">
            <div className="space-y-4 mt-4">
              {recentTransactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 bg-surface-elevated border border-border group hover:border-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-background flex items-center justify-center border border-border">
                      <ShoppingCart size={14} className="text-text-secondary" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white uppercase tracking-tight">
                        {t.items?.length || 0} ITEM{(t.items?.length || 0) !== 1 ? 'S' : ''} · {t.branch}
                      </p>
                      <p className="text-[8px] text-text-secondary uppercase tracking-widest">
                        {t.staffName} ·{' '}
                        {(t.timestamp instanceof Date ? t.timestamp : new Date(t.timestamp)).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-white">{formatCurrency(t.total)}</p>
                    <ArrowUpRight size={12} className="text-accent ml-auto mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
              {recentTransactions.length === 0 && (
                <p className="text-[10px] text-text-muted text-center py-10 uppercase tracking-widest font-bold">
                  NO RECENT SALES
                </p>
              )}
            </div>
          </Card>

          <Card title="WORKSHOP QUEUE" subtitle="ACTIVE REPAIR JOBS">
            <div className="space-y-4 mt-4">
              {recentBookings.map((b) => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-surface-elevated border border-border group hover:border-accent transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-background flex items-center justify-center border border-border">
                      <Wrench size={14} className="text-text-secondary" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-white uppercase tracking-tight">
                        {b.instrumentType} {b.instrumentModel ? `- ${b.instrumentModel}` : ''}
                      </p>
                      <p className="text-[8px] text-text-secondary uppercase tracking-widest">
                        {b.serviceType || b.description?.slice(0, 20)} · {b.status}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={cn(
                      'w-2 h-2 rounded-full ml-auto',
                      b.status === 'Completed' || b.status === 'Claimed'
                        ? 'bg-status-green'
                        : b.status === 'Ongoing'
                        ? 'bg-accent animate-pulse'
                        : 'bg-text-muted'
                    )}></div>
                    <p className="text-[8px] text-text-muted uppercase mt-1">{b.progress}%</p>
                  </div>
                </div>
              ))}
              {recentBookings.length === 0 && (
                <p className="text-[10px] text-text-muted text-center py-10 uppercase tracking-widest font-bold">
                  NO ACTIVE JOBS
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
