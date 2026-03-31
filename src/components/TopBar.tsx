import React from 'react';
import { Bell, History, LogOut, User } from 'lucide-react';
import { useFirebase } from './FirebaseProvider';
import { Link } from 'react-router-dom';

export default function TopBar() {
  const { userData, logout } = useFirebase();

  return (
    <header className="h-16 bg-background border-b border-border flex items-center justify-between px-8 fixed top-0 right-0 left-[220px] z-40">
      {/* Left: Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="SEARCH SYSTEM..."
            className="w-full bg-surface border border-border pl-10 pr-4 py-2 text-[10px] uppercase tracking-widest focus:outline-none focus:border-accent text-white"
          />
        </div>
      </div>

      {/* Right: Nav + User */}
      <div className="flex items-center gap-6">
        <nav className="hidden md:flex items-center gap-8">
          <Link to="/pos" className="text-[10px] font-bold text-accent uppercase tracking-widest border-b border-accent pb-0.5">
            DIRECT ORDERS
          </Link>
          <Link to="/workshop" className="text-[10px] font-bold text-text-secondary uppercase tracking-widest hover:text-white transition-colors">
            WORKSHOP
          </Link>
          <Link to="/analytics" className="text-[10px] font-bold text-text-secondary uppercase tracking-widest hover:text-white transition-colors">
            REPORTS
          </Link>
        </nav>

        <div className="flex items-center gap-4">
          <button className="relative text-text-secondary hover:text-white transition-colors">
            <Bell size={18} />
          </button>
          <Link to="/analytics" className="text-text-secondary hover:text-white transition-colors">
            <History size={18} />
          </Link>

          {/* User Info + Logout */}
          <div className="flex items-center gap-3 pl-4 border-l border-border">
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-white uppercase tracking-widest">{userData?.name}</p>
              <p className="text-[8px] text-text-secondary uppercase tracking-widest">{userData?.role}</p>
            </div>
            <div className="w-8 h-8 bg-accent flex items-center justify-center">
              <User size={16} className="text-white" />
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="text-text-secondary hover:text-accent transition-colors ml-1"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
