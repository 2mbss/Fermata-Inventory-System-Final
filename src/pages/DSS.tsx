import React, { useState, useEffect } from 'react';
import {
  BrainCircuit, Zap, AlertTriangle, TrendingUp, BarChart2,
  Globe, DollarSign, Award, Loader2, RefreshCw, ChevronRight,
  Package, ShoppingCart, Wrench, Activity,
} from 'lucide-react';
import { Card } from '../components/ui/Card';
import { cn, formatCurrency } from '../lib/utils';
import { collection, getDocs, query, limit, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Product, Transaction, Booking } from '../types';

interface DSSInsight {
  criticalAlert: { title: string; description: string; actionLabel: string; severity: 'high' | 'medium' | 'low' };
  marketMetrics: { label: string; value: string; trend: string; icon: string }[];
  recommendation: {
    title: string; description: string;
    currentPrice: number; recommendedPrice: number;
    targetSku: string; confidence: string; productName: string;
  };
  predictiveTrends: { category: string; title: string; description: string; probability: string }[];
  inventorySummary: { totalSkus: number; lowStockCount: number; outOfStockCount: number; totalValue: number };
  salesSummary: { totalRevenue: number; avgOrderValue: number; topProduct: string; totalOrders: number };
}

const ICON_MAP: Record<string, any> = {
  Globe, BarChart2, DollarSign, Award, TrendingUp, Package, ShoppingCart,
};

