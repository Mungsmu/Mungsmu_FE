import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './Layout.jsx'
import HomePage        from './pages/HomePage.jsx'
import CoursesPage     from './pages/CoursesPage.jsx'
import CourseDetailPage from './pages/CourseDetailPage.jsx'
import TunnelsPage     from './pages/TunnelsPage.jsx'
import TunnelDetailPage from './pages/TunnelDetailPage.jsx'
import RoutePage       from './pages/RoutePage.jsx'
import NavigatingPage  from './pages/NavigatingPage.jsx'
import CompanionPage   from './pages/CompanionPage.jsx'
import { MyPage, LoginPage } from './pages/MyLoginPage.jsx'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/companion" element={<CompanionPage />} />
        <Route path="/navigating" element={<NavigatingPage />} />

        <Route element={<Layout />}>
          <Route index element={<Navigate to="/home" replace />} />
          <Route path="/home"        element={<HomePage />} />
          <Route path="/courses"     element={<CoursesPage />} />
          <Route path="/courses/:id" element={<CourseDetailPage />} />
          <Route path="/tunnels"     element={<TunnelsPage />} />
          <Route path="/tunnels/:id" element={<TunnelDetailPage />} />
          <Route path="/route"       element={<RoutePage />} />
          <Route path="/my"          element={<MyPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
