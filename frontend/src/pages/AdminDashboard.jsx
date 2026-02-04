import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Plot from "react-plotly.js";
import BulkUpload from "./BulkUpload.jsx";
import UnifiedTrainerSearch from "./UnifiedTrainerSearch.jsx";
import ActivityInsights from "./ActivityInsights.jsx";
import { getAllTrainers, deleteTrainerByAdmin, getPendingRequirementsCount, getAdminRequirements, approveRequirement, updateTrainerByAdmin, analyticsQuery, getSkillDomains, expandDomain } from "../api";
import gisulLogo from "../assets/gisul final logo yellow-01 2.webp";

export default function AdminDashboard({ token, onLogout }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  // Use ref to read URL parameter only once on mount, then ignore URL changes
  const initialTabRef = useRef(null);
  if (initialTabRef.current === null) {
    // Only read from URL on first render
    const urlTab = searchParams.get("tab");
    if (urlTab && ["upload", "search", "list", "activity", "requirements", "analytics"].includes(urlTab)) {
      initialTabRef.current = urlTab;
    } else if (urlTab === "jd") {
      initialTabRef.current = "search"; // Redirect old "jd" tab to "search"
    } else {
      initialTabRef.current = "upload";
    }
  }
  
  const [tab, setTab] = useState(initialTabRef.current);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Handle OAuth token from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      // Save token to localStorage
      localStorage.setItem('token', urlToken);
      // Clean URL by removing token parameter (preserve tab parameter if exists)
      const tabParam = params.get('tab');
      const cleanUrl = tabParam ? `/admin/dashboard?tab=${tabParam}` : '/admin/dashboard';
      window.history.replaceState({}, document.title, cleanUrl);
      // Optionally trigger page reload to update auth state
      // Note: App.jsx should handle this, but this ensures no redirect loops
    }
  }, []);

  // Handle old "jd" tab redirect only once on mount
  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab === "jd") {
      setTab("search");
      navigate("/admin/dashboard", { replace: true });
    }
  }, []); // Empty deps - only runs once

  // Fetch pending requirements count
  useEffect(() => {
    async function fetchPendingCount() {
      try {
        const res = await getPendingRequirementsCount(token);
        setPendingCount(res.pending_count || 0);
      } catch (err) {
        console.error("Error fetching pending count:", err);
      }
    }
    if (token) {
      fetchPendingCount();
      // Refresh every 30 seconds
      const interval = setInterval(fetchPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#f9f9f9" }}>
      {/* Enhanced Navbar with Premium Design */}
      <header
        className="text-white px-4 sm:px-6 md:px-8 py-4 sm:py-5 relative shadow-xl backdrop-blur-md border-b border-white/10"
        style={{ 
          background: "linear-gradient(135deg, #6953a3 0%, #8b7bb8 50%, #6953a3 100%)",
          backgroundSize: "200% 200%",
          animation: "gradientShift 8s ease infinite"
        }}
      >
        {/* Animated background overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-transparent to-purple-600/20 opacity-50"></div>
        
        <div className="relative z-10 flex items-center justify-between">
          {/* Logo and text on the left corner */}
          <div className="flex items-center gap-3 group">
            <div className="relative">
              <img 
                src={gisulLogo} 
                alt="GISUL Logo" 
                className="h-16 sm:h-20 md:h-24 lg:h-32 w-auto transition-all duration-300 group-hover:scale-110 group-hover:rotate-2 drop-shadow-lg"
              />
              <div className="absolute inset-0 bg-white/10 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <div className="hidden md:block h-10 w-px bg-white/30 mx-3"></div>
            <div className="hidden md:flex flex-col">
              <span className="text-sm md:text-base text-white/90 font-semibold">GISUL</span>
              <span className="text-xs md:text-sm text-white/70">Admin Portal</span>
            </div>
          </div>

          {/* Navigation and Logout on the right */}
          <div className="flex items-center gap-2 sm:gap-3 ml-auto z-10">
            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-2">
              <button
                onClick={() => setTab("upload")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-sm md:text-base ${
                  tab === "upload" 
                    ? "bg-white/20 font-semibold shadow-md" 
                    : "hover:bg-white/10 hover:scale-105"
                }`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Bulk Upload</span>
              </button>
              <button
                onClick={() => setTab("search")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-sm md:text-base ${
                  tab === "search" 
                    ? "bg-white/20 font-semibold shadow-md" 
                    : "hover:bg-white/10 hover:scale-105"
                }`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Trainer Search</span>
              </button>
              <button
                onClick={() => setTab("list")}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-sm md:text-base ${
                  tab === "list" 
                    ? "bg-white/20 font-semibold shadow-md" 
                    : "hover:bg-white/10 hover:scale-105"
                }`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>Trainers List</span>
              </button>
              <button
                onClick={() => {
                  setTab("analytics");
                }}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-sm md:text-base ${
                  tab === "analytics" 
                    ? "bg-white/20 font-semibold shadow-md" 
                    : "hover:bg-white/10 hover:scale-105"
                }`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                <span>Analytics</span>
              </button>
              <button
                onClick={() => {
                  setTab("activity");
                }}
                className={`flex items-center gap-2 px-3 md:px-4 py-2 rounded-lg transition-all duration-200 text-sm md:text-base ${
                  tab === "activity" 
                    ? "bg-white/20 font-semibold shadow-md" 
                    : "hover:bg-white/10 hover:scale-105"
                }`}
              >
                <svg className="w-4 h-4 md:w-5 md:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Activity Insights</span>
              </button>
            </nav>
            
            {/* Notification Bell for Pending Requirements */}
            <button
              onClick={() => {
                setTab("requirements");
                navigate("/admin/dashboard?tab=requirements", { replace: true });
              }}
              className="relative p-2 rounded-lg hover:bg-white/10 transition-all duration-200 group"
              title="Pending Requirements"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {pendingCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>
            
            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg hover:bg-white/10 transition"
              aria-label="Toggle menu"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            
            {/* Enhanced Logout button */}
            <button
              onClick={onLogout}
              className="group relative px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all duration-300 shadow-lg hover:shadow-2xl hover:scale-105 active:scale-95 overflow-hidden flex items-center gap-2"
              style={{ 
                backgroundColor: "#f4e403", 
                color: "#000"
              }}
            >
              {/* Shine effect on hover */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
              
              <svg className="w-4 h-4 sm:w-5 sm:h-5 relative z-10 transition-transform group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span className="hidden sm:inline relative z-10">Logout</span>
              <span className="sm:hidden relative z-10">Out</span>
              
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-xl bg-yellow-400/50 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 -z-10"></div>
            </button>
          </div>
        </div>

        {/* Bottom border glow */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent"></div>

        <style>{`
          @keyframes gradientShift {
            0%, 100% {
              background-position: 0% 50%;
            }
            50% {
              background-position: 100% 50%;
            }
          }
        `}</style>
      </header>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b shadow-md">
          <nav className="flex flex-col p-2">
            <button
              onClick={() => { setTab("upload"); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all text-left ${
                tab === "upload" 
                  ? "bg-purple-100 font-semibold" 
                  : "hover:bg-gray-100"
              }`}
              style={{ color: tab === "upload" ? "#6953a3" : "#374151" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <span>Bulk Upload</span>
            </button>
            <button
              onClick={() => { setTab("search"); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all text-left ${
                tab === "search" 
                  ? "bg-purple-100 font-semibold" 
                  : "hover:bg-gray-100"
              }`}
              style={{ color: tab === "search" ? "#6953a3" : "#374151" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Trainer Search</span>
            </button>
            <button
              onClick={() => { setTab("list"); setMobileMenuOpen(false); }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all text-left ${
                tab === "list" 
                  ? "bg-purple-100 font-semibold" 
                  : "hover:bg-gray-100"
              }`}
              style={{ color: tab === "list" ? "#6953a3" : "#374151" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span>Trainers List</span>
            </button>
            <button
              onClick={() => { 
                setTab("analytics"); 
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all text-left ${
                tab === "analytics" 
                  ? "bg-purple-100 font-semibold" 
                  : "hover:bg-gray-100"
              }`}
              style={{ color: tab === "analytics" ? "#6953a3" : "#374151" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <span>Analytics</span>
            </button>
            <button
              onClick={() => {
                setTab("activity");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center gap-2 px-4 py-3 rounded-lg transition-all text-left ${
                tab === "activity" 
                  ? "bg-purple-100 font-semibold" 
                  : "hover:bg-gray-100"
              }`}
              style={{ color: tab === "activity" ? "#6953a3" : "#374151" }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Activity Insights</span>
            </button>
          </nav>
        </div>
      )}

      <main className="p-3 sm:p-4 md:p-6 main-content-desktop">
        {tab === "upload" && <BulkUpload token={token} />}
        {tab === "search" && <UnifiedTrainerSearch token={token} />}
        {tab === "list" && (
          <React.Suspense fallback={<div className="text-center py-8">Loading trainers list...</div>}>
            <TrainersList token={token} />
          </React.Suspense>
        )}
        {tab === "analytics" && <InlineAnalytics token={token} />}
        {tab === "activity" && <ActivityInsights token={token} onLogout={onLogout} embedded={true} />}
        {tab === "requirements" && <RequirementsApproval token={token} onApproval={() => {
          // Refresh pending count after approval
          getPendingRequirementsCount(token).then(res => setPendingCount(res.pending_count || 0));
        }} />}
      </main>
    </div>
  );
}

// Requirements Approval Component
function RequirementsApproval({ token, onApproval }) {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(null);
  const [adminNotes, setAdminNotes] = useState({});

  useEffect(() => {
    fetchRequirements();
    // Refresh every 30 seconds
    const interval = setInterval(fetchRequirements, 30000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRequirements() {
    try {
      const res = await getAdminRequirements(token);
      setRequirements(res.requirements || []);
    } catch (err) {
      console.error("Error fetching requirements:", err);
      alert("Failed to fetch requirements: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(requirementId, approved) {
    setApproving(requirementId);
    try {
      const notes = adminNotes[requirementId] || null;
      await approveRequirement(token, requirementId, approved, notes);
      await fetchRequirements();
      if (onApproval) onApproval();
      alert(`Requirement ${approved ? "approved" : "rejected"} successfully!`);
      // Clear notes for this requirement
      setAdminNotes(prev => {
        const newNotes = { ...prev };
        delete newNotes[requirementId];
        return newNotes;
      });
    } catch (err) {
      alert("Failed to update requirement: " + (err.message || "Unknown error"));
    } finally {
      setApproving(null);
    }
  }

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const pendingRequirements = requirements.filter(r => r.status === "pending");
  const otherRequirements = requirements.filter(r => r.status !== "pending");

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br from-purple-500 to-purple-700">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
            Requirements Approval
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            Review and approve customer requirements
          </p>
        </div>

        {loading ? (
          <div className="text-center py-16">
            <svg className="animate-spin h-12 w-12 text-purple-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600">Loading requirements...</p>
          </div>
        ) : (
          <>
            {/* Pending Requirements */}
            {pendingRequirements.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-sm font-semibold bg-yellow-100 text-yellow-800">
                    {pendingRequirements.length} Pending
                  </span>
                </h3>
                <div className="space-y-4">
                  {pendingRequirements.map((req, idx) => (
                    <div
                      key={req.requirement_id || idx}
                      className="border-2 border-yellow-300 rounded-xl p-6 bg-yellow-50/30 hover:shadow-lg transition-shadow duration-200"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">Requirement #{idx + 1}</h3>
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-semibold">Customer:</span> {req.customer_name || req.customer_email || "Unknown"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Posted on: {formatDate(req.created_at)}
                          </p>
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">Requirement Text:</p>
                        <p className="text-sm text-gray-600 bg-white p-3 rounded-lg max-h-40 overflow-y-auto border border-gray-200">
                          {req.requirement_text || "N/A"}
                        </p>
                      </div>

                      {(req.skills && req.skills.length > 0) || req.domain || req.experience_years ? (
                        <div className="mb-4 flex flex-wrap gap-2">
                          {req.skills && req.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs font-semibold text-gray-600">Skills:</span>
                              {req.skills.map((skill, skillIdx) => (
                                <span
                                  key={skillIdx}
                                  className="px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          )}
                          {req.domain && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-gray-600">Domain:</span>
                              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                {req.domain}
                              </span>
                            </div>
                          )}
                          {req.experience_years && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-gray-600">Experience:</span>
                              <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                                {req.experience_years} years
                              </span>
                            </div>
                          )}
                        </div>
                      ) : null}

                      <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Admin Notes (Optional):
                        </label>
                        <textarea
                          value={adminNotes[req.requirement_id] || ""}
                          onChange={(e) => setAdminNotes(prev => ({
                            ...prev,
                            [req.requirement_id]: e.target.value
                          }))}
                          placeholder="Add notes about this requirement..."
                          className="w-full p-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y min-h-[80px]"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() => handleApproval(req.requirement_id, true)}
                          disabled={approving === req.requirement_id}
                          className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {approving === req.requirement_id ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              <span>Approve</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleApproval(req.requirement_id, false)}
                          disabled={approving === req.requirement_id}
                          className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {approving === req.requirement_id ? (
                            <>
                              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                              <span>Reject</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Requirements (Approved/Rejected) */}
            {otherRequirements.length > 0 && (
              <div>
                <h3 className="text-xl font-bold text-gray-900 mb-4">
                  Processed Requirements ({otherRequirements.length})
                </h3>
                <div className="space-y-4">
                  {otherRequirements.map((req, idx) => (
                    <div
                      key={req.requirement_id || idx}
                      className={`border-2 rounded-xl p-6 hover:shadow-lg transition-shadow duration-200 ${
                        req.status === "approved" ? "border-green-300 bg-green-50/30" : "border-red-300 bg-red-50/30"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">Requirement #{idx + 1}</h3>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              req.status === "approved" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}>
                              {req.status === "approved" ? "Approved" : "Rejected"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-semibold">Customer:</span> {req.customer_name || req.customer_email || "Unknown"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Posted on: {formatDate(req.created_at)} | 
                            {req.updated_at && req.updated_at !== req.created_at && ` Updated on: ${formatDate(req.updated_at)}`}
                          </p>
                          {req.approved_by && (
                            <p className="text-xs text-gray-500 mt-1">
                              {req.status === "approved" ? "Approved" : "Rejected"} by: {req.approved_by}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">Requirement Text:</p>
                        <p className="text-sm text-gray-600 bg-white p-3 rounded-lg max-h-32 overflow-y-auto border border-gray-200">
                          {req.requirement_text || "N/A"}
                        </p>
                      </div>

                      {req.admin_notes && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Notes:</p>
                          <p className="text-sm text-yellow-900">{req.admin_notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {requirements.length === 0 && (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-lg font-medium mb-2">No requirements found</p>
                <p className="text-gray-400 text-sm">Customer requirements will appear here</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}


function TrainersList({ token }) {
  const [trainers, setTrainers] = useState([]);
  const [filteredTrainers, setFilteredTrainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [experienceFilter, setExperienceFilter] = useState("all");
  const [skillDomainFilter, setSkillDomainFilter] = useState("");
  const [skillDomainSuggestions, setSkillDomainSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [editingTrainer, setEditingTrainer] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    phone: "",
    location: "",
    skills: "",
  });
  const [saving, setSaving] = useState(false);
  const [expandedKeywords, setExpandedKeywords] = useState([]);
  const [expandingDomain, setExpandingDomain] = useState(false);
  const expandTimeoutRef = React.useRef(null);
  const tableContainerRef = React.useRef(null);
  const searchInputRef = React.useRef(null);
  const suggestionsRef = React.useRef(null);

  // Helper function to normalize skills
  const normalizeSkills = (skills) => {
    if (!skills) return [];
    
    if (Array.isArray(skills)) {
      return skills.filter(s => typeof s === "string" && s.trim());
    }
    
    if (typeof skills === "string") {
      return skills.split(",").map(s => s.trim()).filter(s => s.length > 0);
    }
    
    if (typeof skills === "object") {
      return Object.values(skills).map(s => String(s).trim()).filter(s => s.length > 0);
    }
    
    return [];
  };

  // Load skill domains from backend for autocomplete
  useEffect(() => {
    loadSkillDomains();
  }, []);

  async function loadSkillDomains() {
    try {
      setLoadingDomains(true);
      const data = await getSkillDomains(token);
      if (data.status === "success" && Array.isArray(data.domains)) {
        setSkillDomainSuggestions(data.domains);
      }
    } catch (err) {
      console.error("Failed to load skill domains:", err);
      // Fallback to extracting from trainers if API fails
      const domains = new Set();
      trainers.forEach((trainer) => {
        if (!trainer) return;
        const value = trainer.skill_domains;
        if (Array.isArray(value)) {
          value.forEach((domain) => {
            if (typeof domain === "string" && domain.trim()) {
              domains.add(domain.trim());
            }
          });
        } else if (typeof value === "string" && value.trim()) {
          domains.add(value.trim());
        }
      });
      setSkillDomainSuggestions(Array.from(domains).sort((a, b) => a.localeCompare(b)));
    } finally {
      setLoadingDomains(false);
    }
  }

  useEffect(() => {
    loadTrainers();
  }, []);

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    // Apply filters whenever dependencies change (client-side filtering, no page reload)
    if (trainers.length > 0) {
      applyFilters();
    } else if (trainers.length === 0 && !loading) {
      // If trainers are loaded but empty, set empty filtered list
      setFilteredTrainers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainers, searchQuery, experienceFilter, skillDomainFilter, expandedKeywords]);

  // Update expanded keywords when skill domain filter changes (with debouncing)
  useEffect(() => {
    // Clear any pending timeout
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    
    if (!skillDomainFilter || !skillDomainFilter.trim()) {
      setExpandedKeywords([]);
      setExpandingDomain(false);
      return;
    }
    
    // Debounce: wait 300ms before making API call
    setExpandingDomain(true);
    expandTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await expandDomain(token, skillDomainFilter);
        setExpandedKeywords(result.keywords || []);
      } catch (err) {
        console.warn("Domain expansion failed:", err);
        setExpandedKeywords([skillDomainFilter.toLowerCase()]);
      } finally {
        setExpandingDomain(false);
      }
    }, 300);
    
    return () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    };
  }, [skillDomainFilter, token]);

  async function loadTrainers() {
    try {
      setLoading(true);
      // Load all trainers - filtering is done client-side
      const data = await getAllTrainers(token);
      console.log("Trainers list response:", data);
      
      if (data.status === "success" && Array.isArray(data.trainers)) {
        const trainersList = data.trainers || [];
        console.log("Loaded trainers:", trainersList.length);
        setTrainers(trainersList);
        // Don't set filteredTrainers here - let useEffect handle it
      } else if (Array.isArray(data)) {
        console.log("Response is array, loaded trainers:", data.length);
        setTrainers(data);
        // Don't set filteredTrainers here - let useEffect handle it
      } else {
        console.error("Unexpected response format:", data);
        alert("Failed to load trainers: Unexpected response format. Check console for details.");
        setTrainers([]);
        setFilteredTrainers([]);
      }
    } catch (err) {
      console.error("Failed to load trainers", err);
      const errorMsg = err.message || err.detail || "Unknown error";
      alert("Error loading trainers: " + errorMsg);
      setTrainers([]);
      setFilteredTrainers([]);
    } finally {
      setLoading(false);
    }
  }

  const normalizeString = (value) => {
    if (typeof value === "string") {
      return value.trim();
    }
    if (value === null || value === undefined) {
      return "";
    }
    return String(value).trim();
  };

  const extractNumericValue = (raw) => {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") {
      return Number.isNaN(raw) ? null : raw;
    }
    const match = String(raw).match(/(\d+(\.\d+)?)/);
    return match ? Number(match[1]) : null;
  };

  const matchesExperience = (rawExperience, filter) => {
    if (filter === "all") return true;

    const experienceValue = extractNumericValue(rawExperience);

    if (filter === "none") {
      return experienceValue === null;
    }

    if (filter.includes("-")) {
      const [minRaw, maxRaw] = filter.split("-");
      const min = extractNumericValue(minRaw);
      const max = extractNumericValue(maxRaw);

      if (min === null && max === null) return true;
      if (experienceValue === null) return false;

      // For inclusive ranges: min <= value <= max
      if (min !== null && experienceValue < min) return false;
      if (max !== null && experienceValue > max) return false;

      return true;
    }

    if (filter.endsWith("+")) {
      const min = extractNumericValue(filter);
      if (min === null) return true;
      return experienceValue !== null && experienceValue >= min;
    }

    const exact = extractNumericValue(filter);
    if (exact === null) return true;
    return experienceValue !== null && experienceValue === exact;
  };

  const applyFilters = React.useCallback(() => {
    if (!trainers || trainers.length === 0) {
      setFilteredTrainers([]);
      return;
    }

    // Filter out only invalid trainers (keep N/A names)
    let filtered = trainers.filter((trainer) => {
      if (!trainer || typeof trainer !== "object") return false;
      // Keep all valid trainer objects, even if name is empty or "N/A"
      return true;
    });

    if (searchQuery.trim()) {
      const query = normalizeString(searchQuery).toLowerCase().trim();
      if (query) {
        filtered = filtered.filter((trainer) => {
          const name = normalizeString(trainer?.name || "").toLowerCase();
          const email = normalizeString(trainer?.email || "").toLowerCase();
          const domains = Array.isArray(trainer?.skill_domains)
            ? trainer.skill_domains.map((d) => normalizeString(d).toLowerCase())
            : typeof trainer?.skill_domains === "string" && trainer.skill_domains
            ? [normalizeString(trainer.skill_domains).toLowerCase()]
            : [];
          const trainerSkills = normalizeSkills(trainer?.skills);
          const skills = trainerSkills.map((s) => normalizeString(s).toLowerCase());

          return (
            (name && name.includes(query)) ||
            (email && email !== "n/a" && email.includes(query)) ||
            domains.some((domain) => domain && domain.includes(query)) ||
            skills.some((skill) => skill && skill.includes(query))
          );
        });
      }
    }

    if (experienceFilter !== "all") {
      filtered = filtered.filter((trainer) =>
        matchesExperience(trainer?.experience_years, experienceFilter)
      );
    }

    // Filter by skill domain/skill (client-side filtering) with domain expansion
    if (skillDomainFilter && skillDomainFilter.trim()) {
      const filterValue = normalizeString(skillDomainFilter).toLowerCase().trim();
      if (filterValue) {
        // Use expanded keywords from state (populated by API)
        const searchTerms = expandedKeywords.length > 0 
          ? expandedKeywords 
          : [filterValue]; // If no expansion, search for the original term
        
        filtered = filtered.filter((trainer) => {
          // Get and normalize skills from trainer profile
          const skills = normalizeSkills(trainer?.skills || []);
          const skillsNormalized = skills.map((s) => {
            const normalized = normalizeString(s).toLowerCase().trim();
            return normalized;
          }).filter(s => s.length > 0);
          
          // Get and normalize skill_domains from trainer profile
          const domains = Array.isArray(trainer?.skill_domains)
            ? trainer.skill_domains.map((d) => normalizeString(d).toLowerCase().trim())
            : typeof trainer?.skill_domains === "string" && trainer.skill_domains
            ? [normalizeString(trainer.skill_domains).toLowerCase().trim()]
            : [];
          
          // Check if any of the expanded keywords match trainer's skills or domains
          const matchesSkill = skillsNormalized.some((skill) => {
            if (!skill) return false;
            // Check if skill contains any of the search terms (case-insensitive)
            return searchTerms.some(term => skill.includes(term.toLowerCase()));
          });
          
          const matchesDomain = domains.some((domain) => {
            if (!domain || typeof domain !== "string") return false;
            // Check if domain contains any of the search terms (case-insensitive)
            return searchTerms.some(term => domain.includes(term.toLowerCase()));
          });
          
          // Return true if either skills or domains match
          const matches = matchesSkill || matchesDomain;
          
          return matches;
        });
      }
    }

    console.log(`Applied filters: search="${searchQuery}", experience="${experienceFilter}", skillDomain="${skillDomainFilter}"`);
    console.log(`Filtered ${filtered.length} trainers from ${trainers.length} total`);
    
    // Debug skill domain filter
    if (skillDomainFilter && skillDomainFilter.trim()) {
      console.log(`🔍 Skill Domain Filter Debug:`);
      console.log(`   Filter value: "${skillDomainFilter}"`);
      console.log(`   Matched ${filtered.length} trainers`);
      if (filtered.length > 0 && filtered.length <= 5) {
        filtered.forEach((trainer, idx) => {
          const skills = normalizeSkills(trainer?.skills || []);
          const domains = Array.isArray(trainer?.skill_domains) ? trainer.skill_domains : [];
          console.log(`   Trainer ${idx + 1}: ${trainer?.name || "N/A"}`);
          console.log(`     Skills: [${skills.join(", ")}]`);
          console.log(`     Domains: [${domains.join(", ")}]`);
        });
      }
    }
    setFilteredTrainers(filtered);
    
    // Scroll to top of table when filters change
    setTimeout(() => {
      if (tableContainerRef.current) {
        tableContainerRef.current.scrollTop = 0;
      }
    }, 100);
  }, [trainers, searchQuery, experienceFilter, skillDomainFilter, expandedKeywords]);

  function handleSearch() {
    applyFilters();
  }

  function handleKeyPress(e) {
    if (e.key === "Enter") {
      handleSearch();
    }
  }

  function handleEditTrainer(trainer) {
    // Extract existing data, handling null, undefined, and empty strings
    const trainerEmail = (trainer.email && String(trainer.email).trim() !== "" && trainer.email !== "N/A" && trainer.email !== "n/a") 
      ? String(trainer.email).trim() 
      : "";
    
    // Handle phone - can be string, number, or null/undefined
    let trainerPhone = "";
    if (trainer.phone !== null && trainer.phone !== undefined) {
      const phoneStr = String(trainer.phone).trim();
      if (phoneStr !== "" && phoneStr !== "N/A" && phoneStr !== "n/a" && phoneStr !== "null" && phoneStr !== "undefined") {
        trainerPhone = phoneStr;
      }
    }
    
    // Handle location - can be string or null/undefined
    let trainerLocation = "";
    if (trainer.location !== null && trainer.location !== undefined) {
      const locationStr = String(trainer.location).trim();
      if (locationStr !== "" && locationStr !== "N/A" && locationStr !== "n/a" && locationStr !== "null" && locationStr !== "undefined") {
        trainerLocation = locationStr;
      }
    }
    
    // Handle skills - normalize first, then join
    const normalizedSkills = normalizeSkills(trainer.skills);
    const trainerSkills = normalizedSkills.join(", ");
    
    console.log("Editing trainer data:", {
      email: trainerEmail,
      phone: trainerPhone,
      location: trainerLocation,
      skills: trainerSkills,
      rawTrainer: trainer
    });
    
    // Handle name - can be string or null/undefined
    let trainerName = "";
    if (trainer.name !== null && trainer.name !== undefined) {
      const nameStr = String(trainer.name).trim();
      if (nameStr !== "" && nameStr !== "N/A" && nameStr !== "n/a" && nameStr !== "null" && nameStr !== "undefined") {
        trainerName = nameStr;
      }
    }
    
    setEditingTrainer(trainer);
    setEditFormData({
      name: trainerName,
      email: trainerEmail,
      phone: trainerPhone,
      location: trainerLocation,
      skills: trainerSkills,
    });
  }

  function handleCloseEditModal() {
    setEditingTrainer(null);
    setEditFormData({ name: "", email: "", phone: "", location: "", skills: "" });
  }

  async function handleSaveTrainer() {
    if (!editingTrainer) return;
    
    const identifier = editingTrainer.email || editingTrainer.profile_id;
    if (!identifier) {
      alert("Cannot update: No identifier (email or profile_id) available");
      return;
    }

    try {
      setSaving(true);
      
      // Parse skills from comma-separated string
      const skillsArray = editFormData.skills
        .split(",")
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      const updateData = {
        name: editFormData.name.trim() || undefined,
        email: editFormData.email.trim() || undefined,
        phone: editFormData.phone.trim() || undefined,
        location: editFormData.location.trim() || undefined,
        skills: skillsArray.length > 0 ? skillsArray : undefined,
      };
      
      // Remove undefined fields
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });
      
      if (Object.keys(updateData).length === 0) {
        alert("No changes to save");
        return;
      }
      
      const res = await updateTrainerByAdmin(token, identifier, updateData);
      if (res.status === "success") {
        alert("Trainer profile updated successfully!");
        handleCloseEditModal();
        await loadTrainers(); // Reload to show updated data
      } else {
        alert(res.detail || res.message || "Failed to update trainer");
      }
    } catch (err) {
      alert("Error updating trainer: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTrainer(email, name, profileId) {
    // Use profile_id as fallback if no email (for partial details trainers)
    const identifier = email || profileId;
    if (!identifier) {
      alert("Cannot delete: No identifier (email or profile_id) available");
      return;
    }

    const displayName = name || email || profileId || "Unknown";
    const confirmed = window.confirm(
      `Are you sure you want to delete trainer "${displayName}"? This action cannot be undone and will remove them from the database and search index.`
    );
    if (!confirmed) return;

    try {
      setDeleting(identifier);
      const res = await deleteTrainerByAdmin(token, identifier);
      if (res.status === "success") {
        // Remove from state - check both email and profile_id
        setTrainers((prev) => prev.filter((t) => {
          return t.email !== email && t.profile_id !== profileId;
        }));
        await loadTrainers();
      } else {
        alert(res.detail || res.message || "Failed to delete trainer");
      }
    } catch (err) {
      alert("Error deleting trainer: " + (err.message || "Unknown error"));
    } finally {
      setDeleting(null);
    }
  }

  const experienceYears = [...new Set(trainers.map((t) => t.experience_years).filter((y) => y !== null && y !== undefined))].sort((a, b) => a - b);

  // Ensure component always renders something
  if (!token) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md max-w-7xl mx-auto">
        <div className="text-center py-8">
          <p className="text-red-500">Error: No authentication token provided</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 md:p-6 rounded-lg shadow-sm w-full mx-auto">
      <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-gray-800" style={{ color: "#6953a3" }}>
        Trainers List
      </h2>

      <div className="flex flex-col gap-3 mb-4 sm:mb-6">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search by name, email, or skills..."
              className="w-full pl-10 pr-4 border border-gray-300 rounded-lg p-2 sm:p-3 text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white font-semibold transition hover:opacity-90 text-sm sm:text-base whitespace-nowrap"
            style={{ backgroundColor: "#6953a3" }}
          >
            Search
          </button>
        </div>
        
        {/* Mobile-friendly filter inputs - hidden on desktop */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:hidden">
          <div className="flex-1 relative">
            <label className="block text-xs font-medium text-gray-700 mb-1 sm:hidden">Filter by Skill Domain</label>
            <input
              type="text"
              ref={searchInputRef}
              value={skillDomainFilter}
              onChange={(e) => {
                setSkillDomainFilter(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search skill domain (e.g., Cloud, DevOps)..."
              className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            />
            {showSuggestions && skillDomainFilter && skillDomainSuggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
              >
                {skillDomainSuggestions
                  .filter((domain) =>
                    domain.toLowerCase().includes(skillDomainFilter.toLowerCase())
                  )
                  .slice(0, 10)
                  .map((domain) => (
                    <div
                      key={domain}
                      onClick={() => {
                        setSkillDomainFilter(domain);
                        setShowSuggestions(false);
                      }}
                      className="px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm"
                    >
                      {domain}
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="flex-1 sm:flex-initial">
            <label className="block text-xs font-medium text-gray-700 mb-1 sm:hidden">Filter by Experience</label>
            <select
              value={experienceFilter}
              onChange={(e) => setExperienceFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
            >
              <option value="all">All Experience</option>
              <option value="none">No Experience</option>
              <option value="0-2">0-2 years</option>
              <option value="3-5">3-5 years</option>
              <option value="6-10">6-10 years</option>
              <option value="10+">10+ years</option>
            </select>
          </div>
        </div>

        {/* Domain Expansion Keywords Display */}
        {(expandedKeywords.length > 0 || expandingDomain) && skillDomainFilter && (
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-2">
              {expandingDomain ? (
                <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <svg className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              <div className="flex-1">
                <p className="text-sm font-medium text-purple-800 mb-2">
                  {expandingDomain ? (
                    <span className="flex items-center gap-2">
                      Expanding "{skillDomainFilter}"...
                    </span>
                  ) : (
                    <>Searching for "{skillDomainFilter}" includes:</>
                  )}
                </p>
                {!expandingDomain && (
                  <div className="flex flex-wrap gap-1.5">
                    {expandedKeywords.slice(0, 12).map((keyword, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-white text-purple-700 text-xs rounded-full border border-purple-300 shadow-sm"
                      >
                        {keyword}
                      </span>
                    ))}
                    {expandedKeywords.length > 12 && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-600 text-xs rounded-full font-medium">
                        +{expandedKeywords.length - 12} more
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setSkillDomainFilter("");
                  setExpandedKeywords([]);
                }}
                className="text-purple-600 hover:text-purple-800 p-1 hover:bg-purple-100 rounded transition-colors"
                title="Clear domain filter"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading trainers...</p>
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-600 font-medium">
            Showing {filteredTrainers.length} of {trainers.length} trainer(s)
            {searchQuery.trim() && (
              <span className="ml-2 text-purple-600">for "{searchQuery}"</span>
            )}
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden space-y-3">
            {filteredTrainers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 bg-white rounded-lg border border-gray-200">
                No trainers found matching your criteria.
              </div>
            ) : (
              filteredTrainers.map((trainer, index) => {
                if (!trainer || typeof trainer !== 'object') {
                  console.warn("Invalid trainer data at index", index, trainer);
                  return null;
                }
                const trainerName = String(trainer.name || "N/A");
                const trainerEmailRaw = trainer.email;
                const trainerEmail = trainerEmailRaw ? String(trainerEmailRaw) : "N/A";
                const hasValidEmail = trainerEmailRaw && 
                                     trainerEmailRaw !== "N/A" && 
                                     trainerEmailRaw !== "n/a" && 
                                     trainerEmailRaw.trim() !== "" &&
                                     trainerEmailRaw.includes("@");
                const trainerProfileId = trainer.profile_id || "";
                const canDelete = hasValidEmail || (trainerProfileId && trainerProfileId.trim() !== "");
                const deleteIdentifier = hasValidEmail ? (trainerEmailRaw || trainerEmail) : trainerProfileId;
                const experienceYears =
                  trainer.experience_years !== null &&
                  trainer.experience_years !== undefined &&
                  trainer.experience_years !== ""
                    ? Number(trainer.experience_years)
                    : null;
                const skills = normalizeSkills(trainer?.skills || []);
                
                return (
                  <div
                    key={`${trainerEmail || trainerProfileId || trainerName || index}-${index}`}
                    className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-base mb-1" style={{ color: "#6953a3" }}>{trainerName}</h3>
                        <p className="text-xs text-gray-600 truncate">{trainerEmail || (trainerProfileId ? `ID: ${trainerProfileId.substring(0, 12)}...` : "No email")}</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2 mb-3">
                      <div>
                        <span className="text-xs font-medium text-gray-500">Skills:</span>
                        <div className="mt-1">
                          {skills.length > 0 ? (
                            <span className="px-2 py-1 rounded text-xs font-medium inline-block" style={{ backgroundColor: "#e9e5f0", color: "#6953a3" }}>
                              {skills.slice(0, 2).join(", ")}{skills.length > 2 ? ` +${skills.length - 2}` : ""}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">N/A</span>
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <span className="text-xs font-medium text-gray-500">Experience:</span>
                        <p className="text-sm text-gray-700 mt-1">
                          {experienceYears !== null && !Number.isNaN(experienceYears)
                            ? `${experienceYears} ${experienceYears === 1 ? "year" : "years"}`
                            : "N/A"}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex gap-2 pt-3 border-t border-gray-100">
                      <button
                        onClick={() => handleEditTrainer(trainer)}
                        disabled={!canDelete}
                        className="flex-1 px-3 py-2 rounded text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        style={{ backgroundColor: "#6953a3" }}
                        title={canDelete ? "Edit trainer" : "Cannot edit: No identifier"}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTrainer(trainerEmailRaw || trainerEmail, trainerName, trainerProfileId)}
                        disabled={deleting === deleteIdentifier || !canDelete}
                        className="flex-1 px-3 py-2 rounded text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        style={{ backgroundColor: "#e11d48" }}
                        title={canDelete ? "Delete trainer" : "Cannot delete: No identifier"}
                      >
                        {deleting === deleteIdentifier ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                );
              }).filter(Boolean)
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block w-full border border-gray-300 rounded-lg shadow-sm overflow-x-auto" ref={tableContainerRef}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: "100%" }}>
              <colgroup>
                <col style={{ width: "15%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "30%" }} />
              </colgroup>
              <thead>
                <tr style={{ backgroundColor: "#6953a3" }} className="text-white">
                  <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    <div className="flex flex-col items-start gap-1">
                      <div className="flex items-center gap-2">
                        <span>Skills / Domain</span>
                        <div className="relative">
                          <input
                            type="text"
                            value={skillDomainFilter}
                            onChange={(e) => {
                              setSkillDomainFilter(e.target.value);
                              setShowSuggestions(true);
                            }}
                            onFocus={() => setShowSuggestions(true)}
                            placeholder="e.g., Cloud, AWS..."
                            className="px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-purple-500 w-36"
                            onClick={(e) => e.stopPropagation()}
                          />
                          {showSuggestions && skillDomainFilter && skillDomainSuggestions.length > 0 && (
                            <div
                              className="absolute z-50 w-48 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto"
                              style={{ left: 0, top: "100%" }}
                            >
                              {skillDomainSuggestions
                                .filter((domain) =>
                                  domain.toLowerCase().includes(skillDomainFilter.toLowerCase())
                                )
                                .slice(0, 10)
                                .map((domain) => (
                                  <div
                                    key={domain}
                                    onClick={() => {
                                      setSkillDomainFilter(domain);
                                      setShowSuggestions(false);
                                    }}
                                    className="px-3 py-2 hover:bg-purple-50 cursor-pointer text-xs text-gray-800"
                                  >
                                    <span className="font-medium">{domain}</span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                        {skillDomainFilter && (
                          <button
                            onClick={() => {
                              setSkillDomainFilter("");
                              setShowSuggestions(false);
                              setExpandedKeywords([]);
                            }}
                            className="text-xs text-yellow-300 hover:text-white bg-red-500/60 hover:bg-red-600 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                            title="Clear filter"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {(expandedKeywords.length > 0 || expandingDomain) && skillDomainFilter && (
                        <div className="text-xs font-normal text-purple-200 max-w-xs truncate">
                          {expandingDomain ? (
                            <span className="flex items-center gap-1">
                              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                              </svg>
                              Expanding...
                            </span>
                          ) : (
                            <>
                              Includes: {expandedKeywords.slice(0, 5).join(", ")}
                              {expandedKeywords.length > 5 && ` +${expandedKeywords.length - 5}`}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-semibold">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-1">
                      <span>Experience</span>
                      <select
                        value={experienceFilter}
                        onChange={(e) => setExperienceFilter(e.target.value)}
                        className="px-2 py-1 text-xs bg-white text-gray-900 border border-gray-300 rounded focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <option value="all">All</option>
                        <option value="none">No Experience</option>
                        <option value="0-2">0-2 years</option>
                        <option value="3-5">3-5 years</option>
                        <option value="6-10">6-10 years</option>
                        <option value="10+">10+ years</option>
                      </select>
                    </div>
                  </th>
                  <th className="px-4 py-3 pl-12 text-left text-sm font-semibold"></th>
                </tr>
              </thead>
              <tbody key={`filtered-${filteredTrainers.length}-${searchQuery}-${experienceFilter}-${skillDomainFilter}`}>
                {filteredTrainers.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                      No trainers found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredTrainers.map((trainer, index) => {
                    if (!trainer || typeof trainer !== 'object') {
                      console.warn("Invalid trainer data at index", index, trainer);
                      return null;
                    }
                    const trainerName = String(trainer.name || "N/A");
                    const trainerEmailRaw = trainer.email;
                    const trainerEmail = trainerEmailRaw ? String(trainerEmailRaw) : "N/A";
                    const hasValidEmail = trainerEmailRaw && 
                                         trainerEmailRaw !== "N/A" && 
                                         trainerEmailRaw !== "n/a" && 
                                         trainerEmailRaw.trim() !== "" &&
                                         trainerEmailRaw.includes("@");
                    const trainerProfileId = trainer.profile_id || "";
                    const canDelete = hasValidEmail || (trainerProfileId && trainerProfileId.trim() !== "");
                    const deleteIdentifier = hasValidEmail ? (trainerEmailRaw || trainerEmail) : trainerProfileId;
                    const experienceYears =
                      trainer.experience_years !== null &&
                      trainer.experience_years !== undefined &&
                      trainer.experience_years !== ""
                        ? Number(trainer.experience_years)
                        : null;
                    const skills = normalizeSkills(trainer?.skills || []);
                    
                    return (
                      <tr
                        key={`${trainerEmail || trainerProfileId || trainerName || index}-${index}`}
                        className={`border-b border-gray-200 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-purple-50/30"} hover:bg-purple-100`}
                      >
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <div className="font-medium" style={{ color: "#6953a3" }}>{trainerName}</div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 truncate" title={trainerEmail || (trainerProfileId ? `Profile ID: ${trainerProfileId}` : "N/A")}>
                          {trainerEmail || (trainerProfileId ? `Profile ID: ${trainerProfileId.substring(0, 16)}...` : "N/A")}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          <div className="truncate" title={skills.length > 0 ? skills.join(", ") : "N/A"}>
                            {skills.length > 0 ? (
                              <span className="px-2 py-1 rounded text-xs font-medium" style={{ backgroundColor: "#e9e5f0", color: "#6953a3" }}>
                                {skills.slice(0, 2).join(", ")}{skills.length > 2 ? ` +${skills.length - 2}` : ""}
                              </span>
                            ) : (
                              "N/A"
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {experienceYears !== null && !Number.isNaN(experienceYears)
                            ? `${experienceYears} ${experienceYears === 1 ? "year" : "years"}`
                            : "N/A"}
                        </td>
                        <td className="px-4 py-3 pl-12">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleEditTrainer(trainer)}
                              disabled={!canDelete}
                              className="px-3 py-1.5 rounded text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-all"
                              style={{ backgroundColor: "#6953a3" }}
                              title={canDelete ? "Edit trainer" : "Cannot edit: No identifier"}
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteTrainer(trainerEmailRaw || trainerEmail, trainerName, trainerProfileId)}
                              disabled={deleting === deleteIdentifier || !canDelete}
                              className="px-3 py-1.5 rounded text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-all"
                              style={{ backgroundColor: "#e11d48" }}
                              title={canDelete ? "Delete trainer" : "Cannot delete: No identifier"}
                            >
                              {deleting === deleteIdentifier ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }).filter(Boolean)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Edit Trainer Modal */}
      {editingTrainer && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]" 
          style={{ zIndex: 99999, position: "fixed" }}
          onClick={handleCloseEditModal}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto transform transition-all"
            style={{ zIndex: 100000 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with gradient */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-800 p-4 sm:p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div className="flex-1 pr-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-white">Edit Trainer Profile</h2>
                  <p className="text-purple-100 text-xs sm:text-sm mt-1">Update trainer information</p>
                </div>
                <button
                  onClick={handleCloseEditModal}
                  className="text-white hover:bg-white/20 rounded-full p-2 transition-all duration-200 disabled:opacity-50 flex-shrink-0"
                  disabled={saving}
                  title="Close"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="space-y-5">
                {/* Name Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Name
                  </label>
                  <input
                    type="text"
                    value={editFormData.name || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="Trainer Name"
                    disabled={saving}
                  />
                </div>

                {/* Email Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={editFormData.email || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="trainer@example.com"
                    disabled={saving}
                  />
                </div>

                {/* Phone Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={editFormData.phone || (editingTrainer?.phone ? String(editingTrainer.phone) : "") || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="+1 234 567 8900"
                    disabled={saving}
                  />
                </div>

                {/* Location Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Location
                  </label>
                  <input
                    type="text"
                    value={editFormData.location || (editingTrainer?.location ? String(editingTrainer.location) : "") || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all"
                    placeholder="City, State, Country"
                    disabled={saving}
                  />
                </div>

                {/* Skills Field */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                    <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Skills
                  </label>
                  <textarea
                    value={editFormData.skills || ""}
                    onChange={(e) => setEditFormData({ ...editFormData, skills: e.target.value })}
                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none"
                    placeholder="Python, Java, Cloud, DevOps (comma-separated)"
                    rows={4}
                    disabled={saving}
                  />
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {editFormData.skills ? `${editFormData.skills.split(',').filter(s => s.trim()).length} skill(s) entered` : "Enter skills separated by commas"}
                  </p>
                </div>
              </div>

              {/* Footer with action buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-3 mt-8 pt-6 border-t-2 border-gray-200">
                <button
                  onClick={handleCloseEditModal}
                  disabled={saving}
                  className="w-full sm:w-auto px-6 py-3 text-gray-700 bg-gray-100 rounded-xl hover:bg-gray-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-sm hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTrainer}
                  disabled={saving || !editFormData.email.trim()}
                  className="w-full sm:w-auto px-6 py-3 text-white rounded-xl transition-all duration-200 hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md hover:scale-105 active:scale-95 flex items-center justify-center gap-2"
                  style={{ backgroundColor: "#6953a3" }}
                >
                  {saving ? (
                    <>
                      <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}

// Inline Analytics Component - embedded directly in AdminDashboard
function InlineAnalytics({ token }) {
  const [selectedFields, setSelectedFields] = useState(["skill_category"]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    experience: "",
    skill_category: "",
    location: "",
  });
  const [chartType, setChartType] = useState("bar"); // "bar" or "pie"

  const availableFields = [
    { id: "skill_category", label: "Skill Category", type: "category" },
    { id: "experience", label: "Experience", type: "range" },
    { id: "location", label: "Location", type: "category" },
  ];

  // Use the analyticsQuery function from api.js which handles API_BASE correctly
  const fetchAnalyticsData = useCallback(async () => {
    if (selectedFields.length === 0) {
      setChartData([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await analyticsQuery(token, {
        fields: selectedFields,
        filters: Object.fromEntries(
          Object.entries(filters).filter(([_, v]) => v !== "")
        ),
      });

      console.log("[InlineAnalytics] Response received:", response);
      
      // Handle response - check for data array or message
      if (response && response.data) {
        if (Array.isArray(response.data) && response.data.length > 0) {
          setChartData(response.data);
          setError(null);
        } else {
          // Empty data array - not an error, just no data
          setChartData([]);
          setError(response.message || "No data available for the selected filters.");
        }
      } else {
        // Unexpected response format
        console.warn("[InlineAnalytics] Unexpected response format:", response);
        setChartData([]);
        setError("Unexpected response format from analytics endpoint.");
      }
    } catch (err) {
      console.error("[InlineAnalytics] Analytics query error:", err);
      setError(err.message || "Failed to fetch analytics data");
      setChartData([]);
    } finally {
      setLoading(false);
    }
  }, [token, selectedFields, filters]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const handleDragEnd = (result) => {
    if (!result.destination) return;

    const items = Array.from(selectedFields);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    setSelectedFields(items);
  };

  const toggleField = (fieldId) => {
    setSelectedFields((prev) =>
      prev.includes(fieldId)
        ? prev.filter((id) => id !== fieldId)
        : [...prev, fieldId]
    );
  };

  const handleFilterChange = (filterName, value) => {
    setFilters((prev) => ({
      ...prev,
      [filterName]: value,
    }));
  };

  const handleReset = () => {
    setSelectedFields(["skill_category"]);
    setFilters({
      experience: "",
      skill_category: "",
      location: "",
    });
    setError(null);
  };

  const handleExportCSV = () => {
    if (chartData.length === 0) {
      alert("No data to export");
      return;
    }

    const headers = Object.keys(chartData[0]).join(",");
    const rows = chartData.map((item) =>
      Object.values(item)
        .map((val) => `"${val}"`)
        .join(",")
    );
    const csvContent = [headers, ...rows].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics_export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const prepareChartData = () => {
    if (chartData.length === 0) return null;

    const xField = selectedFields[0] || "skill_category";
    const yField = selectedFields[1] || "count";

    const labels = chartData.map((item) => {
      const key = item._id || item[xField] || "Unknown";
      return typeof key === "object" ? JSON.stringify(key) : String(key);
    });

    const values = chartData.map((item) => {
      const count = item.count || item[yField] || 0;
      return typeof count === "number" ? count : parseInt(count) || 0;
    });

    if (chartType === "pie") {
      return {
        labels: labels,
        values: values,
        type: "pie",
        marker: {
          colors: [
            "#6953a3", "#8b7bb8", "#a89ac8", "#c5b9d8", "#e2d8e8",
            "#4a3a7a", "#6b5a9a", "#8c7aba", "#ad9cda", "#cebdfa",
            "#3d2f62", "#5d4f82", "#7d6fa2", "#9d8fc2", "#bdafe2"
          ],
        },
        textinfo: "label+percent",
        textposition: "outside",
        hole: 0,
      };
    } else {
      return {
        x: labels,
        y: values,
        type: "bar",
        marker: {
          color: "#6953a3",
          line: {
            color: "#4a3a7a",
            width: 1,
          },
        },
      };
    }
  };

  const chartDataForPlot = prepareChartData();

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br from-purple-500 to-purple-700">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
            Analytics Visualization
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            Analyze trainer data with interactive charts and filters
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-6">
          {/* Left Sidebar - Filters */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 sticky top-4 border border-gray-200">
              <h2 className="text-lg sm:text-xl font-semibold mb-4 text-gray-800">
                Filters
              </h2>

              {/* Experience Filter */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Experience (Years)
                </label>
                <select
                  value={filters.experience}
                  onChange={(e) => handleFilterChange("experience", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                >
                  <option value="">All</option>
                  <option value="0-2">0-2 years</option>
                  <option value="3-5">3-5 years</option>
                  <option value="6-10">6-10 years</option>
                  <option value="10+">10+ years</option>
                </select>
              </div>

              {/* Skill Category Filter */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Skill Category
                </label>
                <input
                  type="text"
                  value={filters.skill_category}
                  onChange={(e) =>
                    handleFilterChange("skill_category", e.target.value)
                  }
                  placeholder="Filter by skill category"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                />
              </div>

              {/* Location Filter */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Location
                </label>
                <input
                  type="text"
                  value={filters.location}
                  onChange={(e) => handleFilterChange("location", e.target.value)}
                  placeholder="Filter by location"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm"
                />
              </div>

              {/* Chart Type Selector */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Chart Type
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                    <input
                      type="radio"
                      name="chartType"
                      value="bar"
                      checked={chartType === "bar"}
                      onChange={(e) => setChartType(e.target.value)}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Bar Chart</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded">
                    <input
                      type="radio"
                      name="chartType"
                      value="pie"
                      checked={chartType === "pie"}
                      onChange={(e) => setChartType(e.target.value)}
                      className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300"
                    />
                    <span className="text-sm text-gray-700">Pie Chart</span>
                  </label>
                </div>
              </div>

              {/* Available Fields */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Available Fields
                </h3>
                <div className="space-y-2">
                  {availableFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center space-x-2 cursor-pointer p-2 hover:bg-gray-50 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFields.includes(field.id)}
                        onChange={() => toggleField(field.id)}
                        className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
                      />
                      <span className="text-sm text-gray-700">{field.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={handleReset}
                  className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition text-sm font-medium"
                >
                  Reset
                </button>
                <button
                  onClick={handleExportCSV}
                  disabled={chartData.length === 0}
                  className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg transition text-sm font-medium"
                >
                  Export as CSV
                </button>
              </div>
            </div>
          </div>

          {/* Middle - Chart Visualization */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 border border-gray-200">
              <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-semibold text-gray-800">
                  Analytics Visualization
                </h2>
                {selectedFields.length > 0 && (
                  <div className="text-sm text-gray-600">
                    Showing: {selectedFields.map((f) => {
                      const field = availableFields.find((af) => af.id === f);
                      return field ? field.label : f;
                    }).join(" vs ")}
                  </div>
                )}
              </div>

              {/* Drag & Drop Fields */}
              {selectedFields.length > 0 && (
                <div className="mb-4 sm:mb-6">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">
                    Drag to reorder fields:
                  </h3>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="fields" direction="horizontal">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg min-h-[60px]"
                        >
                          {selectedFields.map((fieldId, index) => {
                            const field = availableFields.find(
                              (f) => f.id === fieldId
                            );
                            return (
                              <Draggable
                                key={fieldId}
                                draggableId={fieldId}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`px-3 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium cursor-move ${
                                      snapshot.isDragging
                                        ? "shadow-lg transform rotate-2"
                                        : ""
                                    }`}
                                  >
                                    {field ? field.label : fieldId}
                                  </div>
                                )}
                              </Draggable>
                            );
                          })}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </DragDropContext>
                </div>
              )}

              {/* Chart */}
              {loading ? (
                <div className="flex items-center justify-center h-64 sm:h-96">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading analytics data...</p>
                  </div>
                </div>
              ) : error ? (
                <div className="flex items-center justify-center h-64 sm:h-96">
                  <div className="text-center p-6 bg-red-50 rounded-lg border border-red-200">
                    <svg
                      className="w-12 h-12 text-red-500 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p className="text-red-700 font-medium">{error}</p>
                    <button
                      onClick={fetchAnalyticsData}
                      className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm font-medium"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              ) : chartDataForPlot ? (
                <div className="w-full overflow-x-auto">
                  <Plot
                    data={[chartDataForPlot]}
                    layout={{
                      title: {
                        text: `${selectedFields[0] ? availableFields.find(f => f.id === selectedFields[0])?.label || selectedFields[0] : "Data"} Distribution`,
                        font: { size: 18, color: "#374151" },
                      },
                      ...(chartType === "pie" ? {
                        showlegend: true,
                        legend: {
                          orientation: "v",
                          x: 1.05,
                          y: 0.5,
                          font: { size: 12, color: "#6B7280" },
                        },
                        margin: { l: 20, r: 150, t: 60, b: 20 },
                      } : {
                        xaxis: {
                          title: selectedFields[0]
                            ? availableFields.find((f) => f.id === selectedFields[0])
                                ?.label || selectedFields[0]
                            : "Category",
                          titlefont: { size: 14, color: "#6B7280" },
                        },
                        yaxis: {
                          title: "Count",
                          titlefont: { size: 14, color: "#6B7280" },
                        },
                        margin: { l: 60, r: 20, t: 60, b: 60 },
                      }),
                      paper_bgcolor: "white",
                      plot_bgcolor: "white",
                      font: { family: "Inter, sans-serif" },
                      responsive: true,
                    }}
                    config={{
                      displayModeBar: true,
                      displaylogo: false,
                      modeBarButtonsToRemove: ["pan2d", "lasso2d"],
                      responsive: true,
                    }}
                    style={{ width: "100%", minHeight: "400px" }}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 sm:h-96">
                  <div className="text-center p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <svg
                      className="w-12 h-12 text-gray-400 mx-auto mb-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                    <p className="text-gray-600 font-medium">
                      No data available. Please select fields and apply filters.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Data Table */}
          {chartData.length > 0 && (
            <div className="lg:col-span-1">
              <div className="bg-white rounded-lg shadow-md p-4 sm:p-6 sticky top-4 border border-gray-200">
                <h3 className="text-lg font-semibold text-gray-800 mb-3">
                  Data Table
                </h3>
                <div className="overflow-y-auto max-h-[600px]">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Category
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {chartData.slice(0, 20).map((item, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900 text-xs break-words">
                            {typeof item._id === "object"
                              ? JSON.stringify(item._id)
                              : String(item._id || "Unknown")}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-900 font-medium text-xs">
                            {item.count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {chartData.length > 20 && (
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    Showing first 20 of {chartData.length} results
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