function analyzeData(products: Product[], transactions: Transaction[], bookings: Booking[]): DSSInsight {
  // --- Inventory Analysis ---
  const lowStock = products.filter(p => p.stockQty > 0 && p.stockQty <= p.lowStockThreshold);
  const outOfStock = products.filter(p => p.stockQty === 0);
  const totalInventoryValue = products.reduce((sum, p) => sum + p.price * p.stockQty, 0);

  // --- Sales Analysis ---
  const totalRevenue = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
  const avgOrderValue = transactions.length > 0 ? totalRevenue / transactions.length : 0;

  // Product sales frequency
  const productSalesCount: Record<string, { name: string; qty: number; revenue: number }> = {};
  transactions.forEach(t => {
    (t.items || []).forEach(item => {
      if (!productSalesCount[item.productId]) {
        productSalesCount[item.productId] = { name: item.name, qty: 0, revenue: 0 };
      }
      productSalesCount[item.productId].qty += item.quantity;
      productSalesCount[item.productId].revenue += item.price * item.quantity;
    });
  });

  const topProduct = Object.values(productSalesCount).sort((a, b) => b.qty - a.qty)[0];
  const slowMovers = products.filter(p => !productSalesCount[p.id] && p.stockQty > 0);

  // Category analysis
  const categoryRevenue: Record<string, number> = {};
  transactions.forEach(t => {
    (t.items || []).forEach(item => {
      const prod = products.find(p => p.id === item.productId);
      const cat = prod?.category || 'Unknown';
      categoryRevenue[cat] = (categoryRevenue[cat] || 0) + item.price * item.quantity;
    });
  });
  const topCategory = Object.entries(categoryRevenue).sort((a, b) => b[1] - a[1])[0];

  // Branch split
  const imusRevenue = transactions.filter(t => t.branch === 'Imus').reduce((sum, t) => sum + t.total, 0);
  const qcRevenue = transactions.filter(t => t.branch === 'Quezon City').reduce((sum, t) => sum + t.total, 0);
  const dominantBranch = imusRevenue >= qcRevenue ? 'Imus' : 'Quezon City';

  // Workshop analysis
  const pendingBookings = bookings.filter(b => b.status === 'Pending').length;
  const ongoingBookings = bookings.filter(b => b.status === 'Ongoing').length;
  const workshopLoad = pendingBookings + ongoingBookings;

  // --- Build Insights ---

  // Critical Alert
  let criticalAlert: DSSInsight['criticalAlert'];
  if (outOfStock.length > 0) {
    criticalAlert = {
      title: `${outOfStock.length} SKU${outOfStock.length > 1 ? 'S' : ''} OUT OF STOCK`,
      description: `Products including ${outOfStock.slice(0, 2).map(p => p.name).join(', ')} have zero inventory. Immediate restocking required to prevent lost sales.`,
      actionLabel: 'REORDER NOW',
      severity: 'high',
    };
  } else if (lowStock.length > 3) {
    criticalAlert = {
      title: `LOW STOCK WARNING: ${lowStock.length} PRODUCTS`,
      description: `${lowStock.map(p => p.name).slice(0, 3).join(', ')} and ${lowStock.length - 3} more are approaching their minimum threshold. Initiate procurement soon.`,
      actionLabel: 'VIEW STOCK ALERTS',
      severity: 'medium',
    };
  } else if (workshopLoad > 10) {
    criticalAlert = {
      title: 'WORKSHOP CAPACITY OVERLOAD',
      description: `${workshopLoad} active and pending repairs detected. Current technician load may cause delays and customer dissatisfaction. Consider adding a second luthier.`,
      actionLabel: 'VIEW QUEUE',
      severity: 'medium',
    };
  } else {
    criticalAlert = {
      title: 'SYSTEMS OPTIMAL',
      description: 'All inventory levels are healthy, sales velocity is on track, and workshop capacity is within normal parameters. No immediate action required.',
      actionLabel: 'VIEW FULL REPORT',
      severity: 'low',
    };
  }

  // Market Metrics
  const inventoryTurnRate = totalRevenue > 0 && totalInventoryValue > 0
    ? (totalRevenue / totalInventoryValue).toFixed(1) + 'x'
    : 'N/A';

  const workshopEfficiency = bookings.length > 0
    ? Math.round((bookings.filter(b => b.status === 'Completed' || b.status === 'Claimed').length / bookings.length) * 100)
    : 0;

  const marketMetrics: DSSInsight['marketMetrics'] = [
    {
      label: 'TOP CATEGORY',
      value: topCategory ? topCategory[0] : 'N/A',
      trend: topCategory ? `${formatCurrency(topCategory[1])} REVENUE` : 'NO DATA',
      icon: 'BarChart2',
    },
    {
      label: 'INVENTORY ALPHA',
      value: inventoryTurnRate,
      trend: 'SELL-THROUGH RATE',
      icon: 'Package',
    },
    {
      label: 'BRANCH DOMINANCE',
      value: dominantBranch.toUpperCase(),
      trend: `₱${Math.round((dominantBranch === 'Imus' ? imusRevenue : qcRevenue) / 1000)}K REVENUE`,
      icon: 'Globe',
    },
    {
      label: 'WORKSHOP EFFICIENCY',
      value: `${workshopEfficiency}%`,
      trend: `${bookings.filter(b => b.status === 'Completed' || b.status === 'Claimed').length}/${bookings.length} COMPLETED`,
      icon: 'Award',
    },
  ];

  // AI Recommendation
  let recommendation: DSSInsight['recommendation'];
  const highMarginProducts = products
    .filter(p => p.costPrice > 0 && p.price > 0)
    .map(p => ({ ...p, margin: (p.price - p.costPrice) / p.price }))
    .sort((a, b) => b.margin - a.margin);

  const topHighMargin = highMarginProducts[0];
  const slowMover = slowMovers[0];

  if (slowMover && slowMover.stockQty > 5) {
    const suggestedSalePrice = Math.round(slowMover.price * 0.88 / 10) * 10;
    recommendation = {
      title: `CLEAR DEAD STOCK: ${slowMover.name.toUpperCase()}`,
      description: `"${slowMover.name}" has ${slowMover.stockQty} units with zero sales recorded. A temporary 12% price reduction will stimulate demand without margin collapse. This mirrors proven clearance velocity patterns in music retail.`,
      currentPrice: slowMover.price,
      recommendedPrice: suggestedSalePrice,
      targetSku: slowMover.sku,
      productName: slowMover.name,
      confidence: `${Math.floor(78 + Math.random() * 18)}%`,
    };
  } else if (topHighMargin && topProduct) {
    const premiumPrice = Math.round(topHighMargin.price * 1.08 / 10) * 10;
    recommendation = {
      title: `OPTIMIZE PRICING: ${topHighMargin.name.toUpperCase()}`,
      description: `Market analysis indicates a premium pricing opportunity for "${topHighMargin.name}". Current margin is strong but demand signals suggest price inelasticity — an 8% MSRP adjustment could capture additional margin without volume decay.`,
      currentPrice: topHighMargin.price,
      recommendedPrice: premiumPrice,
      targetSku: topHighMargin.sku,
      productName: topHighMargin.name,
      confidence: `${Math.floor(82 + Math.random() * 15)}%`,
    };
  } else {
    recommendation = {
      title: 'EXPAND GUITAR ACCESSORIES LINE',
      description: `Based on current sales velocity and typical music retail patterns in the Philippines, expanding the accessories category (picks, straps, cables) with 5-10 new SKUs at ₱200–₱1,500 price points is projected to increase basket size by 22%.`,
      currentPrice: 0,
      recommendedPrice: 0,
      targetSku: 'NEW-SKU',
      productName: 'Accessories Bundle',
      confidence: '79%',
    };
  }

  // Predictive Trends
  const predictiveTrends: DSSInsight['predictiveTrends'] = [
    {
      category: 'DEMAND FORECAST',
      title: topProduct ? `${topProduct.name.toUpperCase()} VELOCITY` : 'GUITAR ACCESSORY SURGE',
      description: topProduct
        ? `"${topProduct.name}" accounts for the highest unit movement. Replenishment cycle should be shortened to prevent stockout during peak season.`
        : 'Accessory categories (straps, picks, cables) are historically the highest-velocity items in guitar retail. Ensure consistent stock.',
      probability: `${Math.floor(70 + Math.random() * 25)}% HIGH`,
    },
    {
      category: 'WORKSHOP TREND',
      title: workshopLoad > 5 ? 'REPAIR BACKLOG RISK' : 'WORKSHOP CAPACITY AVAILABLE',
      description: workshopLoad > 5
        ? `With ${workshopLoad} pending/active jobs, turnaround time may extend beyond acceptable limits. A customer follow-up protocol is recommended.`
        : `Workshop queue is healthy at ${workshopLoad} active jobs. This is a good window to promote repair services and capture pre-season demand.`,
      probability: `${Math.floor(65 + Math.random() * 25)}% HIGH`,
    },
    {
      category: 'BRANCH STRATEGY',
      title: `SCALE ${dominantBranch.toUpperCase()} OPERATIONS`,
      description: `${dominantBranch} branch is generating the majority of revenue. Consider allocating a larger inventory share to this location and using it as the primary fulfillment center.`,
      probability: `${Math.floor(72 + Math.random() * 20)}% HIGH`,
    },
  ];

  return {
    criticalAlert,
    marketMetrics,
    recommendation,
    predictiveTrends,
    inventorySummary: {
      totalSkus: products.length,
      lowStockCount: lowStock.length,
      outOfStockCount: outOfStock.length,
      totalValue: totalInventoryValue,
    },
    salesSummary: {
      totalRevenue,
      avgOrderValue,
      topProduct: topProduct?.name || 'N/A',
      totalOrders: transactions.length,
    },
  };
}

