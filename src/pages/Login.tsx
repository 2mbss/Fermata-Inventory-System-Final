import React, { useState } from 'react';
import { LogIn, Mail, Lock, AlertCircle } from 'lucide-react';
import { useFirebase } from '../components/FirebaseProvider';
import { Card } from '../components/ui/Card';

export default function Login() {
  const { loginWithEmail } = useFirebase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginWithEmail(email, password);
    } catch (err: any) {
      console.error('Login error:', err);
      setError(err.message || 'FAILED_TO_AUTHENTICATE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-5xl font-bold text-white tracking-tighter">FERMATA</h1>
          <p className="text-xs text-text-secondary uppercase tracking-[0.4em] mt-2">Management System</p>
        </div>

        <Card className="p-8 border-accent/20">
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-white uppercase tracking-widest">SYSTEM ACCESS</h2>
            <p className="text-[10px] text-text-secondary mt-2 uppercase tracking-widest">AUTHORIZED PERSONNEL ONLY</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-background-light border border-border rounded-none py-3 pl-10 pr-4 text-white text-sm focus:border-accent outline-none transition-colors"
                  placeholder="admin@fermata.com"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] text-text-secondary uppercase tracking-widest font-bold">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" size={16} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-background-light border border-border rounded-none py-3 pl-10 pr-4 text-white text-sm focus:border-accent outline-none transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-destructive text-[10px] uppercase font-bold tracking-wider bg-destructive/10 p-3 border border-destructive/20">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <button 
              type="submit"
              disabled={loading}
              className="w-full fermata-button-primary flex items-center justify-center gap-3 py-4 disabled:opacity-50"
            >
              <LogIn size={20} />
              <span>{loading ? 'AUTHENTICATING...' : 'SECURE LOGIN'}</span>
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border text-center">
            <p className="text-[9px] text-text-muted uppercase tracking-[0.2em] leading-relaxed">
              BY ACCESSING THIS SYSTEM, YOU AGREE TO THE FERMATA DATA PRIVACY POLICY AND SECURITY PROTOCOLS.
            </p>
          </div>
        </Card>

        <div className="text-center">
          <p className="text-[8px] text-text-muted uppercase tracking-widest font-bold">FERMATA_CORE_V1.0 · SECURE_LINK_ACTIVE</p>
        </div>
      </div>
    </div>
  );
}
