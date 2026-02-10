import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import Plot from "react-plotly.js";
import BulkUpload from "./BulkUpload.jsx";
import UnifiedTrainerSearch from "./UnifiedTrainerSearch.jsx";
import ActivityInsights from "./ActivityInsights.jsx";
import {
  getAllTrainers,
  deleteTrainerByAdmin,
  getPendingRequirementsCount,
  addAdmin,
  getAdminDashboard,
  getAdminRequirements,
  approveRequirement,
  updateTrainerByAdmin,
  analyticsQuery,
  getSkillDomains,
  expandDomain,
} from "../api";
import gisulLogo from "../assets/gisul final logo yellow-01 2.webp";

const SUPER_ADMINS = ["team@gisul.co.in", "super@gisul.com"];

export default function AdminDashboard({ token, onLogout }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [currentAdminEmail, setCurrentAdminEmail] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);

  const [newAdminData, setNewAdminData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);

  // Fetch current admin info on mount
  useEffect(() => {
    async function fetchAdminInfo() {
      try {
        const res = await getAdminDashboard(token);
        if (res.status === "success") {
          setCurrentAdminEmail(res.admin_email);
        }
      } catch (err) {
        console.error("Failed to fetch admin info", err);
      }
    }
    if (token) fetchAdminInfo();
  }, [token]);

  // Handler to add admin
  async function handleAddAdminSubmit(e) {
    e.preventDefault();
    setIsAddingAdmin(true);
    try {
      const res = await addAdmin(token, newAdminData);
      if (res.status === "success") {
        alert("✅ New Admin added successfully!");
        setIsAddAdminOpen(false);
        setNewAdminData({ name: "", email: "", password: "" }); // Reset form
      } else {
        alert("❌ Failed: " + (res.detail || "Unknown error"));
      }
    } catch (err) {
      alert("Error adding admin: " + err.message);
    } finally {
      setIsAddingAdmin(false);
    }
  }

  // Use ref to read URL parameter only once on mount, then ignore URL changes
  const initialTabRef = useRef(null);
  if (initialTabRef.current === null) {
    // Only read from URL on first render
    const urlTab = searchParams.get("tab");
    if (
      urlTab &&
      [
        "upload",
        "search",
        "list",
        "activity",
        "requirements",
        "analytics",
      ].includes(urlTab)
    ) {
      initialTabRef.current = urlTab;
    } else if (urlTab === "jd") {
      initialTabRef.current = "search"; // Redirect old "jd" tab to "search"
    } else {
      initialTabRef.current = "upload";
    }
  }

  // 1. Initialize state from URL (You already have this part essentially)
  const [tab, setTabState] = useState(initialTabRef.current);

  // 2. Create a wrapper function that updates BOTH state AND the URL
  const setTab = (newTab) => {
    setTabState(newTab);
    // Update the URL without reloading the page
    const newUrl = new URL(window.location);
    newUrl.searchParams.set("tab", newTab);
    window.history.pushState({}, "", newUrl);
  };

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // Handle OAuth token from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");

    if (urlToken) {
      // Save token to localStorage
      localStorage.setItem("token", urlToken);
      // Clean URL by removing token parameter (preserve tab parameter if exists)
      const tabParam = params.get("tab");
      const cleanUrl = tabParam
        ? `/admin/dashboard?tab=${tabParam}`
        : "/admin/dashboard";
      window.history.replaceState({}, document.title, cleanUrl);
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

  // Navbar Items Configuration
  const navItems = [
    {
      id: "upload",
      label: "Bulk Upload",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
        />
      ),
    },
    {
      id: "search",
      label: "Search",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      ),
    },
    {
      id: "list",
      label: "Trainers",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      ),
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      ),
    },
    {
      id: "activity",
      label: "Activity",
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans selection:bg-purple-100 pb-20">
      {/* --- MAXIMIZED FLOATING NAVBAR (Admin) --- */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-6 sm:pt-10 pointer-events-none">
        <header className="pointer-events-auto flex items-center justify-between w-full max-w-7xl bg-white/90 backdrop-blur-xl rounded-full px-6 sm:px-8 py-2 shadow-[0_12px_40px_rgb(0,0,0,0.12)] border border-white/50 transition-all duration-300">
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-4 sm:gap-5 pl-1">
            <img
              src={gisulLogo}
              alt="GISUL"
              className="h-16 sm:h-20 w-auto object-contain transition-transform hover:scale-105"
            />
            <div className="hidden sm:flex flex-col justify-center">
              <span className="font-extrabold text-gray-900 text-xl sm:text-2xl leading-none tracking-tight">
                GISUL
              </span>
              <span className="text-[10px] sm:text-[12px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">
                Admin Portal
              </span>
            </div>
          </div>

          {/* Center: Desktop Navigation (Pills) */}
          <nav className="hidden xl:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold transition-all duration-200 ${
                  tab === item.id
                    ? "bg-[#6953a3] text-white shadow-lg shadow-purple-200"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {item.icon}
                </svg>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* Right: Actions */}
          <div className="flex items-center gap-3 pr-1">
            {/* --- NEW: Settings Dropdown (Only for Super Admins) --- */}
            {SUPER_ADMINS.includes(currentAdminEmail) && (
              <div className="relative">
                <button
                  onClick={() => setSettingsOpen(!settingsOpen)}
                  className={`p-3 rounded-full transition-all duration-200 ${
                    settingsOpen
                      ? "bg-gray-100 text-gray-900"
                      : "hover:bg-gray-100 text-gray-500"
                  }`}
                  title="Settings"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>

                {/* Dropdown Menu */}
                {settingsOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-2 animate-fade-in-down z-50">
                    <button
                      onClick={() => {
                        setIsAddAdminOpen(true);
                        setSettingsOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 flex items-center gap-2 font-medium"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                        />
                      </svg>
                      Add Admin
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notification Bell */}
            <button
              onClick={() => {
                setTab("requirements");
                navigate("/admin/dashboard?tab=requirements", {
                  replace: true,
                });
              }}
              className={`relative p-3 rounded-full transition-all duration-200 group ${
                tab === "requirements"
                  ? "bg-purple-100 text-[#6953a3]"
                  : "hover:bg-gray-100 text-gray-500"
              }`}
              title="Pending Requirements"
            >
              <svg
                className="w-6 h-6 group-hover:scale-110 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {pendingCount > 0 && (
                <span className="absolute top-1 right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white animate-pulse">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </button>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="xl:hidden p-3 rounded-full hover:bg-gray-100 text-gray-500 transition"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="hidden sm:flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#F4E403] text-black font-extrabold text-sm hover:brightness-105 transition-all shadow-lg shadow-yellow-100 active:scale-95"
            >
              <span>Logout</span>
              <div className="bg-black/10 rounded-full p-1">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
              </div>
            </button>
          </div>
        </header>

        {/* Floating Mobile Menu Dropdown */}
        {mobileMenuOpen && (
          <div className="pointer-events-auto absolute top-full mt-4 w-full max-w-xl px-4 animate-fade-in-down">
            <div className="bg-white/95 backdrop-blur-xl rounded-[32px] shadow-2xl border border-white/50 p-4 flex flex-col gap-2">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full text-left px-6 py-4 rounded-2xl font-bold transition-all flex items-center gap-3 ${
                    tab === item.id
                      ? "bg-[#6953a3] text-white"
                      : "hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    {item.icon}
                  </svg>
                  {item.label}
                </button>
              ))}
              <div className="h-px bg-gray-100 my-2"></div>
              <button
                onClick={onLogout}
                className="w-full text-left px-6 py-4 rounded-2xl font-bold bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-3"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                Logout
              </button>
            </div>
          </div>
        )}
      </div>

      {/* --- Main Content (Padded to clear floating navbar) --- */}
      <main className="max-w-8xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 sm:pt-40">
        <div className="animate-fade-in">
          {tab === "upload" && <BulkUpload token={token} />}
          {tab === "search" && <UnifiedTrainerSearch token={token} />}
          {tab === "list" && (
            <React.Suspense
              fallback={
                <div className="flex justify-center py-20">
                  <div className="w-10 h-10 border-4 border-purple-200 border-t-[#6953a3] rounded-full animate-spin"></div>
                </div>
              }
            >
              <TrainersList token={token} />
            </React.Suspense>
          )}
          {tab === "analytics" && <InlineAnalytics token={token} />}
          {tab === "activity" && (
            <ActivityInsights
              token={token}
              onLogout={onLogout}
              embedded={true}
            />
          )}
          {tab === "requirements" && (
            <RequirementsApproval
              token={token}
              onApproval={() => {
                // Refresh pending count after approval
                getPendingRequirementsCount(token).then((res) =>
                  setPendingCount(res.pending_count || 0),
                );
              }}
            />
          )}
        </div>
      </main>

      {/* --- Add Admin Modal --- */}
      {isAddAdminOpen &&
        createPortal(
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]"
            onClick={() => setIsAddAdminOpen(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#6953a3] p-6 text-white">
                <h2 className="text-xl font-bold">Add New Admin</h2>
                <p className="text-purple-200 text-sm">
                  Grant admin privileges to a new user
                </p>
              </div>

              <form onSubmit={handleAddAdminSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={newAdminData.name}
                    onChange={(e) =>
                      setNewAdminData({ ...newAdminData, name: e.target.value })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={newAdminData.email}
                    onChange={(e) =>
                      setNewAdminData({
                        ...newAdminData,
                        email: e.target.value,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                    value={newAdminData.password}
                    onChange={(e) =>
                      setNewAdminData({
                        ...newAdminData,
                        password: e.target.value,
                      })
                    }
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAddAdminOpen(false)}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isAddingAdmin}
                    className="px-6 py-2 bg-[#6953a3] text-white rounded-lg font-bold hover:bg-[#58448c] disabled:opacity-50"
                  >
                    {isAddingAdmin ? "Adding..." : "Create Admin"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}

      <style>{`
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .animate-fade-in-down { animation: fadeInDown 0.3s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeInDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
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
      alert(
        "Failed to fetch requirements: " + (err.message || "Unknown error"),
      );
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
      setAdminNotes((prev) => {
        const newNotes = { ...prev };
        delete newNotes[requirementId];
        return newNotes;
      });
    } catch (err) {
      alert(
        "Failed to update requirement: " + (err.message || "Unknown error"),
      );
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

  const pendingRequirements = requirements.filter(
    (r) => r.status === "pending",
  );
  const otherRequirements = requirements.filter((r) => r.status !== "pending");

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br from-purple-500 to-purple-700">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
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
            <svg
              className="animate-spin h-12 w-12 text-purple-600 mx-auto mb-4"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
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
                            <h3 className="text-lg font-semibold text-gray-900">
                              Requirement #{idx + 1}
                            </h3>
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
                              Pending
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-semibold">Customer:</span>{" "}
                            {req.customer_name ||
                              req.customer_email ||
                              "Unknown"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Posted on: {formatDate(req.created_at)}
                          </p>
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Requirement Text:
                        </p>
                        <p className="text-sm text-gray-600 bg-white p-3 rounded-lg max-h-40 overflow-y-auto border border-gray-200">
                          {req.requirement_text || "N/A"}
                        </p>
                      </div>

                      {(req.skills && req.skills.length > 0) ||
                      req.domain ||
                      req.experience_years ? (
                        <div className="mb-4 flex flex-wrap gap-2">
                          {req.skills && req.skills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              <span className="text-xs font-semibold text-gray-600">
                                Skills:
                              </span>
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
                              <span className="text-xs font-semibold text-gray-600">
                                Domain:
                              </span>
                              <span className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                {req.domain}
                              </span>
                            </div>
                          )}
                          {req.experience_years && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-semibold text-gray-600">
                                Experience:
                              </span>
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
                          onChange={(e) =>
                            setAdminNotes((prev) => ({
                              ...prev,
                              [req.requirement_id]: e.target.value,
                            }))
                          }
                          placeholder="Add notes about this requirement..."
                          className="w-full p-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm resize-y min-h-[80px]"
                        />
                      </div>

                      <div className="flex gap-3">
                        <button
                          onClick={() =>
                            handleApproval(req.requirement_id, true)
                          }
                          disabled={approving === req.requirement_id}
                          className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {approving === req.requirement_id ? (
                            <>
                              <svg
                                className="animate-spin h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                              <span>Approve</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() =>
                            handleApproval(req.requirement_id, false)
                          }
                          disabled={approving === req.requirement_id}
                          className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {approving === req.requirement_id ? (
                            <>
                              <svg
                                className="animate-spin h-5 w-5"
                                fill="none"
                                viewBox="0 0 24 24"
                              >
                                <circle
                                  className="opacity-25"
                                  cx="12"
                                  cy="12"
                                  r="10"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                ></circle>
                                <path
                                  className="opacity-75"
                                  fill="currentColor"
                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                ></path>
                              </svg>
                              <span>Processing...</span>
                            </>
                          ) : (
                            <>
                              <svg
                                className="w-5 h-5"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
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
                        req.status === "approved"
                          ? "border-green-300 bg-green-50/30"
                          : "border-red-300 bg-red-50/30"
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold text-gray-900">
                              Requirement #{idx + 1}
                            </h3>
                            <span
                              className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                req.status === "approved"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {req.status === "approved"
                                ? "Approved"
                                : "Rejected"}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-1">
                            <span className="font-semibold">Customer:</span>{" "}
                            {req.customer_name ||
                              req.customer_email ||
                              "Unknown"}
                          </p>
                          <p className="text-sm text-gray-500">
                            Posted on: {formatDate(req.created_at)} |
                            {req.updated_at &&
                              req.updated_at !== req.created_at &&
                              ` Updated on: ${formatDate(req.updated_at)}`}
                          </p>
                          {req.approved_by && (
                            <p className="text-xs text-gray-500 mt-1">
                              {req.status === "approved"
                                ? "Approved"
                                : "Rejected"}{" "}
                              by: {req.approved_by}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="mb-4">
                        <p className="text-sm font-medium text-gray-700 mb-1">
                          Requirement Text:
                        </p>
                        <p className="text-sm text-gray-600 bg-white p-3 rounded-lg max-h-32 overflow-y-auto border border-gray-200">
                          {req.requirement_text || "N/A"}
                        </p>
                      </div>

                      {req.admin_notes && (
                        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <p className="text-xs font-semibold text-yellow-800 mb-1">
                            Admin Notes:
                          </p>
                          <p className="text-sm text-yellow-900">
                            {req.admin_notes}
                          </p>
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
                  <svg
                    className="w-10 h-10 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <p className="text-gray-500 text-lg font-medium mb-2">
                  No requirements found
                </p>
                <p className="text-gray-400 text-sm">
                  Customer requirements will appear here
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function TrainersList({ token }) {
  // ---------------------------------------------------------------------------
  // LOGIC BLOCK START (UNTOUCHED)
  // ---------------------------------------------------------------------------
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
    min_commercial: "",
    max_commercial: "",
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
      return skills.filter((s) => typeof s === "string" && s.trim());
    }

    if (typeof skills === "string") {
      return skills
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    if (typeof skills === "object") {
      return Object.values(skills)
        .map((s) => String(s).trim())
        .filter((s) => s.length > 0);
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
      setSkillDomainSuggestions(
        Array.from(domains).sort((a, b) => a.localeCompare(b)),
      );
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
  }, [
    trainers,
    searchQuery,
    experienceFilter,
    skillDomainFilter,
    expandedKeywords,
  ]);

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
      } else if (Array.isArray(data)) {
        console.log("Response is array, loaded trainers:", data.length);
        setTrainers(data);
      } else {
        console.error("Unexpected response format:", data);
        alert(
          "Failed to load trainers: Unexpected response format. Check console for details.",
        );
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
            : typeof trainer?.skill_domains === "string" &&
                trainer.skill_domains
              ? [normalizeString(trainer.skill_domains).toLowerCase()]
              : [];
          const trainerSkills = normalizeSkills(trainer?.skills);
          const skills = trainerSkills.map((s) =>
            normalizeString(s).toLowerCase(),
          );

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
        matchesExperience(trainer?.experience_years, experienceFilter),
      );
    }

    // Filter by skill domain/skill (client-side filtering) with domain expansion
    if (skillDomainFilter && skillDomainFilter.trim()) {
      const filterValue = normalizeString(skillDomainFilter)
        .toLowerCase()
        .trim();
      if (filterValue) {
        // Use expanded keywords from state (populated by API)
        const searchTerms =
          expandedKeywords.length > 0 ? expandedKeywords : [filterValue]; // If no expansion, search for the original term

        filtered = filtered.filter((trainer) => {
          // Get and normalize skills from trainer profile
          const skills = normalizeSkills(trainer?.skills || []);
          const skillsNormalized = skills
            .map((s) => {
              const normalized = normalizeString(s).toLowerCase().trim();
              return normalized;
            })
            .filter((s) => s.length > 0);

          // Get and normalize skill_domains from trainer profile
          const domains = Array.isArray(trainer?.skill_domains)
            ? trainer.skill_domains.map((d) =>
                normalizeString(d).toLowerCase().trim(),
              )
            : typeof trainer?.skill_domains === "string" &&
                trainer.skill_domains
              ? [normalizeString(trainer.skill_domains).toLowerCase().trim()]
              : [];

          // Check if any of the expanded keywords match trainer's skills or domains
          const matchesSkill = skillsNormalized.some((skill) => {
            if (!skill) return false;
            // Check if skill contains any of the search terms (case-insensitive)
            return searchTerms.some((term) =>
              skill.includes(term.toLowerCase()),
            );
          });

          const matchesDomain = domains.some((domain) => {
            if (!domain || typeof domain !== "string") return false;
            // Check if domain contains any of the search terms (case-insensitive)
            return searchTerms.some((term) =>
              domain.includes(term.toLowerCase()),
            );
          });

          // Return true if either skills or domains match
          const matches = matchesSkill || matchesDomain;

          return matches;
        });
      }
    }

    console.log(
      `Applied filters: search="${searchQuery}", experience="${experienceFilter}", skillDomain="${skillDomainFilter}"`,
    );
    console.log(
      `Filtered ${filtered.length} trainers from ${trainers.length} total`,
    );

    // Debug skill domain filter
    if (skillDomainFilter && skillDomainFilter.trim()) {
      console.log(`🔍 Skill Domain Filter Debug:`);
      console.log(`   Filter value: "${skillDomainFilter}"`);
      console.log(`   Matched ${filtered.length} trainers`);
      if (filtered.length > 0 && filtered.length <= 5) {
        filtered.forEach((trainer, idx) => {
          const skills = normalizeSkills(trainer?.skills || []);
          const domains = Array.isArray(trainer?.skill_domains)
            ? trainer.skill_domains
            : [];
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
  }, [
    trainers,
    searchQuery,
    experienceFilter,
    skillDomainFilter,
    expandedKeywords,
  ]);

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
    const trainerEmail =
      trainer.email &&
      String(trainer.email).trim() !== "" &&
      trainer.email !== "N/A" &&
      trainer.email !== "n/a"
        ? String(trainer.email).trim()
        : "";

    // Handle phone - can be string, number, or null/undefined
    let trainerPhone = "";
    if (trainer.phone !== null && trainer.phone !== undefined) {
      const phoneStr = String(trainer.phone).trim();
      if (
        phoneStr !== "" &&
        phoneStr !== "N/A" &&
        phoneStr !== "n/a" &&
        phoneStr !== "null" &&
        phoneStr !== "undefined"
      ) {
        trainerPhone = phoneStr;
      }
    }

    // Handle location - can be string or null/undefined
    let trainerLocation = "";
    if (trainer.location !== null && trainer.location !== undefined) {
      const locationStr = String(trainer.location).trim();
      if (
        locationStr !== "" &&
        locationStr !== "N/A" &&
        locationStr !== "n/a" &&
        locationStr !== "null" &&
        locationStr !== "undefined"
      ) {
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
      rawTrainer: trainer,
    });

    // Handle name - can be string or null/undefined
    let trainerName = "";
    if (trainer.name !== null && trainer.name !== undefined) {
      const nameStr = String(trainer.name).trim();
      if (
        nameStr !== "" &&
        nameStr !== "N/A" &&
        nameStr !== "n/a" &&
        nameStr !== "null" &&
        nameStr !== "undefined"
      ) {
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
      min_commercial: trainer.min_commercial || "",
      max_commercial: trainer.max_commercial || "",
    });
  }

  function handleCloseEditModal() {
    setEditingTrainer(null);
    setEditFormData({
      name: "",
      email: "",
      phone: "",
      location: "",
      skills: "",
    });
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
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const updateData = {
        name: editFormData.name.trim() || undefined,
        email: editFormData.email.trim() || undefined,
        phone: editFormData.phone.trim() || undefined,
        location: editFormData.location.trim() || undefined,
        skills: skillsArray.length > 0 ? skillsArray : undefined,
        min_commercial: editFormData.min_commercial
          ? parseFloat(editFormData.min_commercial)
          : undefined,
        max_commercial: editFormData.max_commercial
          ? parseFloat(editFormData.max_commercial)
          : undefined,
      };

      // Remove undefined fields
      Object.keys(updateData).forEach((key) => {
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
      `Are you sure you want to delete trainer "${displayName}"? This action cannot be undone and will remove them from the database and search index.`,
    );
    if (!confirmed) return;

    try {
      setDeleting(identifier);
      const res = await deleteTrainerByAdmin(token, identifier);
      if (res.status === "success") {
        // Remove from state - check both email and profile_id
        setTrainers((prev) =>
          prev.filter((t) => {
            return t.email !== email && t.profile_id !== profileId;
          }),
        );
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

  // --- HELPER COMPONENT: Status Badge ---
  const StatusBadge = ({ isAvailable }) => (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap shadow-sm ${
        isAvailable
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-500 border-gray-200"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isAvailable ? "bg-green-500" : "bg-gray-400"}`}
      ></span>
      {isAvailable ? "Available" : "Busy"}
    </span>
  );

  const experienceYears = [
    ...new Set(
      trainers
        .map((t) => t.experience_years)
        .filter((y) => y !== null && y !== undefined),
    ),
  ].sort((a, b) => a - b);

  // Ensure component always renders something
  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center border border-gray-100">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-6 h-6 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <p className="text-red-500 font-medium">
            Error: No authentication token provided
          </p>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // LOGIC BLOCK END
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-[107rem] mx-auto space-y-6">
        {/* Main Card */}
        <div className="bg-white border border-gray-200/60 rounded-3xl shadow-[0_0_40px_-10px_rgba(0,0,0,0.08)] overflow-hidden">
          {/* Header & Controls Area */}
          <div className="p-6 sm:p-8 border-b border-gray-100 bg-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
                  Trainers <span style={{ color: "#6953a3" }}>List</span>
                </h2>
                <p className="text-gray-500 text-sm mt-1">
                  Manage and search your expert trainers
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-400 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                  Total: {trainers.length}
                </span>
                {filteredTrainers.length !== trainers.length && (
                  <span className="text-xs font-semibold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg border border-purple-100">
                    Filtered: {filteredTrainers.length}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Main Search */}
              <div className="lg:col-span-5 relative group">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-[#6953a3] transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  placeholder="Search by name, email..."
                  className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6953a3]/20 focus:border-[#6953a3] transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={handleKeyPress}
                />
              </div>

              {/* Skill Domain Filter */}
              <div className="lg:col-span-4 relative group">
                <div className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 group-focus-within:text-[#6953a3] transition-colors">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  ref={searchInputRef}
                  value={skillDomainFilter}
                  onChange={(e) => {
                    setSkillDomainFilter(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Filter by Skill Domain..."
                  className="w-full pl-12 pr-10 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#6953a3]/20 focus:border-[#6953a3] transition-all"
                />
                {skillDomainFilter && (
                  <button
                    onClick={() => {
                      setSkillDomainFilter("");
                      setExpandedKeywords([]);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full transition-all"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                )}

                {/* Suggestions Dropdown */}
                {showSuggestions &&
                  skillDomainFilter &&
                  skillDomainSuggestions.length > 0 && (
                    <div
                      ref={suggestionsRef}
                      className="absolute z-50 w-full mt-2 bg-white border border-gray-100 rounded-xl shadow-xl max-h-60 overflow-y-auto custom-scrollbar animate-in fade-in zoom-in-95 duration-100"
                    >
                      {skillDomainSuggestions
                        .filter((domain) =>
                          domain
                            .toLowerCase()
                            .includes(skillDomainFilter.toLowerCase()),
                        )
                        .slice(0, 10)
                        .map((domain) => (
                          <div
                            key={domain}
                            onClick={() => {
                              setSkillDomainFilter(domain);
                              setShowSuggestions(false);
                            }}
                            className="px-4 py-3 hover:bg-purple-50 cursor-pointer text-sm text-gray-700 hover:text-[#6953a3] transition-colors border-b border-gray-50 last:border-none"
                          >
                            {domain}
                          </div>
                        ))}
                    </div>
                  )}
              </div>

              {/* Experience Filter & Action */}
              <div className="lg:col-span-3 flex gap-3">
                <div className="relative flex-1">
                  <select
                    value={experienceFilter}
                    onChange={(e) => setExperienceFilter(e.target.value)}
                    className="w-full h-full pl-4 pr-8 py-3.5 bg-gray-50 border border-gray-200 rounded-xl text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-[#6953a3]/20 focus:border-[#6953a3] cursor-pointer"
                  >
                    <option value="all">All Experience</option>
                    <option value="none">No Experience</option>
                    <option value="0-2">0-2 years</option>
                    <option value="3-5">3-5 years</option>
                    <option value="6-10">6-10 years</option>
                    <option value="10+">10+ years</option>
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-gray-400">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </div>

                <button
                  onClick={handleSearch}
                  className="px-6 py-3.5 rounded-xl text-white font-bold text-sm shadow-lg shadow-purple-200 hover:shadow-purple-300 transform hover:-translate-y-0.5 transition-all duration-200 whitespace-nowrap"
                  style={{ backgroundColor: "#6953a3" }}
                >
                  Search
                </button>
              </div>
            </div>

            {/* AI Expansion Feedback */}
            {(expandedKeywords.length > 0 || expandingDomain) &&
              skillDomainFilter && (
                <div className="mt-4 p-4 bg-purple-50/50 border border-purple-100 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                  <div className="bg-white p-2 rounded-lg shadow-sm text-[#6953a3]">
                    {expandingDomain ? (
                      <svg
                        className="w-5 h-5 animate-spin"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="w-5 h-5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800 mb-2">
                      {expandingDomain
                        ? `AI is expanding "${skillDomainFilter}"...`
                        : "AI Expanded Search Scope:"}
                    </p>
                    {!expandingDomain && (
                      <div className="flex flex-wrap gap-2">
                        {expandedKeywords.slice(0, 10).map((keyword, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 bg-white border border-purple-100 text-[#6953a3] text-xs font-medium rounded-md shadow-sm"
                          >
                            {keyword}
                          </span>
                        ))}
                        {expandedKeywords.length > 10 && (
                          <span className="px-2.5 py-1 bg-purple-100 text-[#6953a3] text-xs font-bold rounded-md">
                            +{expandedKeywords.length - 10} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
          </div>

          {/* Content Area */}
          <div className="p-0">
            {loading ? (
              <div className="text-center py-20">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-gray-100 border-t-[#6953a3] mx-auto mb-4"></div>
                <p className="text-gray-500 font-medium">
                  Loading trainer directory...
                </p>
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="block md:hidden p-4 space-y-4">
                  {filteredTrainers.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-2xl border-2 border-dashed border-gray-200">
                      <p className="text-gray-500">
                        No trainers found matching criteria.
                      </p>
                    </div>
                  ) : (
                    filteredTrainers.map((trainer, index) => {
                      if (!trainer || typeof trainer !== "object") return null;

                      // Logic variables extraction
                      const trainerName = String(trainer.name || "N/A");
                      const trainerEmailRaw = trainer.email;
                      const trainerEmail = trainerEmailRaw
                        ? String(trainerEmailRaw)
                        : "N/A";
                      const hasValidEmail =
                        trainerEmailRaw &&
                        trainerEmailRaw !== "N/A" &&
                        trainerEmailRaw !== "n/a" &&
                        trainerEmailRaw.trim() !== "" &&
                        trainerEmailRaw.includes("@");
                      const trainerProfileId = trainer.profile_id || "";
                      const canDelete =
                        hasValidEmail ||
                        (trainerProfileId && trainerProfileId.trim() !== "");
                      const deleteIdentifier = hasValidEmail
                        ? trainerEmailRaw || trainerEmail
                        : trainerProfileId;
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
                          className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="font-bold text-gray-900 text-lg mb-1">
                                {trainerName}
                              </h3>
                              <p className="text-sm text-gray-500 truncate max-w-[200px]">
                                {trainerEmail}
                              </p>
                            </div>
                            <StatusBadge isAvailable={trainer.is_available} />
                          </div>

                          <div className="space-y-3 mb-5">
                            <div className="flex gap-2">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider min-w-[70px]">
                                Skills
                              </span>
                              <div className="flex-1">
                                {skills.length > 0 ? (
                                  <div className="flex flex-wrap gap-1">
                                    {skills.slice(0, 3).map((s, i) => (
                                      <span
                                        key={i}
                                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded"
                                      >
                                        {s}
                                      </span>
                                    ))}
                                    {skills.length > 3 && (
                                      <span className="text-xs text-gray-400">
                                        +{skills.length - 3}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-xs text-gray-400 italic">
                                    N/A
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider min-w-[70px]">
                                Exp
                              </span>
                              <span className="text-sm font-medium text-gray-700">
                                {experienceYears !== null &&
                                !Number.isNaN(experienceYears)
                                  ? `${experienceYears} Years`
                                  : "N/A"}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={() => handleEditTrainer(trainer)}
                              disabled={!canDelete}
                              className="py-2.5 rounded-xl text-sm font-bold text-[#6953a3] bg-purple-50 hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              Edit Profile
                            </button>
                            <button
                              onClick={() =>
                                handleDeleteTrainer(
                                  trainerEmailRaw || trainerEmail,
                                  trainerName,
                                  trainerProfileId,
                                )
                              }
                              disabled={
                                deleting === deleteIdentifier || !canDelete
                              }
                              className="py-2.5 rounded-xl text-sm font-bold text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                              {deleting === deleteIdentifier ? "..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Desktop Table View */}
                <div
                  className="hidden md:block overflow-x-auto"
                  ref={tableContainerRef}
                >
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Trainer Details
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider">
                          Contact
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider w-1/3">
                          Skills & Expertise
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
                          Experience
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-center">
                          Commercial Range
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-gray-400 uppercase tracking-wider text-right">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredTrainers.length === 0 ? (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center">
                            <div className="flex flex-col items-center justify-center text-gray-400">
                              <svg
                                className="w-12 h-12 mb-3 text-gray-200"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                              <p className="text-lg font-medium">
                                No results found
                              </p>
                              <p className="text-sm">
                                Try adjusting your filters
                              </p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredTrainers.map((trainer, index) => {
                          if (!trainer || typeof trainer !== "object")
                            return null;

                          // Variable extraction logic (Same as original)
                          const trainerName = String(trainer.name || "N/A");
                          const trainerEmailRaw = trainer.email;
                          const trainerEmail = trainerEmailRaw
                            ? String(trainerEmailRaw)
                            : "N/A";
                          const hasValidEmail =
                            trainerEmailRaw &&
                            trainerEmailRaw !== "N/A" &&
                            trainerEmailRaw !== "n/a" &&
                            trainerEmailRaw.trim() !== "" &&
                            trainerEmailRaw.includes("@");
                          const trainerProfileId = trainer.profile_id || "";
                          const canDelete =
                            hasValidEmail ||
                            (trainerProfileId &&
                              trainerProfileId.trim() !== "");
                          const deleteIdentifier = hasValidEmail
                            ? trainerEmailRaw || trainerEmail
                            : trainerProfileId;
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
                              className="group hover:bg-purple-50/30 transition-colors"
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center text-[#6953a3] font-bold text-sm shadow-sm border border-purple-100">
                                    {trainerName.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-gray-900">
                                      {trainerName}
                                    </p>
                                    <div className="mt-1">
                                      <StatusBadge
                                        isAvailable={trainer.is_available}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div
                                  className="text-sm text-gray-600 font-medium"
                                  title={
                                    trainerEmail || `ID: ${trainerProfileId}`
                                  }
                                >
                                  {trainerEmail !== "N/A" ? (
                                    trainerEmail
                                  ) : (
                                    <span className="text-gray-400 text-xs font-mono bg-gray-50 px-2 py-1 rounded">
                                      ID: {trainerProfileId.substring(0, 8)}...
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1.5">
                                  {skills.length > 0 ? (
                                    <>
                                      {skills.slice(0, 3).map((skill, i) => (
                                        <span
                                          key={i}
                                          className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                                        >
                                          {skill}
                                        </span>
                                      ))}
                                      {skills.length > 3 && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-purple-50 text-[#6953a3] border border-purple-100">
                                          +{skills.length - 3}
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-sm text-gray-400 italic">
                                      No specific skills listed
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-center">
                                {experienceYears !== null &&
                                !Number.isNaN(experienceYears) ? (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-100">
                                    {experienceYears} Yrs
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                              <td className="px-6 py-4 text-center">
  {(trainer.min_commercial || trainer.max_commercial) ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-bold bg-green-50 text-green-700 border border-green-100 whitespace-nowrap">
      ₹{trainer.min_commercial || 0} - ₹{trainer.max_commercial || 0}
    </span>
  ) : (
    <span className="text-gray-400 text-xs italic">N/A</span>
  )}
</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleEditTrainer(trainer)}
                                    disabled={!canDelete}
                                    className="p-2 text-gray-500 hover:text-[#6953a3] hover:bg-purple-50 rounded-lg transition-all disabled:opacity-50"
                                    title={canDelete ? "Edit" : "Cannot edit"}
                                  >
                                    <svg
                                      className="w-5 h-5"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDeleteTrainer(
                                        trainerEmailRaw || trainerEmail,
                                        trainerName,
                                        trainerProfileId,
                                      )
                                    }
                                    disabled={
                                      deleting === deleteIdentifier ||
                                      !canDelete
                                    }
                                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all disabled:opacity-50"
                                    title={
                                      canDelete ? "Delete" : "Cannot delete"
                                    }
                                  >
                                    {deleting === deleteIdentifier ? (
                                      <svg
                                        className="w-5 h-5 animate-spin"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                      >
                                        <circle
                                          className="opacity-25"
                                          cx="12"
                                          cy="12"
                                          r="10"
                                          stroke="currentColor"
                                          strokeWidth="4"
                                        ></circle>
                                        <path
                                          className="opacity-75"
                                          fill="currentColor"
                                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                        ></path>
                                      </svg>
                                    ) : (
                                      <svg
                                        className="w-5 h-5"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          strokeWidth={2}
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        />
                                      </svg>
                                    )}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Edit Trainer Modal - With Backdrop Blur and Scale Animation */}
      {editingTrainer &&
        typeof createPortal === "function" &&
        createPortal(
          <div
            className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[99999]"
            onClick={handleCloseEditModal}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto transform transition-all animate-in fade-in zoom-in-95 duration-200 border border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-[#6953a3] to-purple-800 p-8 rounded-t-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl pointer-events-none"></div>
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                      Edit Profile
                    </h2>
                    <p className="text-purple-200 text-sm mt-1 font-medium">
                      Update trainer details and competencies
                    </p>
                  </div>
                  <button
                    onClick={handleCloseEditModal}
                    className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2.5 transition-all backdrop-blur-md"
                    disabled={saving}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2.5}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-8">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Name
                      </label>
                      <input
                        type="text"
                        value={editFormData.name || ""}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            name: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#6953a3] focus:border-transparent transition-all outline-none"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={editFormData.email || ""}
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            email: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#6953a3] focus:border-transparent transition-all outline-none"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={
                          editFormData.phone ||
                          (editingTrainer?.phone
                            ? String(editingTrainer.phone)
                            : "") ||
                          ""
                        }
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            phone: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#6953a3] focus:border-transparent transition-all outline-none"
                        disabled={saving}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        Location
                      </label>
                      <input
                        type="text"
                        value={
                          editFormData.location ||
                          (editingTrainer?.location
                            ? String(editingTrainer.location)
                            : "") ||
                          ""
                        }
                        onChange={(e) =>
                          setEditFormData({
                            ...editFormData,
                            location: e.target.value,
                          })
                        }
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#6953a3] focus:border-transparent transition-all outline-none"
                        disabled={saving}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Skills (Comma Separated)
                    </label>
                    <textarea
                      value={editFormData.skills || ""}
                      onChange={(e) =>
                        setEditFormData({
                          ...editFormData,
                          skills: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-[#6953a3] focus:border-transparent transition-all outline-none resize-none min-h-[120px]"
                      placeholder="e.g. Java, Python, React, AWS..."
                      disabled={saving}
                    />
                    <div className="flex justify-end">
                      <span className="text-xs text-gray-400">
                        {editFormData.skills
                          ? `${editFormData.skills.split(",").filter((s) => s.trim()).length} skills`
                          : "0 skills"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                  <button
                    onClick={handleCloseEditModal}
                    disabled={saving}
                    className="px-6 py-3 rounded-xl text-gray-600 font-bold hover:bg-gray-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveTrainer}
                    disabled={saving || !editFormData.email.trim()}
                    className="px-8 py-3 rounded-xl bg-[#6953a3] text-white font-bold shadow-lg shadow-purple-200 hover:shadow-xl hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:translate-y-0"
                  >
                    {saving ? (
                      <span className="flex items-center gap-2">
                        <svg
                          className="animate-spin h-4 w-4"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                            fill="none"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Saving...
                      </span>
                    ) : (
                      "Save Changes"
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
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
          Object.entries(filters).filter(([_, v]) => v !== ""),
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
          setError(
            response.message || "No data available for the selected filters.",
          );
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
        : [...prev, fieldId],
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
        .join(","),
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
            "#6953a3",
            "#8b7bb8",
            "#a89ac8",
            "#c5b9d8",
            "#e2d8e8",
            "#4a3a7a",
            "#6b5a9a",
            "#8c7aba",
            "#ad9cda",
            "#cebdfa",
            "#3d2f62",
            "#5d4f82",
            "#7d6fa2",
            "#9d8fc2",
            "#bdafe2",
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
  //min-h-screen bg-gray-50/50 p-4 sm:p-6 lg:p-8 font-sans

  return (
    <div className="w-full max-w-[110rem] mx-auto px-4 sm:px-6 py-8">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 border border-purple-100/50">
        {/* Header Section */}
        <div className="text-center mb-10 relative">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-purple-50 to-transparent opacity-30 blur-3xl -z-10 pointer-events-none"></div>
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-gradient-to-br from-purple-600 to-indigo-700 shadow-lg shadow-purple-500/30 transform transition-transform hover:scale-105 duration-300">
            <svg
              className="w-10 h-10 text-white"
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
          </div>
          <h2 className="text-4xl sm:text-5xl font-extrabold mb-4 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
            Analytics Visualization
          </h2>
          {/* <p className="text-gray-500 text-lg sm:text-xl max-w-2xl mx-auto font-light leading-relaxed">
            Gain insights into trainer data with powerful interactive charts and
            real-time filtering.
          </p> */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          {/* Left Sidebar - Filters (Takes 2 columns on large screens) */}
          <div className="lg:col-span-3 xl:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg shadow-purple-900/5 p-6 sticky top-6 border border-gray-100 h-fit transition-shadow hover:shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                    />
                  </svg>
                  Filters
                </h2>
                {/* Reset button small icon for mobile optimized view could go here */}
              </div>

              {/* Experience Filter */}
              <div className="mb-5">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Experience
                </label>
                <div className="relative">
                  <select
                    value={filters.experience}
                    onChange={(e) =>
                      handleFilterChange("experience", e.target.value)
                    }
                    className="w-full pl-3 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium text-gray-700 transition-colors cursor-pointer hover:border-purple-300 outline-none appearance-none"
                  >
                    <option value="">All Levels</option>
                    <option value="0-2">0-2 years</option>
                    <option value="3-5">3-5 years</option>
                    <option value="6-10">6-10 years</option>
                    <option value="10+">10+ years</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-500">
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M19 9l-7 7-7-7"
                      ></path>
                    </svg>
                  </div>
                </div>
              </div>

              {/* Skill Category Filter */}
              <div className="mb-5">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Skill Category
                </label>
                <input
                  type="text"
                  value={filters.skill_category}
                  onChange={(e) =>
                    handleFilterChange("skill_category", e.target.value)
                  }
                  placeholder="e.g. Development"
                  className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium transition-all hover:bg-white focus:bg-white outline-none"
                />
              </div>

              {/* Location Filter */}
              <div className="mb-8">
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                  Location
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      ></path>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      ></path>
                    </svg>
                  </span>
                  <input
                    type="text"
                    value={filters.location}
                    onChange={(e) =>
                      handleFilterChange("location", e.target.value)
                    }
                    placeholder="City or Country"
                    className="w-full pl-9 pr-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-sm font-medium transition-all hover:bg-white focus:bg-white outline-none"
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 my-6"></div>

              {/* Chart Type Selector */}
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Visualization Style
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setChartType("bar")}
                    className={`flex items-center justify-center space-x-2 p-2 rounded-lg text-sm font-medium transition-all ${chartType === "bar" ? "bg-purple-100 text-purple-700 ring-1 ring-purple-300" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      ></path>
                    </svg>
                    <span>Bar</span>
                  </button>
                  <button
                    onClick={() => setChartType("pie")}
                    className={`flex items-center justify-center space-x-2 p-2 rounded-lg text-sm font-medium transition-all ${chartType === "pie" ? "bg-purple-100 text-purple-700 ring-1 ring-purple-300" : "bg-gray-50 text-gray-600 hover:bg-gray-100"}`}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                      ></path>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                      ></path>
                    </svg>
                    <span>Pie</span>
                  </button>
                </div>
              </div>

              {/* Available Fields */}
              <div className="mb-8">
                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                  Compare Fields
                </h3>
                <div className="space-y-1 bg-gray-50/50 p-2 rounded-xl border border-gray-100">
                  {availableFields.map((field) => (
                    <label
                      key={field.id}
                      className="flex items-center space-x-3 cursor-pointer p-2.5 hover:bg-white hover:shadow-sm rounded-lg transition-all group"
                    >
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedFields.includes(field.id)}
                          onChange={() => toggleField(field.id)}
                          className="w-4 h-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded transition-all cursor-pointer"
                        />
                      </div>
                      <span className="text-sm text-gray-700 font-medium group-hover:text-purple-700 transition-colors">
                        {field.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleExportCSV}
                  disabled={chartData.length === 0}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl transition-all shadow-md shadow-purple-200 active:scale-95 text-sm font-semibold"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    ></path>
                  </svg>
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={handleReset}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 text-gray-600 hover:text-gray-800 rounded-xl transition-all text-sm font-semibold active:scale-95"
                >
                  Reset Filters
                </button>
              </div>
            </div>
          </div>

          {/* Middle - Chart Visualization (Takes larger chunk now) */}
          <div
            className={`${chartData.length > 0 ? "lg:col-span-7 xl:col-span-7" : "lg:col-span-9 xl:col-span-10"}`}
          >
            <div className="bg-white rounded-2xl shadow-lg shadow-purple-900/5 p-6 sm:p-8 border border-gray-100 min-h-[600px] flex flex-col">
              <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-gray-50 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800 tracking-tight">
                    Data Overview
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Real-time visual representation of your filtered data.
                  </p>
                </div>

                {selectedFields.length > 0 && (
                  <div className="px-4 py-1.5 bg-purple-50 text-purple-700 rounded-full text-xs font-semibold border border-purple-100">
                    Analysis:{" "}
                    {selectedFields
                      .map((f) => {
                        const field = availableFields.find((af) => af.id === f);
                        return field ? field.label : f;
                      })
                      .join(" vs ")}
                  </div>
                )}
              </div>

              {/* Drag & Drop Fields */}
              {selectedFields.length > 0 && (
                <div className="mb-6 bg-gray-50/50 p-4 rounded-xl border border-dashed border-gray-200">
                  <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                      ></path>
                    </svg>
                    Reorder Axes Priority
                  </h3>
                  <DragDropContext onDragEnd={handleDragEnd}>
                    <Droppable droppableId="fields" direction="horizontal">
                      {(provided) => (
                        <div
                          {...provided.droppableProps}
                          ref={provided.innerRef}
                          className="flex flex-wrap gap-3"
                        >
                          {selectedFields.map((fieldId, index) => {
                            const field = availableFields.find(
                              (f) => f.id === fieldId,
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
                                    className={`px-4 py-2 bg-white border border-purple-200 text-purple-700 rounded-lg text-sm font-semibold shadow-sm hover:shadow-md transition-all cursor-move flex items-center gap-2 ${
                                      snapshot.isDragging
                                        ? "shadow-lg ring-2 ring-purple-400 scale-105 z-10"
                                        : "hover:border-purple-300"
                                    }`}
                                  >
                                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
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
              <div className="flex-grow flex flex-col justify-center">
                {loading ? (
                  <div className="flex flex-col items-center justify-center h-64 sm:h-96">
                    <div className="relative">
                      <div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-100 border-t-purple-600"></div>
                      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-purple-600">
                        <svg
                          className="w-6 h-6"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                      </div>
                    </div>
                    <p className="text-gray-500 mt-6 font-medium animate-pulse">
                      Processing analytics data...
                    </p>
                  </div>
                ) : error ? (
                  <div className="flex items-center justify-center h-64 sm:h-96">
                    <div className="text-center p-8 bg-red-50/50 rounded-2xl border border-red-100 max-w-md">
                      <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                          className="w-8 h-8 text-red-500"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-bold text-gray-800 mb-2">
                        Unable to load data
                      </h3>
                      <p className="text-red-600/80 font-medium text-sm mb-6">
                        {error}
                      </p>
                      <button
                        onClick={fetchAnalyticsData}
                        className="px-6 py-2.5 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-xl transition font-semibold text-sm shadow-sm"
                      >
                        Try Again
                      </button>
                    </div>
                  </div>
                ) : chartDataForPlot ? (
                  <div className="w-full h-full min-h-[500px] rounded-xl overflow-hidden">
                    <Plot
                      data={[chartDataForPlot]}
                      layout={{
                        autosize: true,
                        title: {
                          text: `${selectedFields[0] ? availableFields.find((f) => f.id === selectedFields[0])?.label || selectedFields[0] : "Data"} Distribution`,
                          font: {
                            size: 20,
                            color: "#1f2937",
                            family: "Inter, sans-serif",
                            weight: 600,
                          },
                          y: 0.95,
                        },
                        ...(chartType === "pie"
                          ? {
                              showlegend: true,
                              legend: {
                                orientation: "v",
                                x: 1,
                                y: 0.5,
                                font: { size: 12, color: "#4b5563" },
                                bgcolor: "rgba(255,255,255,0.5)",
                                bordercolor: "rgba(0,0,0,0.05)",
                                borderwidth: 1,
                              },
                              margin: { l: 20, r: 20, t: 80, b: 20 },
                            }
                          : {
                              xaxis: {
                                title: selectedFields[0]
                                  ? availableFields.find(
                                      (f) => f.id === selectedFields[0],
                                    )?.label || selectedFields[0]
                                  : "Category",
                                titlefont: {
                                  size: 14,
                                  color: "#4b5563",
                                  weight: 600,
                                },
                                tickfont: { size: 12, color: "#6b7280" },
                                gridcolor: "#f3f4f6",
                                linecolor: "#e5e7eb",
                                zerolinecolor: "#e5e7eb",
                              },
                              yaxis: {
                                title: "Count",
                                titlefont: {
                                  size: 14,
                                  color: "#4b5563",
                                  weight: 600,
                                },
                                tickfont: { size: 12, color: "#6b7280" },
                                gridcolor: "#f3f4f6",
                                linecolor: "#e5e7eb",
                                zerolinecolor: "#e5e7eb",
                              },
                              margin: { l: 60, r: 40, t: 80, b: 60 },
                            }),
                        paper_bgcolor: "white",
                        plot_bgcolor: "white",
                        font: { family: "Inter, sans-serif" },
                        hovermode: "closest",
                      }}
                      config={{
                        displayModeBar: true,
                        displaylogo: false,
                        modeBarButtonsToRemove: [
                          "pan2d",
                          "lasso2d",
                          "select2d",
                        ],
                        responsive: true,
                        toImageButtonOptions: {
                          format: "png",
                          filename: "analytics_chart",
                          height: 600,
                          width: 1000,
                          scale: 2,
                        },
                      }}
                      style={{
                        width: "100%",
                        height: "100%",
                        minHeight: "500px",
                      }}
                      className="w-full h-full"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-64 sm:h-96">
                    <div className="text-center p-8 bg-gray-50/50 rounded-2xl border border-gray-100">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg
                          className="w-8 h-8 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                          />
                        </svg>
                      </div>
                      <h4 className="text-gray-900 font-semibold mb-2">
                        No Data Visualized
                      </h4>
                      <p className="text-gray-500 max-w-xs mx-auto text-sm">
                        Select fields from the left sidebar and apply filters to
                        generate your analytics chart.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Data Table (Conditional) - Takes 3 columns */}
          {chartData.length > 0 && (
            <div className="lg:col-span-2 xl:col-span-3">
              <div className="bg-white rounded-2xl shadow-lg shadow-purple-900/5 p-0 sticky top-6 border border-gray-100 overflow-hidden flex flex-col h-[calc(100vh-6rem)] max-h-[800px]">
                <div className="p-5 border-b border-gray-100 bg-gray-50/30">
                  <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-purple-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 10h18M3 14h18m-9-4v8m-7-4h14M4 6h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V7a1 1 0 011-1z"
                      ></path>
                    </svg>
                    Raw Data
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {chartData.length} total records found
                  </p>
                </div>

                <div className="overflow-y-auto flex-grow custom-scrollbar">
                  <table className="min-w-full divide-y divide-gray-100">
                    <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">
                          Category
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider bg-gray-50">
                          Count
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-50">
                      {chartData.slice(0, 50).map((item, index) => (
                        <tr
                          key={index}
                          className="hover:bg-purple-50/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-gray-700 text-sm font-medium break-words">
                            {typeof item._id === "object"
                              ? JSON.stringify(item._id)
                              : String(item._id || "Unknown")}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900 font-bold text-sm text-right">
                            {item.count || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {chartData.length > 50 && (
                  <div className="p-3 bg-gray-50 border-t border-gray-100 text-center">
                    <p className="text-xs text-gray-500 font-medium">
                      Showing top 50 rows. Export CSV for full data.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
