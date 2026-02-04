import React, { useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import TrainerDashboard from "./pages/TrainerDashboard.jsx";
import CustomerDashboard from "./pages/CustomerDashboard.jsx";
import ActivityInsights from "./pages/ActivityInsights.jsx";

function AppContent() {
  const navigate = useNavigate();
  
  // Check for OAuth token in URL first (before state initialization)
  const getInitialTokenAndRole = () => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get("token");
    if (oauthToken) {
      try {
        const payload = JSON.parse(atob(oauthToken.split('.')[1]));
        const userRole = payload.role;
        if (userRole && ["admin", "trainer", "customer"].includes(userRole)) {
          localStorage.setItem("token", oauthToken);
          localStorage.setItem("role", userRole);
          // Remove token from URL immediately
          const dashboardPath = {
            admin: "/admin/dashboard",
            trainer: "/trainer/dashboard",
            customer: "/customer/dashboard"
          }[userRole] || "/";
          window.history.replaceState({}, document.title, dashboardPath);
          return { token: oauthToken, role: userRole };
        }
      } catch (e) {
        console.error("Failed to parse OAuth token:", e);
      }
    }
    return {
      token: localStorage.getItem("token") || null,
      role: localStorage.getItem("role") || null
    };
  };

  const initialState = getInitialTokenAndRole();
  const [token, setToken] = useState(initialState.token);
  const [role, setRole] = useState(initialState.role);

  function handleLogin(tok, r) {
    setToken(tok);
    setRole(r);
    localStorage.setItem("token", tok);
    localStorage.setItem("role", r);
  }

  // Handle OAuth callback with token in URL (for cases where it wasn't caught on mount)
  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const oauthToken = urlParams.get("token");
    if (oauthToken && (!token || token !== oauthToken)) {
      // Decode JWT to get role (basic decoding without verification for client-side)
      try {
        const payload = JSON.parse(atob(oauthToken.split('.')[1]));
        const userRole = payload.role;
        if (userRole && ["admin", "trainer", "customer"].includes(userRole)) {
          // Set token and role first
          setToken(oauthToken);
          setRole(userRole);
          localStorage.setItem("token", oauthToken);
          localStorage.setItem("role", userRole);
          
          // Navigate to the appropriate dashboard based on role
          const dashboardPath = {
            admin: "/admin/dashboard",
            trainer: "/trainer/dashboard",
            customer: "/customer/dashboard"
          }[userRole] || "/";
          
          // Remove token from URL and navigate
          window.history.replaceState({}, document.title, dashboardPath);
          navigate(dashboardPath, { replace: true });
        }
      } catch (e) {
        console.error("Failed to parse OAuth token:", e);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleLogout() {
    setToken(null);
    setRole(null);
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/");
  }

  function ProtectedRoute({ children, requiredRole }) {
    // Also check for token in URL as fallback
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token");
    let currentToken = token;
    let currentRole = role;
    
    if (urlToken && (!currentToken || currentToken !== urlToken)) {
      try {
        const payload = JSON.parse(atob(urlToken.split('.')[1]));
        const userRole = payload.role;
        if (userRole && ["admin", "trainer", "customer"].includes(userRole)) {
          currentToken = urlToken;
          currentRole = userRole;
          // Update state immediately
          setToken(urlToken);
          setRole(userRole);
          localStorage.setItem("token", urlToken);
          localStorage.setItem("role", userRole);
        }
      } catch (e) {
        console.error("Failed to parse OAuth token in ProtectedRoute:", e);
      }
    }
    
    if (!currentToken || currentRole !== requiredRole) {
      return <Navigate to="/login" replace />;
    }
    return children;
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={
          token && role ? (
            <Navigate to={
              role === "admin" ? "/admin/dashboard" :
              role === "trainer" ? "/trainer/dashboard" :
              role === "customer" ? "/customer/dashboard" :
              "/login"
            } replace />
          ) : (
            <Login 
              onLogin={handleLogin} 
              onSwitchToSignup={() => navigate("/signup")}
            />
          )
        }
      />
      <Route
        path="/signup"
        element={
          token && role ? (
            <Navigate to={
              role === "admin" ? "/admin/dashboard" :
              role === "trainer" ? "/trainer/dashboard" :
              role === "customer" ? "/customer/dashboard" :
              "/login"
            } replace />
          ) : (
            <Signup onSignupSuccess={() => navigate("/login")} />
          )
        }
      />

      {}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard token={token} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />

      {}
      
      {}
      <Route
        path="/admin/activity"
        element={
          token && role === "admin" ? (
            <ActivityInsights token={token} onLogout={handleLogout} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      {}
      <Route
        path="/analytics"
        element={
          <Navigate to={role === "admin" ? "/admin/dashboard?tab=analytics" : "/login"} replace />
        }
      />

      {}
      <Route
        path="/trainer/dashboard"
        element={
          <ProtectedRoute requiredRole="trainer">
            <TrainerDashboard token={token} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />

      {}
      <Route
        path="/customer/dashboard"
        element={
          <ProtectedRoute requiredRole="customer">
            <CustomerDashboard token={token} onLogout={handleLogout} />
          </ProtectedRoute>
        }
      />

      {}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export default function App() {
  // Fixed 75% scaling - no toggle needed
  const zoom = 0.75;

  return (
    <Router>
      <AppWrapper zoom={zoom} />
    </Router>
  );
}

function AppWrapper({ zoom }) {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  // Don't apply scaling to auth pages
  if (isAuthPage) {
    return <AppContent />;
  }

  // Apply scaling to all other pages
  return (
    <div
      className="app-scale-container"
      style={{
        transform: `scale(${zoom})`,
        transformOrigin: "top left",
        width: `${100 / zoom}%`,
        height: `${100 / zoom}%`,
        overflowX: "hidden",
      }}
    >
      <AppContent />
    </div>
  );
}
