import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { MapPin, Plus, Trash2, Loader2 } from 'lucide-react';

export const ManageAreas = () => {
  const [areas, setAreas] = useState<any[]>([]);
  const [newAreaName, setNewAreaName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'areas'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAreas(data);
    });
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAreaName.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'areas'), { name: newAreaName.trim() });
      setNewAreaName('');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذه المنطقة؟')) {
      await deleteDoc(doc(db, 'areas', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-xl">
            <MapPin className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">إدارة مناطق الافتقاد</h2>
        </div>

        <form onSubmit={handleAdd} className="flex gap-3 mt-6">
          <input
            type="text"
            value={newAreaName}
            onChange={(e) => setNewAreaName(e.target.value)}
            placeholder="اسم المنطقة (مثال: منطقة أ، شارع السلام...)"
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500"
          />
          <button
            type="submit"
            disabled={loading || !newAreaName.trim()}
            className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {areas.map((area) => (
          <div key={area.id} className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex items-center justify-between">
            <span className="font-bold text-slate-700">{area.name}</span>
            <button
              onClick={() => handleDelete(area.id)}
              className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}
        {areas.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500">لا توجد مناطق مضافة حالياً.</div>
        )}
      </div>
    </div>
  );
};
