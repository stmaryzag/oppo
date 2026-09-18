import { ActivityType } from '../types';

export const STANDARD_CHURCH_ACTIVITIES: Omit<ActivityType, 'id'>[] = [
  {
    name: 'القداس',
    defaultPoints: 100,
    requiresApproval: false,
    active: true,
    category: 'liturgy'
  },
  {
    name: 'الحصة',
    defaultPoints: 80,
    requiresApproval: false,
    active: true,
    category: 'hymns'
  },
  {
    name: 'العشية',
    defaultPoints: 50,
    requiresApproval: false,
    active: true,
    category: 'liturgy'
  },
  {
    name: 'التسبحة',
    defaultPoints: 50,
    requiresApproval: false,
    active: true,
    category: 'hymns'
  },
  {
    name: 'نشاط اخر (يحتاج موافقة)',
    defaultPoints: 10,
    requiresApproval: true,
    active: true,
    category: 'other'
  }
];
