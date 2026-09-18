import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Trophy, Plus, Trash2, Loader2, Users } from 'lucide-react';

export const ManageTeams = () => {
  const [teams, setTeams] = useState<any[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'teams'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTeams(data);
    });
    return () => unsub();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'teams'), { 
        name: newTeamName.trim(),
        memberIds: [],
        teamMonthlyPoints: 0
      });
      setNewTeamName('');
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('هل أنت متأكد من حذف هذا الفريق؟')) {
      await deleteDoc(doc(db, 'teams', id));
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-xl">
            <Trophy className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">إدارة الفرق</h2>
        </div>

        <form onSubmit={handleAdd} className="flex gap-3 mt-6">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="اسم الفريق (مثال: فريق مارمرقس)"
            className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:border-purple-500"
          />
          <button
            type="submit"
            disabled={loading || !newTeamName.trim()}
            className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((team) => (
          <div key={team.id} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 text-lg">{team.name}</span>
              <button
                onClick={() => handleDelete(team.id)}
                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                <span>{team.memberIds?.length || 0} أعضاء</span>
              </div>
              <div className="flex items-center gap-1">
                <Trophy className="w-4 h-4" />
                <span>{team.teamMonthlyPoints || 0} نقطة (الشهر الحالي)</span>
              </div>
            </div>
          </div>
        ))}
        {teams.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500">لا توجد فرق مضافة حالياً.</div>
        )}
      </div>
    </div>
  );
};
