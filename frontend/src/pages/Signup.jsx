import React, { useState } from "react";
import { trainerSignup, customerSignup, API_BASE } from "../api";
import gisulLogo from "../assets/gisul purple.webp";
import authImage from "../assets/loginGraphics.png";

export default function Signup({ onSignupSuccess }) {
  // --- STATE VARIABLES (Untouched) ---
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [userType, setUserType] = useState(""); // "trainer" or "client"
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  // Track touched states for styling feedback (Optional addition for better UX matching Login)
  const [nameTouched, setNameTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);

  // --- LOGIC (Untouched) ---
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!userType) {
      setError("Please select 'Trainer' or 'Client' to proceed.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    if (password.length > 72) {
      setError("Password must be less than 72 characters");
      return;
    }

    setLoading(true);
    try {
      if (userType === "trainer") {
        const res = await trainerSignup(name, email, password);
        if (res.status === "Trainer registered successfully" || res.message === "Trainer registered successfully") {
          setSuccess(true);
          setTimeout(() => {
            onSignupSuccess();
          }, 2000);
        } else {
          setError(res.detail || "Signup failed");
          setLoading(false);
        }
      } else if (userType === "client") {
        const res = await customerSignup(name, email, password, companyName);
        if (res.status === "Customer registered successfully" || res.message === "Customer registered successfully") {
          setSuccess(true);
          setTimeout(() => {
            onSignupSuccess();
          }, 2000);
        } else {
          setError(res.detail || "Signup failed");
          setLoading(false);
        }
      }
    } catch (err) {
      setError(err.message || "Signup failed. Please try again.");
      setLoading(false);
    }
  }

  // --- SUCCESS VIEW (Styled to match new theme) ---
  if (success) {
    return (
      <div 
        data-auth-page 
        className="fixed inset-0 w-full h-screen overflow-hidden flex items-center justify-center bg-[#f8f9fa] font-sans"
      >
        {/* Reuse Background Effects for consistency */}
        <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-purple-200/40 blur-[120px] animate-pulse pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-200/40 blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-[20%] right-[30%] w-[30%] h-[30%] rounded-full bg-yellow-100/50 blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '4s' }}></div>

        <div className="absolute top-6 left-6 z-20">
          <img src={gisulLogo} alt="Logo" className="h-12 w-auto" />
        </div>

        <div className="relative z-10 bg-white/90 backdrop-blur-xl border border-white/60 p-8 md:p-12 rounded-3xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] flex flex-col items-center justify-center max-w-lg w-full text-center">
            {/* Top Accent */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#6953a3] via-purple-400 to-[#F4E403]"></div>
            
            <div className="mb-6 relative">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg animate-scale-in">
                <svg className="w-10 h-10 text-white animate-checkmark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="absolute inset-0 rounded-full bg-green-400 animate-ripple"></div>
            </div>

            <h2 className="text-3xl font-black text-slate-800 mb-2">Signup Successful!</h2>
            <p className="text-slate-500 font-medium">Your account has been created. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      data-auth-page 
      className="fixed inset-0 w-full h-screen overflow-hidden flex items-center justify-center bg-[#f8f9fa] font-sans"
    >
      <div className="absolute top-6 left-6 z-20">
        <img src={gisulLogo} alt="Logo" className="h-12 w-auto" />
      </div>

      {/* --- BACKGROUND EFFECTS --- */}
      {/* 1. Purple Orb */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-purple-200/40 blur-[120px] animate-pulse pointer-events-none"></div>
      {/* 2. Indigo Orb */}
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-200/40 blur-[120px] animate-pulse pointer-events-none" style={{ animationDelay: '2s' }}></div>
      {/* 3. Amber/Yellow Orb */}
      <div className="absolute top-[20%] right-[30%] w-[30%] h-[30%] rounded-full bg-yellow-100/50 blur-[100px] animate-pulse pointer-events-none" style={{ animationDelay: '4s' }}></div>

      <div className="container relative z-10 flex w-full max-w-7xl h-full items-center justify-center lg:justify-between px-6 lg:gap-16">
        
        {/* --- LEFT SIDE: VISUALS --- */}
        <div className="hidden lg:flex flex-col w-1/2 justify-center space-y-8 h-full">
          <div className="space-y-4">
           <h2 className="flex flex-col items-start pr-4">
  {/* Line 1: Heavy, Industrial, Uppercase */}
  <span className="text-5xl md:text-5xl font-black text-slate-900 tracking-tighter uppercase leading-[0.85]">
    JOIN
  </span>

  {/* Line 2: Elegant, Serif, Italic, Lighter Color */}
  {/* Using 'font-serif' creates the class contrast. Lowercase looks more 'high-fashion'. */}
  <span className="text-6xl md:text-7xl font-serif italic font-light text-slate-400 -mt-2 md:-mt-4 ml-1 md:ml-2 leading-none">
    the community.
  </span>
</h2>
            <p className="text-lg text-slate-500 max-w-md leading-relaxed font-medium">
              Start your journey today. Create an account to connect with Trainers and Clients in one unified ecosystem.
            </p>
          </div>

          <div className="relative w-full max-w-lg max-h-[50vh] flex items-center justify-center">
             {/* Yellowish Glow behind image */}
             <div className="absolute -inset-4 bg-gradient-to-tr from-purple-500/20 via-transparent to-amber-400/20 rounded-full blur-2xl"></div>
             <img 
               src={authImage} 
               alt="Portal Auth" 
               className="relative w-full h-full object-contain drop-shadow-2xl animate-float"
             />
          </div>
        </div>

        {/* --- RIGHT SIDE: SIGNUP FORM BOX --- */}
        <div className="w-full max-w-[440px] flex flex-col justify-center h-full py-6">
          <div className="bg-white/90 backdrop-blur-xl border border-white/60 p-6 rounded-3xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] flex flex-col justify-center relative overflow-hidden max-h-full overflow-y-auto custom-scrollbar">
  
  {/* Subtle top accent line */}
  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#6953a3] via-purple-400 to-[#F4E403]"></div>

  <div className="mb-4">
    <h1 className="text-xl font-bold text-slate-900">Create Account</h1>
    <p className="text-slate-500 mt-0.5 text-xs font-medium">Join us as a Professional or Client.</p>
  </div>

  {/* Error Message */}
  {error && (
    <div className="mb-4 p-2.5 bg-red-50 text-red-600 text-[11px] font-bold rounded-lg animate-shake border border-red-100 flex items-center gap-2">
      <span className="w-1 h-3 bg-red-500 rounded-full"></span>
      {error}
    </div>
  )}

  {/* Role Selection - Compact */}
  <div className="grid grid-cols-2 gap-2 mb-4">
    {[
      { id: 'trainer', label: 'Trainer' },
      { id: 'client', label: 'Client'}
    ].map((role) => (
      <button
        key={role.id}
        onClick={() => { setUserType(role.id); setError(""); }}
        type="button"
        className={`relative flex items-center justify-center gap-2 py-2 px-3 rounded-lg transition-all duration-200 border ${
          userType === role.id 
          ? "bg-white border-purple-200 shadow-sm translate-y-[-1px]" 
          : "bg-slate-50 border-transparent hover:bg-slate-100 text-slate-400"
        }`}
      >
        {/* Active Indicator Dot */}
        {userType === role.id && <span className="absolute top-1.5 right-1.5 w-1 h-1 rounded-full bg-amber-400 animate-pulse"></span>}
        
        <span className={`text-[10px] font-bold uppercase tracking-wider ${userType === role.id ? "text-slate-800" : "text-slate-400"}`}>
          {role.label}
        </span>
      </button>
    ))}
  </div>

  <form onSubmit={handleSubmit} className="space-y-3">
    
    {/* Full Name */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Full Name</label>
      <div className="relative group">
        <input
          type="text"
          required
          placeholder="John Doe"
          className={`w-full px-3 py-2.5 rounded-lg bg-slate-50 border transition-all text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
              nameTouched && !name
              ? "border-red-300 focus:border-red-500 focus:bg-white" 
              : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white"
          }`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setNameTouched(true)}
        />
      </div>
    </div>

    {/* Email */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Email Address</label>
      <div className="relative group">
        <input
          type="email"
          required
          placeholder="name@gisul.com"
          className={`w-full px-3 py-2.5 rounded-lg bg-slate-50 border transition-all text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
              emailTouched && !email
              ? "border-red-300 focus:border-red-500 focus:bg-white" 
              : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white"
          }`}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
        />
      </div>
    </div>

    {/* Company Name (Conditional) */}
    {userType === "client" && (
      <div className="space-y-1 animate-fade-in">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
          Company <span className="text-slate-300 text-[9px] lowercase tracking-normal">(optional)</span>
        </label>
        <div className="relative group">
          <input
            type="text"
            placeholder="Your Company Ltd."
            className="w-full px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200 transition-all text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
      </div>
    )}

    {/* Password */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Password</label>
      <div className="relative group">
        <input
          type={showPassword ? "text" : "password"}
          required
          placeholder="Create a password"
          className={`w-full px-3 py-2.5 rounded-lg bg-slate-50 border transition-all text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
              passwordTouched && !password
              ? "border-red-300 focus:border-red-500 focus:bg-white"
              : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white"
          }`}
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(""); }}
          onBlur={() => setPasswordTouched(true)}
        />
        <button 
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-bold uppercase"
        >
          {showPassword ? "Hide" : "Show"}
        </button>
      </div>
    </div>

    {/* Confirm Password */}
    <div className="space-y-1">
      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Confirm Password</label>
      <div className="relative group">
        <input
          type={showConfirmPassword ? "text" : "password"}
          required
          placeholder="Confirm password"
          className={`w-full px-3 py-2.5 rounded-lg bg-slate-50 border transition-all text-sm font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
              confirmPasswordTouched && (!confirmPassword || confirmPassword !== password)
              ? "border-red-300 focus:border-red-500 focus:bg-white"
              : "border-slate-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 focus:bg-white"
          }`}
          value={confirmPassword}
          onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
          onBlur={() => setConfirmPasswordTouched(true)}
        />
          <button 
          type="button"
          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors text-[10px] font-bold uppercase"
        >
          {showConfirmPassword ? "Hide" : "Show"}
        </button>
      </div>
    </div>

    <button
      type="submit"
      disabled={loading}
      className="w-full py-3 bg-purple-900 hover:bg-purple-800 text-white rounded-lg font-bold text-xs uppercase tracking-wide shadow-lg shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2"
    >
      {loading ? "Creating Account..." : "Sign Up"}
    </button>
  </form>

  <div className="relative my-4">
    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
    <div className="relative flex justify-center text-[9px] uppercase tracking-widest font-bold text-slate-400"><span className="bg-[#fffcfc] px-2">Already a member?</span></div>
  </div>

  <p className="text-center text-slate-400 text-[11px]">
    <button onClick={onSignupSuccess} className="text-amber-600 font-bold hover:underline hover:text-amber-700 transition-colors">Log In here</button>
  </p>
</div>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-15px); }
        }
        .animate-float { animation: float 6s ease-in-out infinite; }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 0s 2; }
        .animate-fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
        
        @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
        .animate-scale-in { animation: scaleIn 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55); }
        
        @keyframes checkmark { 0% { stroke-dashoffset: 100; } 100% { stroke-dashoffset: 0; } }
        .animate-checkmark { animation: checkmark 0.6s ease-out 0.3s both; stroke-dasharray: 100; stroke-dashoffset: 100; }
        
        @keyframes ripple { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.5); opacity: 0; } }
        .animate-ripple { animation: ripple 2s ease-out infinite; }

        input[type="password"]::-webkit-textfield-decoration-container,
        input[type="password"]::-webkit-credentials-auto-fill-button { display: none !important; }
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear { display: none !important; }

        /* Custom Scrollbar for form container if it gets too tall on small screens */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
}