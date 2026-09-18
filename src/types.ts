export type Role = 'deacon' | 'parent' | 'admin' | 'assistant';

// Chorus / Group Definition
export interface ChorusGroup {
  id: string;
  name: string; // e.g. "الخورس التاسع", "الخورس الحادي عشر"
  code: string; // e.g. "chorus_9", "chorus_11"
  order: number; // 9, 10, 11, 12, 13, 14 ...
  description?: string;
  active: boolean;
  servantIds?: string[]; // IDs of assigned servants
  color?: string; // Theme accent for the chorus
  createdAt?: string;
}

export interface UserData {
  id: string;
  username: string;
  role: Role;
  fullName: string;
  photoUrl?: string;
  birthDate?: string;
  grade?: string;
  parentPhone?: string;
  dadPhone?: string;
  momPhone?: string;
  ownPhone?: string;
  address?: string;
  areaId?: string;
  assignedAssistantId?: string;
  serviceStartDate?: string;
  teamId?: string;
  parentOfDeaconId?: string;
  lastHomeVisitDate?: string;
  createdAt: string;
  isFirstLogin?: boolean;
  tempPassword?: string;
  
  // Multi-group enhancements:
  groupId?: string; // e.g. "chorus_11" for deacons
  assignedGroupIds?: string[]; // for assistants supervising multiple groups
}

export interface SubscriptionRecord {
  id?: string;
  deaconId: string;
  deaconName?: string;
  groupId?: string; // Chorus isolation
  monthKey: string; // e.g. "2026-08"
  year: number;
  month: number;
  amount: number; // 30 EGP
  paid: boolean;
  paidAt?: string;
  recordedBy?: string;
  recordedByName?: string;
  notes?: string;
}

export interface ActivityType {
  id: string;
  name: string;
  defaultPoints: number;
  requiresApproval: boolean;
  active: boolean;
  icon?: string;
  category?: 'liturgy' | 'confession' | 'hymns' | 'service' | 'study' | 'quiz' | 'other';
}

export interface UserLevel {
  id?: string;
  levelNumber: number;
  title: string;
  minPoints: number;
  badgeColor?: string;
  icon?: string;
  description?: string;
}

export interface RecurringNotification {
  id?: string;
  title: string;
  body: string;
  dayOfWeek: number;
  time: string; // "HH:MM" 24h
  audience: 'all' | 'deacons' | 'parents';
  colorTag: 'blue' | 'green' | 'red' | 'yellow';
  active: boolean;
  lastDispatchedWeekKey?: string;
  createdAt: string;
  createdBy?: string;
  groupId?: string; // optional targeting for specific chorus
}

export interface PointLog {
  id?: string;
  deaconId: string;
  groupId?: string; // Chorus isolation for leaderboards
  reason: string;
  points: number;
  date: string;
  addedBy: string;
  monthKey: string;
  activityTypeId?: string;
}

export interface AttendanceRecord {
  id?: string;
  deaconId: string;
  groupId?: string;
  activityTypeId: string;
  date: string;
  points: number;
  recordedBy: string;
  notes?: string;
}

// ============================================================================
// 3. Study Materials (المواد الدراسية والألحان والطقس)
// ============================================================================
export type StudySubject = 'hymns' | 'rituals' | 'coptic' | 'bible' | 'creed' | 'patrology' | 'spiritual';

export interface StudyMaterial {
  id: string;
  groupId: string; // 'all' or specific 'chorus_X'
  subject: StudySubject;
  title: string;
  description?: string;
  audioUrl?: string; // MP3 / Audio recording URL for hymns
  attachmentUrl?: string; // PDF / doc / slides
  videoUrl?: string; // YouTube or video lesson
  content?: string; // Textual notes, coptic lyrics, هزات اللحن
  targetStage?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  order?: number;
}

// ============================================================================
// 4. Advanced Quizzes & Google Forms-Grade Engine
// ============================================================================
export type QuestionType = 
  | 'single_choice'   // اختيار من متعدد (إجابة واحدة)
  | 'multiple_choice' // مربعات اختيار (إجابات متعددة)
  | 'true_false'      // صح أو خطأ
  | 'audio_identify'  // استماع مقطع صوتي والإجابة
  | 'text_short';     // إجابة نصية قصيرة

export interface QuizQuestionOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  imageUrl?: string;
  audioUrl?: string; // for hymn recognition
  options?: QuizQuestionOption[];
  correctOptionIds?: string[]; // for single_choice, multiple_choice, true_false
  correctTextAnswer?: string; // for text_short matching
  points: number;
  timerSeconds?: number; // Optional per-question timer
  explanation?: string; // Shown after submission
  required?: boolean;
}

export interface Quiz {
  id: string;
  groupId: string; // 'all' or 'chorus_X'
  subject: StudySubject;
  title: string;
  description?: string;
  instructions?: string;
  
  // Timing & Schedule
  startDate?: string; // e.g. "2026-09-18T10:00"
  endDate?: string;   // e.g. "2026-09-20T23:59"
  timeLimitMinutes?: number; // Total quiz timer (0 = unlimited)
  
  // Settings
  passingPercentage: number; // e.g. 60%
  pointsReward: number; // Points awarded to deacon upon passing
  shuffleQuestions?: boolean;
  showResultsImmediately?: boolean;
  showCorrectAnswers?: boolean;
  allowRetake?: boolean;
  
  questions: QuizQuestion[];
  totalPoints: number;
  
  active: boolean;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface QuizSubmissionAnswer {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
  isCorrect?: boolean;
  awardedPoints: number;
  timeSpentSeconds?: number;
}

export interface QuizSubmission {
  id: string; // `${quizId}_${deaconId}` to prevent duplicates
  quizId: string;
  quizTitle: string;
  deaconId: string;
  deaconName: string;
  groupId: string;
  score: number;
  totalPoints: number;
  percentage: number;
  passed: boolean;
  pointsAwarded: number;
  submittedAt: string;
  answers: Record<string, QuizSubmissionAnswer>;
  reviewedBy?: string;
}
