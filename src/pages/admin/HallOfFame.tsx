import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { Trophy, Medal } from 'lucide-react';
import clsx from 'clsx';

export const HallOfFame = () => {
  const [winners, setWinners] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'monthly_winners'), orderBy('monthKey', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setWinners(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-yellow-500 to-amber-500 p-6 rounded-2xl shadow-sm text-white flex items-center gap-4">
        <div className="p-3 bg-white/20 rounded-xl">
          <Trophy className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">قاعة الشرف</h2>
          <p className="text-yellow-50">أرشيف الشمامسة الفائزين بالمراكز الأولى شهرياً</p>
        </div>
      </div>

      <div className="space-y-6">
        {winners.map(monthData => (
          <div key={monthData.id} className="bg-white rounded-2xl shadow-sm border border-amber-100 overflow-hidden">
            <div className="bg-amber-50 px-6 py-3 border-b border-amber-100 font-bold text-amber-800">
              شهر {monthData.monthKey}
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {monthData.top3?.map((winner: any, index: number) => (
                  <div key={index} className={clsx(
                    "flex flex-col items-center p-4 rounded-2xl border",
                    index === 0 ? "border-yellow-300 bg-yellow-50 scale-105" : 
                    index === 1 ? "border-slate-200 bg-slate-50" : 
                    "border-orange-200 bg-orange-50"
                  )}>
                    <Medal className={clsx(
                      "w-10 h-10 mb-2",
                      index === 0 ? "text-yellow-500" : 
                      index === 1 ? "text-slate-400" : 
                      "text-orange-500"
                    )} />
                    <h3 className="font-bold text-slate-800 text-lg mb-1">{winner.deaconName || 'شماس'}</h3>
                    <div className="bg-white px-3 py-1 rounded-full text-sm font-bold shadow-sm">
                      {winner.totalPoints} نقطة
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}

        {winners.length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-slate-100 text-slate-500">
            لم يتم إصدار أي نتائج شهرية بعد.
          </div>
        )}
      </div>
    </div>
  );
};
