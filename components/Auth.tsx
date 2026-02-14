
import React, { useState } from 'react';
import { User } from '../types';
import { api } from '../services/api';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await api.login({ email, password });
      onLogin(user);
    } catch (err: any) {
      alert(err.message || "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-black font-lailai">
      <div className="w-full max-w-sm animate-apple">
        <div className="text-center mb-12">
          <div className="w-16 h-16 bg-white rounded-[1.25rem] mx-auto flex items-center justify-center mb-8 shadow-2xl">
            <span className="text-2xl font-black text-black italic">LL</span>
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight mb-3 text-white">LaiLai</h1>
          <p className="text-zinc-500 font-medium">Vertical Cinema. Production Mode.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input 
            type="email" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="E-mail"
            className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-5 py-4 focus:outline-none focus:border-zinc-700 transition-all text-white placeholder-zinc-600"
          />
          <input 
            type="password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="Senha"
            className="w-full bg-[#1C1C1E] border border-white/5 rounded-2xl px-5 py-4 focus:outline-none focus:border-zinc-700 transition-all text-white placeholder-zinc-600"
          />
          
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-extrabold py-4 rounded-2xl transition-all hover:bg-zinc-200 disabled:bg-zinc-800 disabled:text-zinc-500 flex items-center justify-center mt-4"
          >
            {loading ? <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : "Entrar"}
          </button>
        </form>

        <div className="mt-12 text-center">
          <button 
            onClick={() => setIsLogin(!isLogin)}
            className="text-zinc-500 hover:text-white font-bold transition-colors text-sm"
          >
            {isLogin ? "Criar conta profissional" : "Já sou membro"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;
