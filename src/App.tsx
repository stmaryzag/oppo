import { useEffect, lazy, Suspense } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/auth/Login';
import { FirstLoginSetup } from './pages/auth/FirstLoginSetup';
import { Home } from './pages/Home';
import { Notifications } from './pages/Notifications';
import { AdminDashboard } from './pages/admin/AdminDashboard';
import { ManageAreas } from './pages/admin/ManageAreas';
import { ManageTeams } from './pages/admin/ManageTeams';
import { ManageActivities } from './pages/admin/ManageActivities';
import { ManageUsers } from './pages/admin/ManageUsers';
import { ManageRequests } from './pages/admin/ManageRequests';
import { ManualPoints } from './pages/admin/ManualPoints';
import { HallOfFame } from './pages/admin/HallOfFame';
import { ManageAfetqad } from './pages/admin/ManageAfetqad';
import { ManageNotifications } from './pages/admin/ManageNotifications';
import { ManageSubscriptions } from './pages/admin/ManageSubscriptions';
import { ManageLevels } from './pages/admin/ManageLevels';
import { FastAttendance } from './pages/admin/FastAttendance';
import { ManageGroups } from './pages/admin/ManageGroups';
import { StudyMaterials } from './pages/study/StudyMaterials';
import { QuizManager } from './pages/quiz/QuizManager';
import { QuizBuilder } from './pages/quiz/QuizBuilder';
import { QuizTaker } from './pages/quiz/QuizTaker';
import { QuizResults } from './pages/quiz/QuizResults';
import { Profile } from './pages/Profile';
import { initOneSignal } from './utils/onesignal';

const ComprehensiveReports = lazy(() => import('./pages/admin/ComprehensiveReports').then(module => ({ default: module.ComprehensiveReports })));

export default function App() {
  useEffect(() => {
    initOneSignal();
  }, []);

  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/setup" element={<FirstLoginSetup />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/profile" element={<Profile />} />
              
              {/* Study Materials & Curricula */}
              <Route path="/study" element={<StudyMaterials />} />

              {/* Quizzes & Competitions */}
              <Route path="/quizzes" element={<QuizManager />} />
              <Route path="/quizzes/create" element={<QuizBuilder />} />
              <Route path="/quizzes/:quizId" element={<QuizTaker />} />
              <Route path="/quizzes/:quizId/results" element={<QuizResults />} />
              
              <Route element={<AdminRoute />}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/groups" element={<ManageGroups />} />
                <Route path="/admin/attendance" element={<FastAttendance />} />
                <Route path="/admin/areas" element={<ManageAreas />} />
                <Route path="/admin/teams" element={<ManageTeams />} />
                <Route path="/admin/activities" element={<ManageActivities />} />
                <Route path="/admin/users" element={<ManageUsers />} />
                <Route path="/admin/requests" element={<ManageRequests />} />
                <Route path="/admin/points" element={<ManualPoints />} />
                <Route path="/admin/hall-of-fame" element={<HallOfFame />} />
                <Route path="/admin/afetqad" element={<ManageAfetqad />} />
                <Route path="/admin/notifications" element={<ManageNotifications />} />
                <Route path="/admin/subscriptions" element={<ManageSubscriptions />} />
                <Route path="/admin/reports" element={
                  <Suspense fallback={<div className="p-8 text-center"><div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div><p className="mt-4 text-slate-500 font-bold">جاري تحميل التقارير...</p></div>}>
                    <ComprehensiveReports />
                  </Suspense>
                } />
                <Route path="/admin/levels" element={<ManageLevels />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </Router>
  );
}
