import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export const ManageRequests = () => {
  const { userData } = useAuth();
  const [requests, setRequests] = useState<any[]>([]);
  const [usersInfo, setUsersInfo] = useState<Record<string, any>>({});
  const [activitiesInfo, setActivitiesInfo] = useState<Record<string, any>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    // 1. Fetch pending requests
    const q = query(collection(db, 'registration_requests'), where('status', '==', 'pending'));
    const unsub = onSnapshot(q, async (snapshot) => {
      const reqs: any[] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter for assistant if needed
      let filteredReqs = reqs;
      
      // 2. Fetch related data
      const uInfo: Record<string, any> = {};
      const aInfo: Record<string, any> = {};
      
      for (const r of reqs) {
        if (!uInfo[r.deaconId]) {
          const uSnap = await getDoc(doc(db, 'users', r.deaconId));
          if (uSnap.exists()) uInfo[r.deaconId] = uSnap.data();
        }
        if (!aInfo[r.activityTypeId]) {
          const aSnap = await getDoc(doc(db, 'activity_types', r.activityTypeId));
          if (aSnap.exists()) aInfo[r.activityTypeId] = aSnap.data();
        }
      }
      
      if (userData?.role === 'assistant') {
        filteredReqs = reqs.filter(r => uInfo[r.deaconId]?.assignedAssistantId === userData.id);
      }

      setUsersInfo(prev => ({ ...prev, ...uInfo }));
      setActivitiesInfo(prev => ({ ...prev, ...aInfo }));
      setRequests(filteredReqs.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()));
    });

    return () => unsub();
  }, [userData]);

  const handleAction = async (requestId: string, deaconId: string, activityId: string, action: 'approved' | 'rejected') => {
    setProcessingId(requestId);
    try {
      // Update request status
      await updateDoc(doc(db, 'registration_requests', requestId), {
        status: action
      });

      if (action === 'approved') {
        const activity = activitiesInfo[activityId];
        const points = activity?.defaultPoints || 0;
        
        // Add points log
        await addDoc(collection(db, 'points_log'), {
          deaconId,
          reason: `موافقة نشاط: ${activity?.name || 'نشاط'}`,
          points,
          date: new Date().toISOString(),
          addedBy: userData?.id,
          monthKey: new Date().toISOString().slice(0, 7)
        });

        // Add attendance record
        await addDoc(collection(db, 'attendance_records'), {
          deaconId,
          activityTypeId: activityId,
          date: new Date().toISOString(),
          status: 'confirmed',
          recordedBy: userData?.id,
          approvedBy: userData?.id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء معالجة الطلب');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
        <div className="p-3 bg-blue-100 text-blue-600 rounded-xl">
          <Clock className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-800">طلبات التسجيل المعلقة</h2>
          <p className="text-sm text-slate-500">مراجعة طلبات الشمامسة للأنشطة المختلفة</p>
        </div>
      </div>

      <div className="space-y-4">
        {requests.map(req => {
          const user = usersInfo[req.deaconId];
          const activity = activitiesInfo[req.activityTypeId];
          const isProcessing = processingId === req.id;

          return (
            <div key={req.id} className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                {user?.photoUrl ? (
                  <img src={user.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover border border-slate-200" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                    {user?.fullName?.charAt(0) || 'ش'}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">{user?.fullName || 'شماس'}</h3>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100">
                      {activity?.name || req.activityName || 'نشاط غير معروف'} (+{activity?.defaultPoints || 0} نقطة)
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {new Date(req.date).toLocaleDateString('ar-EG', { weekday: 'long', hour: 'numeric', minute: 'numeric' })}
                    </span>
                  </div>
                  {req.notes && (
                    <p className="text-xs text-slate-600 bg-slate-50 border border-slate-100 rounded-lg px-2.5 py-1 mt-1.5 font-medium">
                      📝 {req.notes}
                    </p>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  disabled={isProcessing}
                  onClick={() => handleAction(req.id, req.deaconId, req.activityTypeId, 'rejected')}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-5 h-5" />
                  رفض
                </button>
                <button
                  disabled={isProcessing}
                  onClick={() => handleAction(req.id, req.deaconId, req.activityTypeId, 'approved')}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white hover:bg-green-600 rounded-xl font-bold transition-colors disabled:opacity-50"
                >
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                  موافقة
                </button>
              </div>
            </div>
          );
        })}

        {requests.length === 0 && (
          <div className="text-center p-8 bg-slate-50 rounded-2xl border border-slate-100 border-dashed text-slate-500">
            لا توجد طلبات معلقة حالياً.
          </div>
        )}
      </div>
    </div>
  );
};