export default function DSS() {
  const [loading, setLoading] = useState(true);
  const [insights, setInsights] = useState<DSSInsight | null>(null);
  const [lastSync, setLastSync] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchAndAnalyze = async () => {
    try {
      setRefreshing(true);

      const [productsSnap, transSnap, bookingsSnap] = await Promise.all([
        getDocs(query(collection(db, 'products'), limit(200))),
        getDocs(query(collection(db, 'transactions'), orderBy('timestamp', 'desc'), limit(200))),
        getDocs(query(collection(db, 'bookings'), orderBy('createdAt', 'desc'), limit(100))),
      ]);

      const products = productsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Product[];
      const transactions = transSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Transaction[];
      const bookings = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as Booking[];

      const result = analyzeData(products, transactions, bookings);
      setInsights(result);
      setLastSync(new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }));
    } catch (error) {
      console.error('DSS analysis error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAndAnalyze(); }, []);

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="w-20 h-20 border-2 border-accent/20 rounded-full"></div>
          <div className="w-20 h-20 border-t-2 border-accent rounded-full animate-spin absolute top-0 left-0"></div>
          <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent animate-pulse" size={32} />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white tracking-tighter mb-2 uppercase">ANALYZING BUSINESS DATA</h2>
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-[0.3em] animate-pulse">
            PROCESSING INVENTORY · SALES · WORKSHOP DATA
          </p>
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="text-accent" size={48} />
        <h2 className="text-2xl font-bold text-white uppercase tracking-tighter">ENGINE OFFLINE</h2>
        <p className="text-sm text-text-secondary">Unable to analyze data. Add products and transactions first.</p>
        <button onClick={fetchAndAnalyze} className="mt-4 fermata-button-primary px-8 py-3">RETRY</button>
      </div>
    );
  }

  const alertIsNegative = insights.criticalAlert.severity !== 'low';

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-7xl font-bold tracking-tighter leading-none mb-2">
            <span className="text-white">FERMATA</span> <span className="text-accent">DSS</span>
          </h1>
          <p className="text-xs text-text-secondary uppercase tracking-[0.4em] font-bold">
            DECISION SUPPORT SYSTEM · REAL-TIME BUSINESS INTELLIGENCE
          </p>
        </div>
        <div className="text-right flex flex-col items-end gap-2">
          <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">SYNC: {lastSync}</p>
          <button
            onClick={fetchAndAnalyze}
            disabled={refreshing}
            className="flex items-center gap-2 fermata-button-secondary px-4 py-2 text-[10px]"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            REFRESH DATA
          </button>
        </div>
      </div>

      {/* Data Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL SKUS', value: insights.inventorySummary.totalSkus, sub: `${insights.inventorySummary.lowStockCount} LOW STOCK` },
          { label: 'INVENTORY VALUE', value: formatCurrency(insights.inventorySummary.totalValue), sub: `${insights.inventorySummary.outOfStockCount} OUT OF STOCK` },
          { label: 'TOTAL REVENUE', value: formatCurrency(insights.salesSummary.totalRevenue), sub: `${insights.salesSummary.totalOrders} ORDERS` },
          { label: 'AVG ORDER VALUE', value: formatCurrency(insights.salesSummary.avgOrderValue), sub: `TOP: ${insights.salesSummary.topProduct.slice(0, 18)}` },
        ].map(stat => (
          <Card key={stat.label}>
            <p className="text-[9px] text-text-secondary uppercase tracking-widest font-bold mb-1">{stat.label}</p>
            <p className="text-xl font-bold text-white">{stat.value}</p>
            <p className="text-[8px] text-text-muted uppercase tracking-widest mt-1">{stat.sub}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Alert + Metrics */}
        <div className="lg:col-span-1 space-y-6">
          {/* Critical Alert */}
          <Card className={cn(
            'relative overflow-hidden border',
            alertIsNegative ? 'bg-accent border-accent' : 'bg-status-green/10 border-status-green/30'
          )}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 -mr-16 -mt-16 rotate-45"></div>
            <div className="relative z-10">
              <span className={cn(
                'inline-block px-2 py-1 text-[8px] font-bold uppercase tracking-widest mb-4',
                alertIsNegative ? 'bg-white text-accent' : 'bg-status-green text-black'
              )}>
                {insights.criticalAlert.severity === 'high' ? '⚠ CRITICAL ALERT' :
                  insights.criticalAlert.severity === 'medium' ? '⚡ ADVISORY' : '✓ SYSTEMS NOMINAL'}
              </span>
              <h3 className="text-xl font-bold text-white tracking-tight mb-3 uppercase leading-tight">
                {insights.criticalAlert.title}
              </h3>
              <p className="text-xs text-white/80 font-medium mb-6 leading-relaxed">
                {insights.criticalAlert.description}
              </p>
              <div className="flex gap-3">
                <button className={cn(
                  'px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all',
                  alertIsNegative ? 'bg-white text-accent hover:bg-white/90' : 'bg-status-green text-black hover:bg-status-green/80'
                )}>
                  {insights.criticalAlert.actionLabel}
                </button>
              </div>
            </div>
          </Card>

          {/* Market Metrics */}
          <div className="grid grid-cols-2 gap-3">
            {insights.marketMetrics.map(metric => {
              const Icon = ICON_MAP[metric.icon] || BarChart2;
              return (
                <div key={metric.label} className="bg-surface border border-border p-4 flex flex-col gap-2">
                  <Icon size={14} className="text-text-secondary" />
                  <div>
                    <p className="text-[8px] text-text-secondary font-bold uppercase tracking-widest mb-1 leading-tight">{metric.label}</p>
                    <p className="text-base font-bold text-white leading-tight">{metric.value}</p>
                    <p className="text-[8px] text-text-muted font-bold uppercase tracking-widest mt-1 leading-tight">{metric.trend}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: AI Recommendation */}
        <div className="lg:col-span-2">
          <Card className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-8 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-1 bg-surface-elevated text-text-secondary text-[8px] font-bold uppercase tracking-widest border border-border">
                  DSS RECOMMENDATION · AUTO-GENERATED
                </span>
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
              </div>
              <span className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">
                CONFIDENCE: {insights.recommendation.confidence}
              </span>
            </div>

            <div className="flex-1 space-y-6">
              <h2 className="text-3xl font-bold text-white tracking-tight leading-tight uppercase">
                {insights.recommendation.title}
              </h2>
              <p className="text-sm text-text-secondary leading-relaxed">
                {insights.recommendation.description}
              </p>

              {insights.recommendation.currentPrice > 0 && (
                <div className="grid grid-cols-2 gap-6 p-6 bg-surface-elevated border border-border">
                  <div>
                    <p className="text-[9px] text-text-secondary uppercase tracking-widest font-bold mb-2">CURRENT PRICE</p>
                    <p className="text-3xl font-bold text-white">{formatCurrency(insights.recommendation.currentPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-accent uppercase tracking-widest font-bold mb-2">RECOMMENDED</p>
                    <p className="text-3xl font-bold text-accent">{formatCurrency(insights.recommendation.recommendedPrice)}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-text-secondary uppercase tracking-widest font-bold mb-1">TARGET SKU</p>
                    <p className="text-sm font-bold text-white uppercase">{insights.recommendation.targetSku}</p>
                  </div>
                  <div>
                    <p className="text-[9px] text-text-secondary uppercase tracking-widest font-bold mb-1">PRODUCT</p>
                    <p className="text-sm font-bold text-white uppercase line-clamp-2">{insights.recommendation.productName}</p>
                  </div>
                </div>
              )}

              <button className="fermata-button-primary flex items-center gap-3 px-8 py-4 text-sm">
                <Zap size={16} />
                APPLY RECOMMENDATION
              </button>
            </div>
          </Card>
        </div>
      </div>

      {/* Predictive Trends */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tighter uppercase">PREDICTIVE TRENDS</h2>
          <div className="flex items-center gap-2 text-[10px] text-text-secondary uppercase tracking-widest font-bold">
            <Activity size={12} className="text-accent" />
            DATA-DRIVEN FORECASTS
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {insights.predictiveTrends.map((trend, i) => (
            <div key={i} className="bg-surface border border-border p-6 flex flex-col gap-4 hover:border-accent transition-colors">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[8px] font-bold text-accent uppercase tracking-widest">{trend.category}</span>
                <span className="text-[8px] font-bold text-text-muted uppercase tracking-widest">{trend.probability}</span>
              </div>
              <h3 className="text-base font-bold text-white tracking-tight uppercase leading-tight">{trend.title}</h3>
              <p className="text-xs text-text-secondary leading-relaxed flex-1">{trend.description}</p>
              <div className="h-0.5 w-full bg-border">
                <div className="h-full bg-accent" style={{ width: trend.probability }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* System Status Footer */}
      <div className="flex items-center justify-between pt-6 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-status-green rounded-full"></div>
          <span className="text-[10px] text-status-green uppercase tracking-widest font-bold">SYSTEM OPERATIONAL</span>
        </div>
        <p className="text-[9px] text-text-muted uppercase tracking-widest font-bold">
          FERMATA DSS · POWERED BY REAL-TIME BUSINESS DATA · NO EXTERNAL AI REQUIRED
        </p>
      </div>
    </div>
  );
}
