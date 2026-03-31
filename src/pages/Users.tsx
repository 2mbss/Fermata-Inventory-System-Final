import React, { useState, useEffect } from 'react';
import { Plus, User, Shield, MapPin, MoreVertical, Check, X, Loader2, Trash2, KeyRound } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { cn } from '../lib/utils';
import { User as UserType, Branch, Role } from '../types';
import {
  collection, onSnapshot, doc, updateDoc, deleteDoc, setDoc,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword, sendPasswordResetEmail,
} from 'firebase/auth';
import { db, auth } from '../firebase';
import { useFirebase } from '../components/FirebaseProvider';
import { Button } from '../components/ui/Button';

const ALL_PERMISSIONS = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'pos', label: 'Terminal POS' },
  { id: 'workshop', label: 'Luthier Workshop' },
  { id: 'analytics', label: 'Business Analytics' },
  { id: 'dss', label: 'Fermata DSS' },
  { id: 'users', label: 'User Management' },
];

const EMPTY_CREATE_FORM = {
  name: '', email: '', password: '', role: 'Branch Staff' as Role,
  branch: 'Imus' as Branch, permissions: ['pos', 'workshop'] as string[],
};

export default function Users() {
  const { userData: currentUser } = useFirebase();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM });
  const [createError, setCreateError] = useState('');
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = currentUser?.role === 'Super Admin';

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snap) => {
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })) as UserType[]);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'users', editingUser.id), {
        role: editingUser.role,
        branch: editingUser.branch || null,
        active: editingUser.active,
        permissions: editingUser.role === 'Super Admin' ? ['all'] : (editingUser.permissions || []),
      });
      setIsEditModalOpen(false);
      setEditingUser(null);
    } catch (err) {
      console.error('Error updating user:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setSaving(true);
    try {
      // Create Firebase Auth user
      const cred = await createUserWithEmailAndPassword(auth, createForm.email, createForm.password);

      // Create Firestore user document
      const newUser: UserType = {
        id: cred.user.uid,
        email: createForm.email,
        name: createForm.name,
        role: createForm.role,
        branch: createForm.role === 'Super Admin' ? undefined : createForm.branch,
        permissions: createForm.role === 'Super Admin' ? ['all'] : createForm.permissions,
        active: true,
      };

      await setDoc(doc(db, 'users', cred.user.uid), newUser);
      setIsCreateModalOpen(false);
      setCreateForm({ ...EMPTY_CREATE_FORM });
    } catch (err: any) {
      console.error('Create user error:', err);
      if (err.code === 'auth/email-already-in-use') setCreateError('EMAIL ALREADY IN USE.');
      else if (err.code === 'auth/weak-password') setCreateError('PASSWORD MUST BE AT LEAST 6 CHARACTERS.');
      else setCreateError(err.message?.toUpperCase() || 'FAILED TO CREATE USER.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (user: UserType) => {
    if (user.id === currentUser?.id) return; // can't disable yourself
    try {
      await updateDoc(doc(db, 'users', user.id), { active: !user.active });
    } catch (err) { console.error(err); }
  };

  const handlePasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      alert(`Password reset email sent to ${email}`);
    } catch (err) { console.error(err); alert('Failed to send reset email.'); }
  };

  const handleDeleteUser = async (user: UserType) => {
    if (user.id === currentUser?.id) { alert("You can't delete your own account."); return; }
    if (!window.confirm(`Delete user "${user.name}"? This removes their access permanently.`)) return;
    try {
      await deleteDoc(doc(db, 'users', user.id));
      setIsEditModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const togglePermission = (perm: string, forEdit = false) => {
    if (forEdit && editingUser) {
      const perms = editingUser.permissions || [];
      const updated = perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm];
      setEditingUser({ ...editingUser, permissions: updated });
    } else {
      const perms = createForm.permissions;
      const updated = perms.includes(perm) ? perms.filter(p => p !== perm) : [...perms, perm];
      setCreateForm(f => ({ ...f, permissions: updated }));
    }
  };

  if (loading) {
    return (
      <div className="h-[60vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-accent" size={48} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-6xl font-bold text-white tracking-tighter mb-2 uppercase">USER MANAGEMENT</h1>
          <p className="text-sm text-text-secondary uppercase tracking-[0.3em] font-medium">
            <span className="text-accent">{users.length} TOTAL ACCOUNTS</span> · ACCESS CONTROL LIST
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setIsCreateModalOpen(true)} className="flex items-center gap-2">
            <Plus size={16} />
            <span className="text-[10px]">CREATE USER</span>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Users Table */}
        <div className="lg:col-span-2">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-elevated border-b border-border">
                  {['USER IDENTITY', 'ROLE / BRANCH', 'PERMISSIONS', 'STATUS', ''].map(h => (
                    <th key={h} className="p-5 text-[10px] font-bold text-text-secondary uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map(user => (
                  <tr key={user.id} className={cn('hover:bg-surface-elevated transition-colors', !user.active && 'opacity-50 grayscale')}>
                    <td className="p-5">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-background border border-border flex items-center justify-center">
                          <User size={18} className="text-text-secondary" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-white tracking-wider">{user.name}</p>
                          <p className="text-[9px] text-text-secondary uppercase tracking-widest">{user.email}</p>
                          {user.id === currentUser?.id && (
                            <span className="text-[7px] text-accent font-bold uppercase">YOU</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-5">
                      <div className="flex items-center gap-2 mb-1">
                        <Shield size={12} className="text-accent" />
                        <p className="text-[10px] font-bold text-white uppercase tracking-widest">{user.role}</p>
                      </div>
                      {user.branch && (
                        <div className="flex items-center gap-2">
                          <MapPin size={12} className="text-text-secondary" />
                          <p className="text-[9px] text-text-secondary uppercase tracking-widest">{user.branch}</p>
                        </div>
                      )}
                    </td>
                    <td className="p-5">
                      <div className="flex flex-wrap gap-1">
                        {user.permissions?.includes('all') ? (
                          <span className="text-[7px] font-bold bg-accent/20 text-accent border border-accent/30 px-1.5 py-0.5 uppercase">ALL ACCESS</span>
                        ) : (user.permissions || []).slice(0, 3).map(p => (
                          <span key={p} className="text-[7px] font-bold bg-surface text-text-secondary border border-border px-1.5 py-0.5 uppercase">{p}</span>
                        ))}
                        {(user.permissions || []).length > 3 && !user.permissions?.includes('all') && (
                          <span className="text-[7px] text-text-muted">+{(user.permissions || []).length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="p-5">
                      <button
                        onClick={() => isSuperAdmin && toggleStatus(user)}
                        disabled={!isSuperAdmin || user.id === currentUser?.id}
                        className={cn(
                          'px-2 py-1 text-[8px] font-bold uppercase tracking-widest flex items-center gap-1.5 disabled:cursor-default',
                          user.active ? 'text-status-green bg-status-green/10' : 'text-status-red bg-status-red/10'
                        )}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full', user.active ? 'bg-status-green' : 'bg-status-red')}></div>
                        {user.active ? 'ACTIVE' : 'DISABLED'}
                      </button>
                    </td>
                    <td className="p-5 text-right">
                      {isSuperAdmin && (
                        <button
                          onClick={() => { setEditingUser(user); setIsEditModalOpen(true); }}
                          className="p-2 text-text-secondary hover:text-white transition-colors"
                        >
                          <MoreVertical size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>

        {/* Permission Reference */}
        <div className="space-y-6">
          <Card title="ACCESS LEVELS" subtitle="ROLE DEFINITIONS">
            <div className="space-y-6">
              {[
                { label: 'SUPER ADMIN', desc: 'Full system access across all branches, modules, and user management. Cannot be restricted.' },
                { label: 'BRANCH STAFF', desc: 'Permission-based access scoped to assigned branch only. Super Admin configures allowed modules.' },
              ].map(p => (
                <div key={p.label} className="flex gap-4">
                  <div className="mt-1">
                    <div className="w-4 h-4 border border-accent flex items-center justify-center flex-shrink-0">
                      <Check size={10} className="text-accent" />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-white uppercase tracking-widest mb-1">{p.label}</p>
                    <p className="text-[9px] text-text-secondary leading-relaxed">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="AVAILABLE PERMISSIONS">
            <div className="space-y-3 mt-2">
              {ALL_PERMISSIONS.map(perm => (
                <div key={perm.id} className="flex items-center gap-3 py-2 border-b border-border last:border-0">
                  <div className="w-1.5 h-1.5 bg-accent rounded-full flex-shrink-0"></div>
                  <p className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">{perm.label}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Edit User Modal */}
      {isEditModalOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight uppercase">EDIT USER ACCESS</h3>
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">{editingUser.email}</p>
              </div>
              <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUpdateUser} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">ASSIGNED ROLE</label>
                <select
                  value={editingUser.role}
                  onChange={e => setEditingUser({ ...editingUser, role: e.target.value as Role })}
                  className="w-full bg-background border border-border p-4 text-xs font-bold text-white uppercase tracking-widest focus:border-accent outline-none"
                >
                  <option value="Super Admin">Super Admin</option>
                  <option value="Branch Staff">Branch Staff</option>
                </select>
              </div>

              {editingUser.role !== 'Super Admin' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">BRANCH ASSIGNMENT</label>
                    <select
                      value={editingUser.branch || 'Imus'}
                      onChange={e => setEditingUser({ ...editingUser, branch: e.target.value as Branch })}
                      className="w-full bg-background border border-border p-4 text-xs font-bold text-white uppercase tracking-widest focus:border-accent outline-none"
                    >
                      <option value="Imus">Imus, Cavite</option>
                      <option value="Quezon City">Quezon City</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">MODULE PERMISSIONS</label>
                    {ALL_PERMISSIONS.map(perm => {
                      const active = (editingUser.permissions || []).includes(perm.id);
                      return (
                        <div
                          key={perm.id}
                          onClick={() => togglePermission(perm.id, true)}
                          className={cn(
                            'flex items-center justify-between p-3 border cursor-pointer transition-all',
                            active ? 'border-accent bg-accent/10' : 'border-border hover:border-text-muted'
                          )}
                        >
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">{perm.label}</span>
                          <div className={cn('w-5 h-5 border flex items-center justify-center transition-all', active ? 'bg-accent border-accent' : 'border-border')}>
                            {active && <Check size={12} className="text-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">ACCOUNT STATUS</label>
                <div
                  onClick={() => setEditingUser({ ...editingUser, active: !editingUser.active })}
                  className={cn(
                    'flex items-center justify-between p-3 border cursor-pointer transition-all',
                    editingUser.active ? 'border-status-green bg-status-green/10' : 'border-border'
                  )}
                >
                  <span className="text-[10px] font-bold text-white uppercase tracking-widest">
                    {editingUser.active ? 'ACCOUNT ACTIVE' : 'ACCOUNT DISABLED'}
                  </span>
                  <div className={cn('w-2 h-2 rounded-full', editingUser.active ? 'bg-status-green' : 'bg-text-muted')}></div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handlePasswordReset(editingUser.email)}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <KeyRound size={12} /> RESET PASSWORD
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleDeleteUser(editingUser)}
                  className="flex items-center gap-2 text-[10px] bg-accent/10 text-accent hover:bg-accent hover:text-white border-accent/20"
                >
                  <Trash2 size={12} /> DELETE
                </Button>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsEditModalOpen(false)} className="flex-1">CANCEL</Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <Loader2 size={12} className="animate-spin mr-2" /> : null}
                  SAVE CHANGES
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-surface border border-border max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight uppercase">CREATE NEW USER</h3>
                <p className="text-[10px] text-text-secondary font-bold uppercase tracking-widest">REGISTER SYSTEM ACCESS</p>
              </div>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-2 text-text-secondary hover:text-white">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-5">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">FULL NAME</label>
                <input
                  className="fermata-input w-full"
                  placeholder="E.G. JUAN DELA CRUZ"
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">EMAIL ADDRESS</label>
                <input
                  type="email"
                  className="fermata-input w-full"
                  placeholder="STAFF@FERMATA.COM"
                  value={createForm.email}
                  onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">TEMPORARY PASSWORD</label>
                <input
                  type="password"
                  className="fermata-input w-full"
                  placeholder="MIN 6 CHARACTERS"
                  value={createForm.password}
                  onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))}
                  required
                  minLength={6}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">ROLE</label>
                <select
                  className="fermata-input w-full"
                  value={createForm.role}
                  onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as Role }))}
                >
                  <option value="Branch Staff">Branch Staff</option>
                  <option value="Super Admin">Super Admin</option>
                </select>
              </div>
              {createForm.role !== 'Super Admin' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">BRANCH</label>
                    <select
                      className="fermata-input w-full"
                      value={createForm.branch}
                      onChange={e => setCreateForm(f => ({ ...f, branch: e.target.value as Branch }))}
                    >
                      <option value="Imus">Imus, Cavite</option>
                      <option value="Quezon City">Quezon City</option>
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">MODULE PERMISSIONS</label>
                    {ALL_PERMISSIONS.map(perm => {
                      const active = createForm.permissions.includes(perm.id);
                      return (
                        <div
                          key={perm.id}
                          onClick={() => togglePermission(perm.id, false)}
                          className={cn(
                            'flex items-center justify-between p-3 border cursor-pointer transition-all',
                            active ? 'border-accent bg-accent/10' : 'border-border hover:border-text-muted'
                          )}
                        >
                          <span className="text-[10px] font-bold text-white uppercase tracking-widest">{perm.label}</span>
                          <div className={cn('w-5 h-5 border flex items-center justify-center', active ? 'bg-accent border-accent' : 'border-border')}>
                            {active && <Check size={12} className="text-white" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {createError && (
                <div className="p-3 bg-accent/10 border border-accent/30 text-[10px] font-bold text-accent uppercase tracking-widest">
                  ⚠ {createError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} className="flex-1">CANCEL</Button>
                <Button type="submit" disabled={saving} className="flex-1">
                  {saving ? <Loader2 size={12} className="animate-spin mr-2" /> : null}
                  CREATE ACCOUNT
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
