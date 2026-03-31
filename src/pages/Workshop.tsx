import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, addDoc, updateDoc, doc, deleteDoc, orderBy, Timestamp } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Booking, Branch } from '../types';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { cn, formatDate } from '../lib/utils';
import { useFirebase } from '../components/FirebaseProvider';
import { Plus, X, Search, MoreVertical, Clock, CheckCircle2, AlertCircle, Loader2, Trash2 } from 'lucide-react';

const SERVICE_TYPES = ['Full Setup', 'Fret Level', 'Nut Filing', 'Bridge Adjust', 'Pickup Swap', 'Neck Adjustment', 'Cleaning & Polish', 'Restring', 'Electronics Repair', 'Custom Build', 'Other'];

const STATUS_COLORS: Record<Booking['status'], string> = {
  Pending: 'bg-surface-elevated text-text-secondary',
  Ongoing: 'bg-accent/20 text-accent border border-accent/50',
  Completed: 'bg-status-green/20 text-status-green border border-status-green/50',
  Claimed: 'bg-surface-elevated text-text-muted',
};

export default function Workshop() {
  const { userData } = useFirebase();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState<Branch | 'All'>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    customerName: '', contact: '', email: '', instrumentType: '',
    instrumentModel: '', serviceType: '', description: '', preferredDate: '',
    branch: 'Imus' as Branch, status: 'Pending' as Booking['status'],
    progress: 0, technician: '', notes: '',
  });

  useEffect(() => {
    const q = query(collection(db, 'bookings'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      setBookings(snap.docs.map(d => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate ? d.data().createdAt.toDate() : new Date(d.data().createdAt || Date.now()),
      })) as Booking[]);
      setLoading(false);
    }, err => handleFirestoreError(err, OperationType.LIST, 'bookings'));
    return () => unsub();
  }, []);

  const filteredBookings = bookings.filter(b => {
    const matchBranch = selectedBranch === 'All' || b.branch === selectedBranch;
    const matchSearch = b.customerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.instrumentType.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchBranch && matchSearch;
  });

  const openModal = (booking?: Booking) => {
    if (booking) {
      setEditingBooking(booking);
      setForm({
        customerName: booking.customerName || '',
        contact: booking.contact || '',
        email: booking.email || '',
        instrumentType: booking.instrumentType || '',
        instrumentModel: booking.instrumentModel || '',
        serviceType: booking.serviceType || '',
        description: booking.description || '',
        preferredDate: booking.preferredDate || '',
        branch: booking.branch || 'Imus',
        status: booking.status || 'Pending',
        progress: booking.progress || 0,
        technician: booking.technician || '',
        notes: booking.notes || '',
      });
    } else {
      setEditingBooking(null);
      setForm({
        customerName: '', contact: '', email: '', instrumentType: '',
        instrumentModel: '', serviceType: '', description: '', preferredDate: '',
        branch: userData?.branch || 'Imus', status: 'Pending',
        progress: 0, technician: '', notes: '',
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingBooking(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const bookingData = {
      customerName: form.customerName,
      contact: form.contact,
      email: form.email || null,
      instrumentType: form.instrumentType,
      instrumentModel: form.instrumentModel || null,
      serviceType: form.serviceType,
      description: form.description,
      preferredDate: form.preferredDate || null,
      branch: form.branch,
      status: form.status,
      progress: Number(form.progress),
      technician: form.technician || null,
      notes: form.notes || null,
      createdAt: editingBooking ? editingBooking.createdAt : Timestamp.now(),
    };

    // Strip undefined values (Firestore rejects them)
    const cleanBooking = Object.fromEntries(
      Object.entries(bookingData).filter(([_, v]) => v !== undefined)
    );

    try {
      if (editingBooking) {
        await updateDoc(doc(db, 'bookings', editingBooking.id), cleanBooking);
      } else {
        await addDoc(collection(db, 'bookings'), cleanBooking);
      }
      closeModal();
    } catch (err) {
      handleFirestoreError(err, editingBooking ? OperationType.UPDATE : OperationType.CREATE, 'bookings');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingBooking || !window.confirm('Delete this work order?')) return;
    try {
      await deleteDoc(doc(db, 'bookings', editingBooking.id));
      closeModal();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `bookings/${editingBooking.id}`);
    }
  };

  const activeJobs = bookings.filter(b => b.status === 'Ongoing');
  const pendingJobs = bookings.filter(b => b.status === 'Pending');

  return (
    <div className="flex flex-col gap-10 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-6xl font-bold text-white tracking-tighter mb-2 uppercase">SERVICE QUEUE</h1>
          <p className="text-sm text-text-secondary uppercase tracking-[0.3em] font-medium">
            <span className="text-accent">{activeJobs.length} ACTIVE PROJECTS</span> · {formatDate(new Date())}
          </p>
        </div>
        <Button onClick={() => openModal()} className="flex items-center gap-2">
          <Plus size={16} />
          <span className="text-[10px]">NEW WORK ORDER</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'TOTAL QUEUE', value: bookings.length, icon: Clock, color: 'text-white' },
          { label: 'ACTIVE PULSE', value: activeJobs.length, icon: AlertCircle, color: 'text-accent' },
          { label: 'PENDING', value: pendingJobs.length, icon: Clock, color: 'text-text-muted' },
          { label: 'COMPLETED', value: bookings.filter(b => b.status === 'Completed' || b.status === 'Claimed').length, icon: CheckCircle2, color: 'text-status-green' },
        ].map(stat => (
          <Card key={stat.label} className="p-6 bg-surface/50 border-border/50">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-1">{stat.label}</p>
                <p className={cn('text-3xl font-bold tracking-tighter', stat.color)}>{stat.value}</p>
              </div>
              <stat.icon size={20} className={stat.color} />
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" size={18} />
          <input
            type="text"
            placeholder="SEARCH BY CLIENT, INSTRUMENT, OR REF_ID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-surface border border-border pl-12 pr-4 py-4 text-xs uppercase tracking-widest focus:outline-none focus:border-accent"
          />
        </div>
        <div className="flex bg-surface border border-border p-1">
          {(['All', 'Imus', 'Quezon City'] as const).map(branch => (
            <button
              key={branch}
              onClick={() => setSelectedBranch(branch)}
              className={cn(
                'px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all',
                selectedBranch === branch ? 'bg-accent text-white' : 'text-text-secondary hover:text-white'
              )}
            >{branch}</button>
          ))}
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Work Orders Table */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-bold text-white tracking-widest uppercase border-b border-border pb-4">DETAILED WORK ORDERS</h2>
          <div className="bg-surface border border-border overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-elevated border-b border-border">
                  {['PROJECT', 'CLIENT', 'SERVICE TYPE', 'STATUS', 'PROGRESS', ''].map(h => (
                    <th key={h} className="p-4 text-[10px] font-bold text-text-secondary uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {loading ? (
                  <tr><td colSpan={6} className="p-20 text-center">
                    <Loader2 className="animate-spin text-accent mx-auto mb-4" size={32} />
                    <p className="text-[10px] text-text-muted uppercase tracking-widest">SYNCING_QUEUE...</p>
                  </td></tr>
                ) : filteredBookings.length === 0 ? (
                  <tr><td colSpan={6} className="p-20 text-center">
                    <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">NO WORK ORDERS FOUND</p>
                  </td></tr>
                ) : filteredBookings.map(job => (
                  <tr key={job.id} className="hover:bg-surface-elevated transition-colors">
                    <td className="p-4">
                      <p className="text-xs font-bold text-white tracking-wider uppercase">{job.instrumentType}</p>
                      {job.instrumentModel && <p className="text-[9px] text-text-secondary uppercase">{job.instrumentModel}</p>}
                      <p className="text-[8px] text-text-muted">REF: {job.id.slice(-6).toUpperCase()}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-xs font-bold text-white uppercase">{job.customerName}</p>
                      <p className="text-[9px] text-text-secondary">{job.contact}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-[10px] text-text-secondary uppercase">{job.serviceType || '—'}</p>
                    </td>
                    <td className="p-4">
                      <span className={cn('px-2 py-1 text-[8px] font-bold uppercase tracking-widest', STATUS_COLORS[job.status])}>
                        {job.status === 'Ongoing' ? 'ACTIVE PULSE' : job.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4 w-36">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-background overflow-hidden">
                          <div className="h-full bg-accent transition-all" style={{ width: `${job.progress}%` }}></div>
                        </div>
                        <span className="text-[10px] font-bold text-white">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <button onClick={() => openModal(job)} className="p-2 text-text-secondary hover:text-white">
                        <MoreVertical size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <h2 className="text-lg font-bold text-white tracking-widest uppercase border-b border-border pb-4">ACTIVE JOBS</h2>
          {activeJobs.length === 0 ? (
            <div className="bg-surface border border-border p-8 text-center">
              <p className="text-[10px] text-text-muted uppercase tracking-widest font-bold">NO ACTIVE PROJECTS</p>
            </div>
          ) : activeJobs.slice(0, 3).map(job => (
            <div key={job.id} className="bg-accent p-6 flex flex-col gap-4 relative overflow-hidden cursor-pointer" onClick={() => openModal(job)}>
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 -mr-16 -mt-16 rotate-45"></div>
              <div className="relative z-10">
                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-1">
                  {job.serviceType || 'IN PROGRESS'}
                </p>
                <h3 className="text-xl font-bold text-white tracking-tight uppercase">{job.instrumentType}</h3>
                {job.instrumentModel && <p className="text-xs text-white/70 uppercase">{job.instrumentModel}</p>}
              </div>
              <div className="relative z-10">
                <p className="text-[10px] text-white font-bold uppercase mb-3">CLIENT: {job.customerName}</p>
                <div className="flex justify-between items-center text-[9px] font-bold text-white uppercase mb-2">
                  <span>{job.technician ? `TECH: ${job.technician}` : 'TECH: TBD'}</span>
                  <span>{job.progress}%</span>
                </div>
                <div className="h-1 w-full bg-black/20 overflow-hidden">
                  <div className="h-full bg-white transition-all" style={{ width: `${job.progress}%` }}></div>
                </div>
              </div>
            </div>
          ))}

          <div className="bg-surface border border-border p-6">
            <p className="text-[10px] text-text-secondary uppercase tracking-widest font-bold mb-4">UPCOMING APPOINTMENTS</p>
            <div className="space-y-3">
              {pendingJobs.length === 0 ? (
                <p className="text-[10px] text-text-muted uppercase tracking-widest text-center py-4">NONE</p>
              ) : pendingJobs.slice(0, 4).map(job => (
                <div key={job.id} className="flex items-center gap-4 p-3 bg-background border border-border hover:border-accent transition-colors cursor-pointer" onClick={() => openModal(job)}>
                  <div className="text-center border-r border-border pr-4 min-w-[55px]">
                    <p className="text-[8px] text-text-secondary font-bold uppercase">
                      {job.preferredDate ? new Date(job.preferredDate).toLocaleString('default', { month: 'short' }) : 'TBD'}
                    </p>
                    <p className="text-lg font-bold text-white">
                      {job.preferredDate ? new Date(job.preferredDate).getDate() : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white uppercase">{job.instrumentType}</p>
                    <p className="text-[9px] text-text-secondary uppercase">{job.serviceType || job.description?.slice(0, 20)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/90 backdrop-blur-sm">
          <Card className="w-full max-w-2xl p-8 border-accent/20 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white tracking-tighter uppercase">
                  {editingBooking ? 'EDIT WORK ORDER' : 'NEW WORK ORDER'}
                </h2>
                {editingBooking && (
                  <p className="text-[10px] text-text-secondary uppercase tracking-[0.4em] mt-1 font-bold">
                    REF: {editingBooking.id.toUpperCase()}
                  </p>
                )}
              </div>
              <button onClick={closeModal} className="p-2 text-text-muted hover:text-white"><X size={24} /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">CUSTOMER NAME *</label>
                  <input className="fermata-input" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">CONTACT NUMBER *</label>
                  <input className="fermata-input" value={form.contact} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">EMAIL</label>
                  <input type="email" className="fermata-input" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">PREFERRED DATE *</label>
                  <input type="date" className="fermata-input" value={form.preferredDate} onChange={e => setForm(f => ({ ...f, preferredDate: e.target.value }))} required />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">INSTRUMENT TYPE *</label>
                  <select className="fermata-input" value={form.instrumentType} onChange={e => setForm(f => ({ ...f, instrumentType: e.target.value }))} required>
                    <option value="">SELECT...</option>
                    {['Electric Guitar', 'Acoustic Guitar', 'Bass Guitar', 'Classical Guitar', 'Amplifier', 'Effects Pedal', 'Other'].map(t => (
                      <option key={t} value={t}>{t.toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">INSTRUMENT MODEL / SERIAL</label>
                  <input className="fermata-input" placeholder="E.G. FENDER STRATOCASTER #9-1959" value={form.instrumentModel} onChange={e => setForm(f => ({ ...f, instrumentModel: e.target.value }))} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">SERVICE TYPE *</label>
                  <select className="fermata-input" value={form.serviceType} onChange={e => setForm(f => ({ ...f, serviceType: e.target.value }))} required>
                    <option value="">SELECT SERVICE</option>
                    {SERVICE_TYPES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">BRANCH *</label>
                  <select className="fermata-input" value={form.branch} onChange={e => setForm(f => ({ ...f, branch: e.target.value as Branch }))}>
                    <option value="Imus">IMUS, CAVITE</option>
                    <option value="Quezon City">QUEZON CITY</option>
                  </select>
                </div>
                {editingBooking && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">STATUS</label>
                      <select className="fermata-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Booking['status'] }))}>
                        {(['Pending', 'Ongoing', 'Completed', 'Claimed'] as Booking['status'][]).map(s => (
                          <option key={s} value={s}>{s.toUpperCase()}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">PROGRESS ({form.progress}%)</label>
                      <input
                        type="range" min="0" max="100" step="5"
                        value={form.progress}
                        onChange={e => setForm(f => ({ ...f, progress: Number(e.target.value) }))}
                        className="w-full accent-red-600"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">ASSIGNED TECHNICIAN</label>
                      <input className="fermata-input" placeholder="TECHNICIAN NAME" value={form.technician} onChange={e => setForm(f => ({ ...f, technician: e.target.value }))} />
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">REPAIR DESCRIPTION / PROBLEM *</label>
                <textarea
                  className="fermata-input w-full min-h-[80px] py-3 uppercase text-[10px] tracking-widest resize-none"
                  placeholder="DESCRIBE THE REPAIR NEEDED..."
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">INTERNAL NOTES</label>
                <textarea
                  className="fermata-input w-full min-h-[60px] py-3 uppercase text-[10px] tracking-widest resize-none"
                  placeholder="TECHNICIAN NOTES (INTERNAL USE)..."
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                />
              </div>

              <div className="flex justify-end gap-4 pt-6 border-t border-border">
                {editingBooking && (
                  <Button type="button" variant="secondary" onClick={handleDelete}
                    className="bg-accent/10 text-accent hover:bg-accent hover:text-white border-accent/20">
                    <Trash2 size={14} className="mr-2" /> DELETE
                  </Button>
                )}
                <Button type="button" variant="secondary" onClick={closeModal}>CANCEL</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 size={14} className="animate-spin mr-2" /> : null}
                  {editingBooking ? 'UPDATE ORDER' : 'CREATE ORDER'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}