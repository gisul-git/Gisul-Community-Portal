import React, { useState } from "react";
import { adminLogin, trainerLogin, customerLogin, API_BASE } from "../api";
import gisulLogo from "../assets/gisul purple.webp";
import authImage from "../assets/loginGraphics.png";
import { motion } from "framer-motion";
import { Sparkles, Hexagon } from "lucide-react";

export default function Login({ onLogin, onSwitchToSignup }){
  // --- STATE VARIABLES (Untouched) ---
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  // --- LOGIC (Untouched) ---
  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (!userType) {
        const adminRes = await adminLogin(email, password);
        if (adminRes.access_token) {
          onLogin(adminRes.access_token, "admin");
          return;
        } else {
          setError(
            "Please select 'Trainer' or 'Client'. Admin credentials not recognized.",
          );
          setLoading(false);
          return;
        }
      }

      if (userType === "trainer") {
        const res = await trainerLogin(email, password);
        if (res.access_token) {
          onLogin(res.access_token, "trainer");
        } else {
          setError(res.detail || "Login failed");
          setLoading(false);
        }
      } else if (userType === "client") {
        const res = await customerLogin(email, password);
        if (res.access_token) {
          onLogin(res.access_token, "customer");
        } else {
          setError(res.detail || "Login failed");
          setLoading(false);
        }
      }
    } catch (err) {
      console.log(err);
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div
      data-auth-page
      // CHANGED: overflow-hidden -> overflow-y-auto lg:overflow-hidden (Allows scrolling on mobile)
      className="fixed inset-0 w-full h-screen overflow-y-auto lg:overflow-hidden flex items-center justify-center bg-[#f8f9fa] font-sans"
    >
      <div className="absolute top-6 left-6 z-20">
        <img src={gisulLogo} alt="Logo" className="h-10 lg:h-12 w-auto" />
      </div>
      {/* --- BACKGROUND EFFECTS (Added Yellow Hints) --- */}
      {/* 1. Purple Orb */}
      <div className="absolute top-[-10%] left-[-10%] w-[45%] h-[45%] rounded-full bg-purple-200/40 blur-[120px] animate-pulse pointer-events-none"></div>
      {/* 2. Indigo Orb */}
      <div
        className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] rounded-full bg-indigo-200/40 blur-[120px] animate-pulse pointer-events-none"
        style={{ animationDelay: "2s" }}
      ></div>
      {/* 3. NEW: Amber/Yellow Orb (Center-ish for warmth) */}
      <div
        className="absolute top-[20%] right-[30%] w-[30%] h-[30%] rounded-full bg-yellow-100/50 blur-[100px] animate-pulse pointer-events-none"
        style={{ animationDelay: "4s" }}
      ></div>

      {/* CHANGED: h-full -> min-h-screen lg:h-full (Prevents crushing on mobile) */}
      <div className="container relative z-10 flex flex-col lg:flex-row w-full max-w-7xl min-h-screen lg:h-full items-center justify-center lg:justify-between px-4 lg:px-6 gap-6 lg:gap-16 py-10 lg:py-0">
        {/* --- LEFT SIDE: VISUALS --- */}
        {/* --- LEFT SIDE: VISUALS --- */}
        {/* --- LEFT SIDE: VISUALS (Welcome Back) --- */}
        <div className="hidden lg:flex flex-col w-1/2 justify-center items-center h-full relative z-20">
          
          {/* Title Container */}
          <div className="w-full flex flex-col items-center justify-center relative mb-8">
            
            {/* Animated Hexagon Icon */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: "backOut" }}
              className="relative mb-6 group"
            >
              
            </motion.div>

            {/* Typography: Welcome Back */}
            <div className="relative text-center">
              <motion.h1 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="flex flex-col items-center leading-tight"
              >
                {/* 'Welcome' Gradient Text */}
                <span className="relative inline-block text-6xl md:text-7xl font-black tracking-tighter">
                  <span className="bg-clip-text text-transparent bg-gradient-to-r from-slate-900 via-indigo-600 to-slate-900 bg-[length:200%_auto] animate-gradient-flow pb-2">
                    Welcome
                  </span>
                  <Sparkles className="absolute top-0 -right-8 w-6 h-6 text-indigo-400 animate-pulse" />
                </span>
                
                {/* 'Back' Text */}
                <span className="text-5xl md:text-6xl text-slate-800 font-bold tracking-tight">
                  Back
                </span>
              </motion.h1>

              {/* Tagline */}
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6, duration: 0.8 }}
                className="mt-5 text-sm font-bold tracking-[0.2em] uppercase text-slate-400"
              >
                Sign in to Continue
              </motion.p>
            </div>
            
            {/* Decorative Underline */}
            <motion.div 
               initial={{ width: 0, opacity: 0 }}
               animate={{ width: "60px", opacity: 1 }}
               transition={{ delay: 0.8, duration: 1 }}
               className="h-1 bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full mt-6"
            />
          </div>

          {/* Graphic/Image Section */}
          <div className="relative w-full max-w-lg max-h-[45vh] flex items-center justify-center">
            <div className="absolute -inset-4 bg-gradient-to-tr from-purple-500/20 via-transparent to-amber-400/20 rounded-full blur-2xl"></div>
            <img
              src={authImage}
              alt="Portal Auth"
              style={{ mixBlendMode: "multiply" }}
              className="relative w-full h-full object-contain drop-shadow-2xl animate-float"
            />
          </div>
        </div>

        {/* --- RIGHT SIDE: PROFESSIONAL LOGIN BOX --- */}
        {/* CHANGED: Adjusted sizing and padding for mobile */}
        <div className="w-full max-w-[440px] flex flex-col justify-center h-auto lg:h-full py-6 lg:py-6">
          {/* Changed rounded-3xl for a more professional look, added amber border top */}
          {/* CHANGED: p-8 md:p-10 -> p-6 sm:p-8 md:p-10 (Smaller padding on mobile) */}
          <div className="bg-white/90 backdrop-blur-xl border border-white/60 p-6 sm:p-8 md:p-10 rounded-3xl shadow-[0_8px_40px_-12px_rgba(0,0,0,0.1)] flex flex-col justify-center relative overflow-hidden w-full">
            {/* Subtle top accent line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#6953a3] via-purple-400 to-[#F4E403]"></div>

            <div className="mb-6 lg:mb-8">
              <h1 className="text-xl lg:text-2xl font-bold text-slate-900">
                Portal Access
              </h1>
              <p className="text-slate-500 mt-1 text-sm font-medium">
                Authentication required to proceed.
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="mb-5 p-3 bg-red-50 text-red-600 text-xs font-bold rounded-lg animate-shake border border-red-100 flex items-center gap-3">
                <span className="w-1 h-4 bg-red-500 rounded-full"></span>
                {error}
              </div>
            )}

            {/* Role Selection - Professional Style */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {[
                { id: "trainer", label: "Trainer" },
                { id: "client", label: "Client" },
              ].map((role) => (
                <button
                  key={role.id}
                  onClick={() => {
                    setUserType(role.id);
                    setError("");
                  }}
                  type="button"
                  // Logic: If active, white background + shadow + colored text. If inactive, gray background.
                  className={`relative flex items-center justify-center gap-3 py-3 px-4 rounded-xl transition-all duration-200 border ${
                    userType === role.id
                      ? "bg-white border-purple-200 shadow-md translate-y-[-2px]"
                      : "bg-slate-50 border-transparent hover:bg-slate-100 text-slate-400"
                  }`}
                >
                  {/* Active Indicator Dot (Yellow/Amber) */}
                  {userType === role.id && (
                    <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  )}

                  <span className="text-lg">{role.icon}</span>
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${userType === role.id ? "text-slate-800" : "text-slate-400"}`}
                  >
                    {role.label}
                  </span>
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 lg:space-y-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Email Address
                </label>
                <div className="relative group">
                  <input
                    type="email"
                    required
                    placeholder="name@gisul.com"
                    className={`w-full px-4 py-3.5 rounded-xl bg-slate-50 border transition-all font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
                      emailTouched && !email
                        ? "border-red-300 focus:border-red-500 focus:bg-white"
                        : "border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white"
                    }`}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    onBlur={() => setEmailTouched(true)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Password
                </label>
                <div className="relative group">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••••••"
                    className={`w-full px-4 py-3.5 rounded-xl bg-slate-50 border transition-all font-medium text-slate-700 placeholder:text-slate-300 outline-none ${
                      passwordTouched && !password
                        ? "border-red-300 focus:border-red-500 focus:bg-white"
                        : "border-slate-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 focus:bg-white"
                    }`}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setError("");
                    }}
                    onBlur={() => setPasswordTouched(true)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-600 transition-colors text-xs font-bold uppercase"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-purple-900 hover:bg-purple-800 text-white rounded-xl font-bold text-sm uppercase tracking-wide shadow-lg shadow-slate-200 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed mt-2"
              >
                {loading ? "Verifying Credentials..." : "Login"}
              </button>
            </form>

            <div className="relative my-6 lg:my-8">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-400">
                <span className="bg-[#fffcfc] px-3">Alternative Access</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() =>
                  userType &&
                  (window.location.href = `${API_BASE}/api/auth/google/login/${userType === "trainer" ? "trainer" : "customer"}`)
                }
                disabled={!userType}
                className="flex items-center justify-center py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 bg-white"
              >
                <img
                  src="https://www.svgrepo.com/show/475656/google-color.svg"
                  className="h-5 w-5"
                  alt="Google"
                />
              </button>

              <button
                type="button"
                onClick={() =>
                  userType &&
                  (window.location.href = `${API_BASE}/api/auth/microsoft/login/${userType === "trainer" ? "trainer" : "customer"}`)
                }
                disabled={!userType}
                className="flex items-center justify-center py-2.5 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all disabled:opacity-50 bg-white"
              >
                <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                  <path fill="#F25022" d="M0 0h11v11H0z" />
                  <path fill="#00A4EF" d="M12 0h11v11H12z" />
                  <path fill="#7FBA00" d="M0 12h11v11H0z" />
                  <path fill="#FFB900" d="M12 12h11v11H12z" />
                </svg>

                {/* <img src="w-5 h-5" className="h-5 w-5" alt="Microsoft" /> */}
              </button>
            </div>

            <p className="text-center mt-6 lg:mt-8 text-slate-400 text-xs">
              Not part of the community?{" "}
              <button
                onClick={onSwitchToSignup}
                className="text-amber-600 font-bold hover:underline hover:text-amber-700 transition-colors"
              >
                Sign up
              </button>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        /* Add this NEW animation for the text gradient */
        @keyframes gradient-flow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-gradient-flow {
          animation: gradient-flow 6s ease infinite;
        }

        /* Your EXISTING animations below... */
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
        
        input[type="password"]::-webkit-textfield-decoration-container,
        input[type="password"]::-webkit-credentials-auto-fill-button { display: none !important; }
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear { display: none !important; }
      `}</style>
    </div>
  );
}
