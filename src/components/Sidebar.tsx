import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Plus, Settings, LifeBuoy, LogOut } from 'lucide-react';
import { NAV_ITEMS, BOTTOM_NAV_ITEMS } from '../constants';
import { cn } from '../lib/utils';
import { useFirebase } from './FirebaseProvider';

export default function Sidebar() {
  const { userData, logout } = useFirebase();
  const navigate = useNavigate();

  // Filter nav items based on user permissions
  const visibleNavItems = NAV_ITEMS.filter(item => {
    if (!userData) return false;
    if (userData.role === 'Super Admin') return true;
    if (item.id === 'dashboard') return true;
    const perms = userData.permissions || [];
    if (perms.includes('all')) return true;
    return perms.includes(item.id);
  });

  const handleNewEntry = () => {
    // Route to most likely create action based on current page
    navigate('/inventory');
  };

  return (
    <aside className="w-[220px] h-screen bg-background border-r border-border flex flex-col fixed left-0 top-0 z-50">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <h1 className="text-2xl font-bold text-white tracking-tighter">FERMATA</h1>
        <p className="text-[10px] text-text-secondary uppercase tracking-[0.2em] -mt-0.5">Musical Instruments</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto">
        <ul className="space-y-0.5">
          {visibleNavItems.map(item => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-6 py-3 text-sm font-medium uppercase tracking-wider transition-all border-l-[3px]',
                    isActive
                      ? 'text-accent border-accent bg-accent/5'
                      : 'text-text-secondary border-transparent hover:text-white hover:bg-surface'
                  )
                }
              >
                <item.icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom */}
      <div className="p-4 space-y-3 border-t border-border">
        <button
          onClick={handleNewEntry}
          className="w-full fermata-button-primary flex items-center justify-center gap-2 py-3"
        >
          <Plus size={18} />
          <span>New Entry</span>
        </button>

        <ul className="space-y-0.5">
          {BOTTOM_NAV_ITEMS.map(item => (
            <li key={item.id}>
              <NavLink
                to={item.path}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-2 py-2 text-xs font-medium uppercase tracking-wider transition-all rounded',
                    isActive ? 'text-white' : 'text-text-secondary hover:text-white'
                  )
                }
              >
                <item.icon size={14} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={logout}
              className="flex items-center gap-3 px-2 py-2 text-xs font-medium uppercase tracking-wider text-text-secondary hover:text-accent transition-all w-full"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </li>
        </ul>

        {userData && (
          <div className="pt-2 border-t border-border">
            <p className="text-[9px] font-bold text-text-secondary uppercase tracking-widest">{userData.name}</p>
            <p className="text-[8px] text-text-muted uppercase tracking-widest">{userData.branch || 'All Branches'}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
