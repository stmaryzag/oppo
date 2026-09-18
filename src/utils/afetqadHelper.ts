import { 
  collection, query, where, getDocs, doc, getDoc, 
  setDoc, updateDoc, deleteDoc 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { getSystemSettings } from './systemSettings';

/**
 * Calculates the deterministic Liturgical Week Key (from Friday 00:00 to the next Friday).
 * For any day between Friday and the following Thursday, it returns the YYYY-MM-DD of the current Friday.
 */
export const getLiturgicalWeekKey = (d: Date = new Date()): string => {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  // Calculate distance back to the most recent Friday:
  // Friday (5) -> 0
  // Saturday (6) -> 1
  // Sunday (0) -> 2
  // Monday (1) -> 3
  // Tuesday (2) -> 4
  // Wednesday (3) -> 5
  // Thursday (4) -> 6
  const daysSinceFriday = (day + 2) % 7;
  
  const friday = new Date(date);
  friday.setDate(date.getDate() - daysSinceFriday);
  
  const year = friday.getFullYear();
  const month = String(friday.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(friday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${dayOfMonth}`;
};

/**
 * Formats the liturgical week cycle into human-readable Arabic dates.
 * e.g., "الجمعة 4 سبتمبر 2026 إلى الجمعة 11 سبتمبر 2026"
 */
export const getLiturgicalWeekRange = (weekKey?: string): string => {
  const key = weekKey || getLiturgicalWeekKey();
  const [year, month, day] = key.split('-').map(Number);
  
  if (!year || !month || !day) return key;

  const startFriday = new Date(year, month - 1, day);
  const endFriday = new Date(startFriday);
  endFriday.setDate(startFriday.getDate() + 7);

  const startFormatted = startFriday.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const endFormatted = endFriday.toLocaleDateString('ar-EG', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return `دورة الافتقاد: ${startFormatted} ⬅️ ${endFormatted}`;
};

/**
 * Awards Afteqad points to the caller deacon(s) when a targeted deacon attends the liturgy.
 * Points are ONLY given if the caller has completed the contact task (`status === 'completed'`)
 * and points were not already awarded.
 */
export async function awardAfteqadPointsOnAttendance(
  attendedDeaconId: string,
  attendedDeaconName: string,
  attendanceDateStr: string,
  recordedByUserId?: string
): Promise<Array<{ callerId: string; points: number; assignmentId: string }>> {
  try {
    // 1. Query completed assignments where the attended deacon was the target
    const q = query(
      collection(db, 'afetqad_assignments'),
      where('targetId', '==', attendedDeaconId),
      where('status', '==', 'completed')
    );

    const snap = await getDocs(q);
    const unAwardedAssignments = snap.docs.filter(d => {
      const data = d.data();
      return data.pointsAwarded !== true;
    });

    if (unAwardedAssignments.length === 0) {
      return [];
    }

    const settings = await getSystemSettings();
    const callPoints = settings.afteqadCallPoints || 50;
    const monthKey = attendanceDateStr.slice(0, 7) || new Date().toISOString().slice(0, 7);
    const results: Array<{ callerId: string; points: number; assignmentId: string }> = [];

    for (const assignDoc of unAwardedAssignments) {
      const assignData = assignDoc.data();
      const callerId = assignData.callerId;
      if (!callerId) continue;

      const uniqueRewardId = `afteqad_reward_${assignDoc.id}_${attendedDeaconId}`;
      const rewardReason = `مكافأة نجاح افتقاد الشماس (${attendedDeaconName}) وحضوره القداس ✨`;

      // 2. Add points log for the caller
      await setDoc(doc(db, 'points_log', uniqueRewardId), {
        deaconId: callerId,
        reason: rewardReason,
        points: callPoints,
        date: new Date().toISOString(),
        addedBy: recordedByUserId || 'system',
        monthKey,
        source: 'afteqad_reward',
        afetqadAssignmentId: assignDoc.id,
        targetDeaconId: attendedDeaconId,
        attendanceDate: attendanceDateStr
      });

      // 3. Mark the assignment as rewarded
      await updateDoc(doc(db, 'afetqad_assignments', assignDoc.id), {
        pointsAwarded: true,
        pointsAwardedAt: new Date().toISOString(),
        pointsLogId: uniqueRewardId,
        awardedPoints: callPoints,
        attendanceDate: attendanceDateStr
      });

      results.push({
        callerId,
        points: callPoints,
        assignmentId: assignDoc.id
      });
    }

    return results;
  } catch (error) {
    console.error('Error awarding afteqad points on attendance:', error);
    return [];
  }
}

/**
 * Reverts Afteqad points if attendance is cancelled/deleted for a deacon.
 */
export async function revertAfteqadPointsOnAttendanceCancel(
  attendedDeaconId: string,
  _attendanceDateStr: string
): Promise<void> {
  try {
    const q = query(
      collection(db, 'afetqad_assignments'),
      where('targetId', '==', attendedDeaconId),
      where('pointsAwarded', '==', true)
    );

    const snap = await getDocs(q);

    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (data.pointsLogId) {
        await deleteDoc(doc(db, 'points_log', data.pointsLogId)).catch(() => {});
      }

      await updateDoc(doc(db, 'afetqad_assignments', docSnap.id), {
        pointsAwarded: false,
        pointsAwardedAt: null,
        pointsLogId: null,
        awardedPoints: null,
        attendanceDate: null
      });
    }
  } catch (error) {
    console.error('Error reverting afteqad points on attendance cancellation:', error);
  }
}
