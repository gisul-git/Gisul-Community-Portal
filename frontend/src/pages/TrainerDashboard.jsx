import React, { useState, useEffect } from "react";
import { uploadResume, getTrainerProfile, updateTrainerProfile, deleteTrainerProfile } from "../api";
import gisulLogo from "../assets/gisul final logo yellow-01 2.webp";
// Make sure you have recharts installed: npm install recharts
import { AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// Mock data for the chart
const chartData = [
  { day: 'Mon', sessions: 2 },
  { day: 'Tue', sessions: 4 },
  { day: 'Wed', sessions: 3 },
  { day: 'Thu', sessions: 6 },
  { day: 'Fri', sessions: 4 },
  { day: 'Sat', sessions: 7 },
  { day: 'Sun', sessions: 2 },
];

export default function TrainerDashboard({ token, onLogout }) {
  const [profile, setProfile] = useState(null);
  const [file, setFile] = useState(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [showProfile, setShowProfile] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  
  // State for temporary input in list fields
  const [tempInput, setTempInput] = useState({ companies: "", clients: "", skills: "", certifications: "" });

  const [editData, setEditData] = useState({
    name: "",
    phone: "",
    location: "",
    experience_years: "",
    current_company: "",
    companies: [],
    clients: [],
    skills: [],
    certifications: []
  });
  const [updating, setUpdating] = useState(false);

  // --- EFFECT: Auto-hide notifications after 5 seconds ---
  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess("");
        setError("");
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  // Handle OAuth token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      const prof = await getTrainerProfile(token);
      setProfile(prof);
      if (prof) {
        setName(prof.name || "");
        setEmail(prof.email || "");
        setEditData({
          name: prof.name || "",
          phone: prof.phone || "",
          location: prof.location || "",
          experience_years: prof.experience_years || "",
          current_company: prof.current_company || "",
          companies: prof.companies || [],
          clients: prof.clients || [],
          skills: prof.skills || [],
          certifications: prof.certifications || []
        });
      }
    } catch (err) {
      console.error("Failed to load profile", err);
      setError("Failed to load profile. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  function startEdit() {
    if (profile) {
      setEditData({
        name: profile.name || "",
        phone: profile.phone || "",
        location: profile.location || "",
        experience_years: profile.experience_years || "",
        current_company: profile.current_company || "",
        companies: profile.companies || [],
        clients: profile.clients || [],
        skills: profile.skills || [],
        certifications: profile.certifications || []
      });
      setIsEditing(true);
      setError("");
      setSuccess("");
    }
  }

  function cancelEdit() {
    setIsEditing(false);
    setError("");
  }

  async function saveProfile() {
    try {
      setUpdating(true);
      setError("");
      setSuccess("");
      
      const updatePayload = {
        name: editData.name.trim() || undefined,
        phone: editData.phone.trim() || undefined,
        location: editData.location.trim() || undefined,
        experience_years: editData.experience_years ? parseFloat(editData.experience_years) : undefined,
        current_company: editData.current_company.trim() || undefined,
        companies: editData.companies.filter(c => c.trim()) || undefined,
        clients: editData.clients.filter(c => c.trim()) || undefined,
        skills: editData.skills.filter(s => s.trim()) || undefined,
        certifications: editData.certifications.filter(c => c.trim()) || undefined
      };
      
      Object.keys(updatePayload).forEach(key => 
        updatePayload[key] === undefined && delete updatePayload[key]
      );
      
      const res = await updateTrainerProfile(token, updatePayload);
      if (res.status === "success") {
        setSuccess("✅ Profile updated successfully!");
        setIsEditing(false);
        await loadProfile();
      } else {
        setError(res.detail || res.message || "Failed to update profile");
      }
    } catch (err) {
      setError(err.message || "Failed to update profile. Please try again.");
    } finally {
      setUpdating(false);
    }
  }

  // List Handlers
  function handleAddChip(field, e) {
    if (e.key === 'Enter' && tempInput[field]?.trim()) {
      e.preventDefault();
      addToListField(field, tempInput[field].trim());
      setTempInput(prev => ({ ...prev, [field]: "" }));
    }
  }

  function addToListField(field, value = "") {
    setEditData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), value]
    }));
  }

  function removeFromListField(field, index) {
    setEditData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index)
    }));
  }

  function updateListField(field, index, value) {
    setEditData(prev => {
      const newList = [...prev[field]];
      newList[index] = value;
      return { ...prev, [field]: newList };
    });
  }

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const validTypes = ['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
      const fileExtension = '.' + droppedFile.name.split('.').pop().toLowerCase();
      if (validTypes.includes(fileExtension)) {
        setFile(droppedFile);
      } else {
        setError("Invalid file type. Please upload PDF, DOC, DOCX, JPG, PNG, or JPEG files.");
      }
    }
  };

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return setError("Please select a file");
    if (!name || !name.trim()) return setError("Please enter your name");
    if (!email || !email.trim()) return setError("Please enter your email");

    setUploading(true);
    setError("");
    setSuccess("");

    try {
      const res = await uploadResume(token, file, name.trim(), email.trim());
      if (res.status === "success") {
        setSuccess("✅ Profile created and resume uploaded successfully!");
        setFile(null);
        if (res.profile) {
          setProfile(res.profile);
          setName(res.profile.name || name.trim());
          setEmail(res.profile.email || email.trim());
        }
        await loadProfile();
        setShowProfile(true); 
      } else {
        setError(res.detail || res.message || "Upload failed");
      }
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteProfile() {
    if (!profile || !profile.email) return;
    const confirmed = window.confirm("Are you sure you want to delete your profile? This cannot be undone.");
    if (!confirmed) return;
    try {
      setError("");
      const res = await deleteTrainerProfile(token);
      if (res.status === "success") {
        setSuccess("✅ Profile deleted.");
        setProfile(null);
        setShowProfile(false);
        setName("");
        setEmail("");
        setFile(null);
        await loadProfile();
      } else {
        setError(res.detail || "Failed to delete profile.");
      }
    } catch (e) {
      setError("Failed to delete profile.");
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans selection:bg-purple-100 pb-20">
      
      {/* --- MAXIMIZED FLOATING NAVBAR --- */}
      {/* Changed 'fixed' to 'sticky', removed 'pointer-events-none', added 'mb-10' for spacing */}
      <div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-10">
        <header 
          className="flex items-center justify-between w-full max-w-5xl bg-white/90 backdrop-blur-xl rounded-full px-5 py-3 shadow-[0_8px_30px_rgb(0,0,0,0.08)] border border-white/40"
        >
          {/* Left: Brand Identity */}
          <div className="flex items-center gap-3 pl-4">
            <img 
              src={gisulLogo} 
              alt="GISUL" 
              className="h-10 w-auto object-contain" 
            />
            <div className="hidden sm:flex flex-col">
              <span className="font-bold text-gray-900 text-lg leading-none tracking-tight">GISUL</span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Trainer Portal</span>
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2 pr-1">
            {profile && profile.email && (
              <button
                onClick={() => setShowProfile(!showProfile)}
                className={`hidden sm:flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all duration-200 ${
                  showProfile 
                    ? "bg-gray-100 text-gray-900 hover:bg-gray-200" 
                    : "bg-[#6953a3] text-white hover:bg-[#58448c] shadow-lg shadow-purple-200"
                }`}
              >
                {showProfile ? "Upload Resume" : "View Dashboard"}
              </button>
            )}
            
            <button
              onClick={onLogout}
              className="group flex items-center gap-2 px-2 sm:px-5 py-2.5 rounded-full bg-[#F4E403] text-black font-bold text-sm hover:brightness-105 transition-all"
              title="Logout"
            >
              <span className="hidden sm:block">Logout</span>
              <div className="bg-black/10 rounded-full p-1 group-hover:bg-black/20 transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
            </button>
          </div>
        </header>
      </div>

      {/* --- Main Content (MAXIMIZED) --- */}
      {/* Changed max-w-7xl to max-w-[95%] for full-width look */}
      {/* Change this in your <main> tag */}
      <main className="max-w-[95%] mx-auto px-4 sm:px-6 lg:px-8 pt-32">
      
        {/* Loading State */}
        {loading && (
           <div className="flex flex-col items-center justify-center min-h-[60vh]">
             <div className="w-16 h-16 border-4 border-purple-200 border-t-[#6953a3] rounded-full animate-spin mb-4"></div>
             <p className="text-gray-500 animate-pulse">Loading Profile...</p>
           </div>
        )}

        {/* Global Notifications */}
        {(success || error) && (
          <div className={`mb-8 p-4 rounded-xl border-l-4 shadow-sm animate-fade-in ${success ? 'bg-green-50 border-green-500 text-green-800' : 'bg-red-50 border-red-500 text-red-800'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${success ? 'bg-green-100' : 'bg-red-100'}`}>
                 {success ? "✓" : "!"}
              </div>
              <div>
                <p className="font-bold">{success ? "Success" : "Action Needed"}</p>
                <p className="text-sm opacity-90">{success || error}</p>
              </div>
            </div>
          </div>
        )}

        {/* --- DASHBOARD VIEW (Bento Grid) --- */}
        {!loading && showProfile && profile && (
          <div className="animate-fade-in">
            
            {/* Action Bar */}
            <div className="flex justify-between items-center mb-8">
              <div>
                 <h1 className="text-3xl font-bold text-gray-800">Trainer Dashboard</h1>
                 <p className="text-gray-500 text-base mt-1">Manage your profile and track activity</p>
              </div>
              <div className="flex gap-3">
                 {!isEditing ? (
                   <>
                    <button onClick={startEdit} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-[#6953a3] hover:text-[#6953a3] transition shadow-sm font-medium">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      Edit Profile
                    </button>
                    <button onClick={handleDeleteProfile} className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition" title="Delete Profile">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                   </>
                 ) : (
                   <>
                    <button onClick={saveProfile} disabled={updating} className="px-6 py-2.5 bg-[#6953a3] text-white rounded-xl hover:bg-[#58448c] shadow-md transition disabled:opacity-50 font-medium">
                      {updating ? "Saving..." : "Save Changes"}
                    </button>
                    <button onClick={cancelEdit} disabled={updating} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition font-medium">Cancel</button>
                   </>
                 )}
              </div>
            </div>

            {/* Changed gap to gap-8 for more spacious look */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* --- LEFT COLUMN: Identity Card (Sticky) --- */}
              {/* Changed colspan to 3/12 (25%) instead of 4/12 (33%) for better maximized balance */}
              <div className="lg:col-span-4 xl:col-span-3 space-y-8">
                <div className="bg-white rounded-3xl shadow-[0_10px_40px_-10px_rgba(105,83,163,0.1)] p-8 border border-gray-100 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-28 bg-gradient-to-r from-[#6953a3] to-[#8b7bb8]"></div>
                  
                  <div className="relative mt-14 flex flex-col items-center">
                    <div className="w-28 h-28 rounded-full bg-white p-1.5 shadow-xl">
                      <div className="w-full h-full rounded-full bg-gray-100 flex items-center justify-center text-3xl font-bold text-[#6953a3]">
                        {profile.name ? profile.name.charAt(0).toUpperCase() : "U"}
                      </div>
                    </div>
                    
                    {isEditing ? (
                       <input 
                        type="text" 
                        value={editData.name} 
                        onChange={(e) => setEditData({...editData, name: e.target.value})}
                        className="mt-6 text-center text-xl font-bold border-b-2 border-purple-200 focus:border-[#6953a3] outline-none bg-transparent"
                       />
                    ) : (
                      <h2 className="mt-6 text-2xl font-bold text-gray-800">{profile.name || "Trainer"}</h2>
                    )}
                    
                    <p className="text-base text-gray-500 mb-8">{isEditing ? "Trainer" : profile.current_company || "Professional Trainer"}</p>
                    
                    {/* Contact Info Grid */}
                    <div className="w-full space-y-4">
                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                        <div className="w-10 h-10 rounded-xl bg-[#6953a3]/10 flex items-center justify-center text-[#6953a3]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Email</p>
                          <p className="text-sm font-medium text-gray-900 truncate" title={profile.email}>{profile.email}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                        <div className="w-10 h-10 rounded-xl bg-[#6953a3]/10 flex items-center justify-center text-[#6953a3]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Phone</p>
                          {isEditing ? (
                            <input 
                              className="w-full bg-transparent border-b border-gray-300 focus:border-[#6953a3] outline-none text-sm font-medium text-gray-900"
                              value={editData.phone}
                              onChange={(e) => setEditData({...editData, phone: e.target.value})}
                              placeholder="+1 234..."
                            />
                          ) : (
                            <p className="text-sm font-medium text-gray-900">{profile.phone || "Not set"}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                        <div className="w-10 h-10 rounded-xl bg-[#6953a3]/10 flex items-center justify-center text-[#6953a3]">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Location</p>
                          {isEditing ? (
                            <input 
                              className="w-full bg-transparent border-b border-gray-300 focus:border-[#6953a3] outline-none text-sm font-medium text-gray-900"
                              value={editData.location}
                              onChange={(e) => setEditData({...editData, location: e.target.value})}
                              placeholder="City, Country"
                            />
                          ) : (
                            <p className="text-sm font-medium text-gray-900">{profile.location || "Remote"}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Experience Summary Card */}
                <div className="bg-white rounded-3xl shadow-sm p-8 border border-gray-100">
                    <h3 className="font-bold text-gray-800 mb-6 text-lg">Professional Status</h3>
                    <div className="space-y-6">
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Experience</p>
                            {isEditing ? (
                                <input type="number" step="0.5" className="font-bold text-xl text-gray-900 border-b border-gray-300 focus:border-[#6953a3] outline-none w-24" value={editData.experience_years} onChange={(e) => setEditData({...editData, experience_years: e.target.value})} />
                            ) : (
                                <p className="font-bold text-xl text-gray-900">{profile.experience_years || 0} Years</p>
                            )}
                        </div>
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-2">Current Role</p>
                            {isEditing ? (
                                <input className="font-bold text-xl text-gray-900 border-b border-gray-300 focus:border-[#6953a3] outline-none w-full" value={editData.current_company} onChange={(e) => setEditData({...editData, current_company: e.target.value})} placeholder="Company Name" />
                            ) : (
                                <p className="font-bold text-xl text-gray-900">{profile.current_company || "Freelance"}</p>
                            )}
                        </div>
                    </div>
                </div>
              </div>

              {/* --- RIGHT COLUMN: Main Content --- */}
              {/* Changed colspan to 9/12 (75%) for maximized view */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-8">
                
               

  {/* 2. UPCOMING SESSIONS BOX */}
  <div className="xl:col-span-1 bg-white rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] p-8 border border-gray-100 h-[450px] flex flex-col">
    <div className="flex justify-between items-center mb-6">
      <h3 className="font-bold text-xl text-gray-800">Upcoming</h3>
      <button className="text-xs font-bold text-[#6953a3] bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition">View All</button>
    </div>
    
    <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar">
      {[
        { id: 1, title: "React Performance", time: "10:00 AM", type: "Webinar", date: "Today" },
        { id: 2, title: "Next.js 15 Deep Dive", time: "02:30 PM", type: "Live Class", date: "Today" },
        { id: 3, title: "System Design 101", time: "11:00 AM", type: "Workshop", date: "Tomorrow" },
        { id: 4, title: "Framer Motion Pro", time: "09:00 AM", type: "Live Class", date: "Feb 06" },
      ].map((session) => (
        <div key={session.id} className="group p-4 rounded-2xl bg-gray-50 border border-transparent hover:border-purple-100 hover:bg-white transition-all duration-300">
          <div className="flex justify-between items-start mb-2">
            <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded ${session.date === 'Today' ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-200 text-gray-500'}`}>
              {session.date}
            </span>
            <span className="text-xs font-bold text-gray-400">{session.time}</span>
          </div>
          <h4 className="font-bold text-gray-800 text-sm mb-3 group-hover:text-[#6953a3]">{session.title}</h4>
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 font-medium">{session.type}</span>
            <button className="text-[10px] font-bold text-[#6953a3] opacity-0 group-hover:opacity-100 transition-opacity">Launch →</button>
          </div>
        </div>
      ))}
    </div>
  </div>

   {/* 1. CHART SECTION (Expanded) */}
  <div className="xl:col-span-2 bg-white rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.05)] p-8 border border-gray-100 h-[450px] flex flex-col">
    <div className="flex justify-between items-center mb-6">
      <h3 className="font-bold text-xl text-gray-800">Weekly Activity</h3>
      <select className="bg-gray-50 text-sm font-medium border-none rounded-xl px-4 py-2 outline-none text-gray-600 cursor-pointer hover:bg-gray-100 transition">
        <option>This Week</option>
        <option>Last Month</option>
      </select>
    </div>
    <div className="flex-1 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="colorSessions" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#6953a3" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#6953a3" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fill: '#9CA3AF', fontSize: 13}} dy={15} />
          <Tooltip 
            contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)', padding: '12px 20px'}} 
            cursor={{stroke: '#6953a3', strokeWidth: 2, strokeDasharray: '5 5'}}
          />
          <Area type="monotone" dataKey="sessions" stroke="#6953a3" strokeWidth={4} fillOpacity={1} fill="url(#colorSessions)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  </div>

                {/* 2. SKILLS & CERTIFICATIONS */}
                <div className="bg-white rounded-3xl shadow-sm p-8 border border-gray-100">
                  <h3 className="font-bold text-xl text-gray-800 mb-6">Skills & Certifications</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    {/* Skills Column */}
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Skills</h4>
                      <div className="flex flex-wrap gap-3">
                        {isEditing ? (
                          <>
                             {editData.skills.map((skill, idx) => (
                               <span key={idx} className="bg-purple-100 text-[#6953a3] px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                                 {skill}
                                 <button onClick={() => removeFromListField('skills', idx)} className="hover:text-red-500 text-lg leading-none">×</button>
                               </span>
                             ))}
                             <input 
                               type="text" 
                               value={tempInput.skills}
                               onChange={(e) => setTempInput({...tempInput, skills: e.target.value})}
                               onKeyDown={(e) => handleAddChip('skills', e)}
                               placeholder="+ Add skill..."
                               className="bg-gray-50 border border-transparent focus:border-purple-300 rounded-xl px-4 py-2 text-sm font-medium outline-none w-40 transition-all"
                             />
                          </>
                        ) : (
                          profile.skills && profile.skills.map((skill, idx) => (
                            <span key={idx} className="bg-purple-50 text-[#6953a3] px-4 py-2 rounded-xl text-sm font-bold border border-purple-100">
                              {skill}
                            </span>
                          ))
                        )}
                        {!isEditing && (!profile.skills || profile.skills.length === 0) && <p className="text-sm text-gray-400 italic">No skills listed</p>}
                      </div>
                    </div>

                    {/* Certs Column */}
                    <div>
                      <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Certifications</h4>
                      <div className="flex flex-wrap gap-3">
                         {isEditing ? (
                           <>
                             {editData.certifications.map((cert, idx) => (
                               <span key={idx} className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
                                 {cert}
                                 <button onClick={() => removeFromListField('certifications', idx)} className="hover:text-red-500 text-lg leading-none">×</button>
                               </span>
                             ))}
                             <input 
                               type="text" 
                               value={tempInput.certifications}
                               onChange={(e) => setTempInput({...tempInput, certifications: e.target.value})}
                               onKeyDown={(e) => handleAddChip('certifications', e)}
                               placeholder="+ Add cert..."
                               className="bg-gray-50 border border-transparent focus:border-yellow-300 rounded-xl px-4 py-2 text-sm font-medium outline-none w-40 transition-all"
                             />
                           </>
                         ) : (
                            profile.certifications && profile.certifications.map((cert, idx) => (
                              <span key={idx} className="bg-[#fffde7] text-yellow-700 border border-yellow-200 px-4 py-2 rounded-xl text-sm font-bold">
                                {cert}
                              </span>
                            ))
                         )}
                         {!isEditing && (!profile.certifications || profile.certifications.length === 0) && <p className="text-sm text-gray-400 italic">No certifications listed</p>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. HISTORY */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Companies */}
                  <div className="bg-white rounded-3xl shadow-sm p-8 border border-gray-100">
                    <h3 className="font-bold text-xl text-gray-800 mb-6">Work History</h3>
                    <ul className="space-y-4">
                      {isEditing ? (
                        <>
                          {editData.companies.map((co, idx) => (
                            <li key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                              <span>{co}</span>
                              <button onClick={() => removeFromListField('companies', idx)} className="text-red-400 hover:text-red-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </li>
                          ))}
                          <li className="flex gap-3">
                            <input 
                              className="flex-1 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                              placeholder="Add Company"
                              value={tempInput.companies}
                              onChange={(e) => setTempInput({...tempInput, companies: e.target.value})}
                              onKeyDown={(e) => handleAddChip('companies', e)}
                            />
                          </li>
                        </>
                      ) : (
                         profile.companies && profile.companies.map((co, idx) => (
                           <li key={idx} className="flex items-center gap-4 text-gray-700 font-medium">
                             <span className="w-2.5 h-2.5 rounded-full bg-[#6953a3]"></span>
                             {co}
                           </li>
                         ))
                      )}
                    </ul>
                  </div>

                  {/* Clients */}
                  <div className="bg-white rounded-3xl shadow-sm p-8 border border-gray-100">
                    <h3 className="font-bold text-xl text-gray-800 mb-6">Key Clients</h3>
                     <ul className="space-y-4">
                      {isEditing ? (
                        <>
                          {editData.clients.map((cl, idx) => (
                            <li key={idx} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl">
                              <span>{cl}</span>
                              <button onClick={() => removeFromListField('clients', idx)} className="text-red-400 hover:text-red-600">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </li>
                          ))}
                          <li className="flex gap-3">
                            <input 
                              className="flex-1 border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-purple-200 outline-none"
                              placeholder="Add Client"
                              value={tempInput.clients}
                              onChange={(e) => setTempInput({...tempInput, clients: e.target.value})}
                              onKeyDown={(e) => handleAddChip('clients', e)}
                            />
                          </li>
                        </>
                      ) : (
                         profile.clients && profile.clients.map((cl, idx) => (
                           <li key={idx} className="flex items-center gap-4 text-gray-700 font-medium">
                             <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                               {cl.charAt(0)}
                             </div>
                             {cl}
                           </li>
                         ))
                      )}
                    </ul>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}

        {/* --- UPLOAD VIEW (Gateway) --- */}
        {!loading && !showProfile && (
           <div className="max-w-2xl mx-auto mt-10">
              <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-purple-50">
                 {/* Decorative Header */}
                 <div className="h-2 bg-gradient-to-r from-[#6953a3] via-purple-400 to-[#F4E403]"></div>
                 
                 <div className="p-8 sm:p-12">
                   <div className="text-center mb-10">
                     <div className="w-20 h-20 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-[#6953a3] shadow-inner">
                       <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                     </div>
                     <h2 className="text-3xl font-bold text-gray-900 mb-2">Upload Resume</h2>
                     <p className="text-gray-500">Let our AI extract your profile details automatically.</p>
                   </div>

                   <form onSubmit={handleUpload} className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative group">
                          <input 
                            type="text" 
                            required 
                            disabled={uploading} 
                            value={name} 
                            onChange={(e) => setName(e.target.value)} 
                            className="peer w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-[#6953a3] outline-none transition-all placeholder-transparent" 
                            placeholder="Name" 
                            id="inputName" 
                          />
                          <label htmlFor="inputName" className="absolute left-4 -top-2.5 bg-white px-1 text-xs text-gray-400 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-[#6953a3] peer-focus:bg-white pointer-events-none">Full Name</label>
                        </div>
                        
                        <div className="relative group">
                           <input 
                            type="email" 
                            required 
                            disabled={uploading} 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)} 
                            className="peer w-full px-4 py-3 rounded-xl border-2 border-gray-100 bg-gray-50 focus:bg-white focus:border-[#6953a3] outline-none transition-all placeholder-transparent" 
                            placeholder="Email" 
                            id="inputEmail" 
                          />
                          <label htmlFor="inputEmail" className="absolute left-4 -top-2.5 bg-white px-1 text-xs text-gray-400 transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:bg-transparent peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-[#6953a3] peer-focus:bg-white pointer-events-none">Email Address</label>
                        </div>
                      </div>

                      {/* Modern Drop Zone */}
                      <div 
                        onDragEnter={handleDrag} 
                        onDragLeave={handleDrag} 
                        onDragOver={handleDrag} 
                        onDrop={handleDrop} 
                        className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer group ${
                          dragActive 
                            ? "border-[#6953a3] bg-purple-50" 
                            : file 
                              ? "border-green-400 bg-green-50" 
                              : "border-gray-200 hover:border-[#6953a3] hover:bg-gray-50"
                        }`}
                      >
                         <input 
                           type="file" 
                           className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                           onChange={(e) => setFile(e.target.files[0])} 
                           disabled={uploading} 
                           accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                         />
                         
                         {file ? (
                           <div className="flex flex-col items-center animate-fade-in">
                             <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-3">
                               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                             </div>
                             <p className="font-semibold text-gray-800">{file.name}</p>
                             <p className="text-xs text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                             <p className="text-xs text-red-400 mt-4 hover:underline z-10 relative" onClick={(e) => {
                               e.stopPropagation();
                               e.preventDefault();
                               setFile(null);
                             }}>Remove file</p>
                           </div>
                         ) : (
                           <div className="flex flex-col items-center">
                             <div className="mb-4 p-3 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                               <svg className="w-8 h-8 text-[#6953a3]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                             </div>
                             <p className="text-gray-700 font-medium">Click to upload or drag and drop</p>
                             <p className="text-xs text-gray-400 mt-2">PDF, DOCX, JPG or PNG (Max 5MB)</p>
                           </div>
                         )}
                      </div>

                      <button 
                        type="submit" 
                        disabled={uploading || !file || !name || !email} 
                        className="w-full py-4 bg-[#6953a3] hover:bg-[#58448c] text-white font-bold rounded-xl shadow-lg shadow-purple-200 transition-all disabled:opacity-50 disabled:shadow-none transform active:scale-95 flex items-center justify-center gap-2"
                      >
                         {uploading && <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                         {uploading ? "Analyzing Resume..." : "Create Profile"}
                      </button>
                   </form>
                 </div>
              </div>
           </div>
        )}
      </main>

      <style>{`
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}