
import React, { useState } from 'react';
import { Heart } from 'lucide-react';
import API_URL from '../config/api';

const DonateButton: React.FC = () => {
  const [amount, setAmount] = useState<number>(10);
  const [loading, setLoading] = useState(false);

  const handleDonate = async () => {
    setLoading(true);
    try {
      // O endpoint é /donation/... conforme registrado no server.js
      const response = await fetch(`${API_URL.replace('/api', '')}/donation/create-donation-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ amount })
      });

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert("Erro ao gerar link de doação.");
      }
    } catch (error) {
      console.error("Donation error:", error);
      alert("Erro na conexão com o servidor de pagamentos.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-[#1C1C1E] border border-white/5 rounded-[2.5rem] p-8 mt-8 animate-apple">
      <div className="flex items-center gap-4 mb-6">
        <div className="w-12 h-12 bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500">
          <Heart size={24} fill="currentColor" />
        </div>
        <div>
          <h3 className="text-lg font-black text-white">Apoie o Cinema Vertical</h3>
          <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest">Doação Voluntária</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {[5, 10, 20, 50].map(val => (
          <button
            key={val}
            onClick={() => setAmount(val)}
            className={`flex-1 py-3 rounded-xl text-xs font-black transition-all ${amount === val ? 'bg-white text-black' : 'bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10'}`}
          >
            R$ {val}
          </button>
        ))}
      </div>

      <button
        onClick={handleDonate}
        disabled={loading}
        className="w-full py-5 bg-rose-600 text-white font-black rounded-2xl hover:bg-rose-500 transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <>CONTRIBUIR AGORA</>
        )}
      </button>
      
      <p className="text-[9px] text-zinc-600 mt-4 text-center font-bold uppercase tracking-tighter">
        Contribuição espontânea • Sem concessão de status Premium
      </p>
    </div>
  );
};

export default DonateButton;
