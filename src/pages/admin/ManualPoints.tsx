import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Star, Plus, Loader2 } from 'lucide-react';

export const ManualPoints = () => {
  const { userData } = useAuth();
  const [deacons, setDeacons] = useState<any[]>([]);
  
  const [selectedDeacon, setSelectedDeacon] = useState('');
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchDeacons = async () => {
      const q = query(collection(db, 'users'), where('role', '==', 'deacon'));
      const snap = await getDocs(q);
      setDeacons(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchDeacons();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDeacon || !points || !reason.trim()) return;
    
    setLoading(true);
    setSuccess('');
    try {
      const monthKey = new Date().toISOString().slice(0, 7);
      
      await addDoc(collection(db, 'points_log'), {
        deaconId: selectedDeacon,
        reason: reason.trim(),
        points: parseInt(points),
        date: new Date().toISOString(),
        addedBy: userData?.id,
        monthKey
      });

      setSuccess('تمت إضافة النقاط بنجاح!');
      setSelectedDeacon('');
      setPoints('');
      setReason('');
      
      setTimeout(() => setSuccess(''), 3000);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء إضافة النقاط');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
        <div className="p-3 bg-yellow-100 text-yellow-600 rounded-xl">
          <Star className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">إضافة نقاط يدوياً</h2>
          <p className="text-sm text-slate-500">تصحيح أو إضافة نقاط استثنائية لأي شماس</p>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {success && (
            <div className="p-4 bg-green-50 text-green-700 rounded-xl border border-green-100 font-bold text-center">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">اختر الشماس</label>
            <select 
              required
              value={selectedDeacon}
              onChange={(e) => setSelectedDeacon(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-yellow-500 bg-white"
            >
              <option value="">-- اختر --</option>
              {deacons.map(d => (
                <option key={d.id} value={d.id}>{d.fullName}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">السبب / البيان</label>
            <input 
              type="text" 
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: تصحيح درجات، مكافأة مسابقة..."
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-yellow-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">عدد النقاط</label>
            <input 
              type="number" 
              required
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="يمكن إضافة قيمة سالبة للخصم"
              dir="ltr"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-yellow-500 text-left"
            />
          </div>

          <button 
            type="submit"
            disabled={loading || !selectedDeacon || !points || !reason.trim()}
            className="w-full bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-4 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-colors mt-4"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            إضافة السجل
          </button>
        </form>
      </div>
    </div>
  );
};
