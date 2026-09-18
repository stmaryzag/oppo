import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserData } from '../types';
import { sendOneSignalPush } from './onesignal';

/**
 * Send an inbox notification to a specific user and dispatch push notification
 */
export async function sendDirectNotification(
  userId: string,
  title: string,
  body: string,
  colorTag: 'blue' | 'green' | 'red' | 'yellow' = 'blue',
  isAward: boolean = false
) {
  if (!userId) return;
  try {
    await addDoc(collection(db, 'notifications_inbox'), {
      userId,
      title,
      body,
      colorTag,
      createdAt: new Date().toISOString(),
      read: false,
      isAward
    });

    // Send Web Push Notification to user device via OneSignal REST API
    sendOneSignalPush({
      externalUserIds: [userId],
      title,
      body
    }).catch(e => console.warn('Push dispatch warning:', e));
  } catch (err) {
    console.error('Error sending direct notification:', err);
  }
}

/**
 * Send points notification to both deacon and his parent (if linked)
 */
export async function sendPointsNotification(
  deaconId: string,
  points: number,
  reason: string,
  isDeduction: boolean = false
) {
  try {
    // 1. Fetch deacon info
    const deaconSnap = await getDoc(doc(db, 'users', deaconId));
    if (!deaconSnap.exists()) return;
    const deacon = deaconSnap.data() as UserData;

    const title = isDeduction
      ? `🔻 تم خصم ${Math.abs(points)} نقطة`
      : `✨ حصلت على +${points} نقطة جديدة!`;
    const body = `${isDeduction ? 'سبب الخصم:' : 'النشاط:'} ${reason}`;

    // Send to deacon
    await sendDirectNotification(deaconId, title, body, isDeduction ? 'red' : 'green');

    // 2. Find linked parent
    // Look for parent with parentOfDeaconId == deaconId or username == p_<deacon.username>
    let parentId: string | null = null;
    const q1 = query(collection(db, 'users'), where('role', '==', 'parent'), where('parentOfDeaconId', '==', deaconId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      parentId = snap1.docs[0].id;
    } else if (deacon.username) {
      const q2 = query(collection(db, 'users'), where('role', '==', 'parent'), where('username', '==', `p_${deacon.username}`));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        parentId = snap2.docs[0].id;
      }
    }

    if (parentId) {
      const parentTitle = isDeduction
        ? `🔻 إشعار خصم نقاط لابنك (${deacon.fullName})`
        : `🎉 إشعار نقاط جديدة لابنك (${deacon.fullName})`;
      const parentBody = `حصل ابنك الشماس على ${points > 0 ? '+' : ''}${points} نقطة في "${reason}".`;
      await sendDirectNotification(parentId, parentTitle, parentBody, isDeduction ? 'red' : 'green');
    }
  } catch (err) {
    console.error('Error in sendPointsNotification:', err);
  }
}

/**
 * Send subscription status notification to deacon and parent
 */
export async function sendSubscriptionNotification(
  deaconId: string,
  monthName: string,
  recordedByName?: string,
  pointsAwarded: number = 300,
  amount: number = 30
) {
  try {
    const deaconSnap = await getDoc(doc(db, 'users', deaconId));
    if (!deaconSnap.exists()) return;
    const deacon = deaconSnap.data() as UserData;

    const title = `💳 تم سداد اشتراك شهر ${monthName} (${amount} ج) +${pointsAwarded} نقطة ✨`;
    const body = `تم تسجيل سداد اشتراك الخورس الشهري بنجاح${recordedByName ? ` بواسطة الخادم: ${recordedByName}` : ''} وإضافة ${pointsAwarded} نقطة لرصيدك. شكراً لالتزامكم!`;

    // To deacon
    await sendDirectNotification(deaconId, title, body, 'green');

    // To parent
    let parentId: string | null = null;
    const q1 = query(collection(db, 'users'), where('role', '==', 'parent'), where('parentOfDeaconId', '==', deaconId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      parentId = snap1.docs[0].id;
    } else if (deacon.username) {
      const q2 = query(collection(db, 'users'), where('role', '==', 'parent'), where('username', '==', `p_${deacon.username}`));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        parentId = snap2.docs[0].id;
      }
    }

    if (parentId) {
      const pTitle = `💳 تم استلام اشتراك شهر ${monthName} لابنك (${deacon.fullName}) +${pointsAwarded} نقطة`;
      const pBody = `تم تسجيل سداد اشتراك الخورس الشهري (${amount} جنيه) بنجاح وإضافة ${pointsAwarded} نقطة مكافأة لرصيد ابنك${recordedByName ? ` بواسطة الخادم: ${recordedByName}` : ''}.`;
      await sendDirectNotification(parentId, pTitle, pBody, 'green');
    }
  } catch (err) {
    console.error('Error in sendSubscriptionNotification:', err);
  }
}

/**
 * Send permanent monthly top 3 award notification to deacon and his parent
 */
export async function sendMonthlyTopAwardNotification(
  deaconId: string,
  rank: 1 | 2 | 3,
  monthName: string,
  totalPoints: number
) {
  try {
    const rankTitle = rank === 1 ? '🥇 المركز الأول' : rank === 2 ? '🥈 المركز الثاني' : '🥉 المركز الثالث';
    const deaconSnap = await getDoc(doc(db, 'users', deaconId));
    if (!deaconSnap.exists()) return;
    const deacon = deaconSnap.data() as UserData;

    const title = `🏆 مبروك! حصلت على ${rankTitle} في شهر ${monthName}`;
    const body = `تهانينا لحصولك على ${rankTitle} على مستوى الخورس بإجمالي ${totalPoints} نقطة لشهر ${monthName}! دمتم خادماً مباركاً ومتميزاً.`;

    // Deacon permanent notification (tagged as award)
    await sendDirectNotification(deaconId, title, body, 'yellow', true);

    // Parent
    let parentId: string | null = null;
    const q1 = query(collection(db, 'users'), where('role', '==', 'parent'), where('parentOfDeaconId', '==', deaconId));
    const snap1 = await getDocs(q1);
    if (!snap1.empty) {
      parentId = snap1.docs[0].id;
    } else if (deacon.username) {
      const q2 = query(collection(db, 'users'), where('role', '==', 'parent'), where('username', '==', `p_${deacon.username}`));
      const snap2 = await getDocs(q2);
      if (!snap2.empty) {
        parentId = snap2.docs[0].id;
      }
    }

    if (parentId) {
      const pTitle = `🏆 مبروك! ابنك (${deacon.fullName}) حقق ${rankTitle} لشهر ${monthName}`;
      const pBody = `تهانينا القلبية لحصول ابنك الشماس على ${rankTitle} في خورس الشمامسة بإجمالي ${totalPoints} نقطة لشهر ${monthName}. نشكر متابعتكم وتشجيعكم الدائم!`;
      await sendDirectNotification(parentId, pTitle, pBody, 'yellow', true);
    }
  } catch (err) {
    console.error('Error in sendMonthlyTopAwardNotification:', err);
  }
}
