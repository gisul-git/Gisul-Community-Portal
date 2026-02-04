import React, { useState } from "react";
import { adminLogin, trainerLogin, customerLogin, API_BASE } from "../api";
import gisulLogo from "../assets/gisul purple.webp";
import authImage from "../assets/auth.webp";

export default function Login({ onLogin, onSwitchToSignup }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [userType, setUserType] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);

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
          setError("Please select 'Join as Trainer' or 'Join as Client' from the dropdown. Admin credentials not recognized.");
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
      setError("Login failed. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div 
      data-auth-page 
      className="relative w-full h-screen flex flex-col overflow-hidden" 
      style={{ 
        height: '100vh',
        width: '100%',
        background: 'linear-gradient(135deg, #f5f0ff 0%, #e8dfff 25%, #faf5ff 50%, #ede7ff 75%, #f5f0ff 100%)',
        backgroundSize: '400% 400%',
        animation: 'gradientShift 15s ease infinite'
      }}
    >
      <div className="absolute top-0 left-0 p-3 sm:p-4 z-10">
        <img 
          src={gisulLogo} 
          alt="GISUL Logo" 
          className="h-8 sm:h-9 md:h-10 w-auto"
        />
      </div>

      <div className="flex items-center justify-center flex-1 px-4 overflow-hidden" style={{ minHeight: 0, paddingTop: '60px', paddingBottom: '20px' }}>
        <div className="flex items-center justify-center w-full max-w-6xl gap-4 sm:gap-6 md:gap-8">
          <div className="hidden lg:flex justify-end w-1/2 animate-fade-in items-center">
            <div className="flex items-center justify-center relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 to-transparent rounded-full blur-3xl"></div>
              <img 
                src={authImage} 
                alt="Authentication" 
                className="h-[450px] lg:h-[500px] xl:h-[550px] w-auto object-contain relative z-10 animate-float drop-shadow-2xl"
              />
            </div>
          </div>

          <div className="flex flex-col items-center justify-center w-full lg:w-1/2 animate-fade-in-delay">
            <form 
              onSubmit={handleSubmit} 
              className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-5 sm:p-6 w-full max-w-sm border border-white/20 relative overflow-hidden"
              style={{ 
                boxShadow: "0 20px 60px -12px rgba(93, 75, 139, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                marginTop: 0,
                marginBottom: 0
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 shadow-lg"></div>
              
              <div className="text-center mb-3 sm:mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 sm:w-14 sm:h-14 rounded-xl mb-2 shadow-lg transform hover:scale-110 transition-transform duration-300"
                  style={{
                    background: "linear-gradient(135deg, #5D4B8B 0%, #7B68C7 100%)",
                    boxShadow: "0 10px 30px -5px rgba(93, 75, 139, 0.4)"
                  }}>
                  <svg className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold mb-1 bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
                  Login
                </h1>
                <p className="text-xs sm:text-sm text-gray-600 font-medium">
                  Access your dashboard
                </p>
              </div>

              {error && (
                <div className="mb-3 p-2.5 bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-800 rounded-xl text-sm animate-shake flex items-center gap-2 shadow-sm">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="font-medium text-sm">{error}</span>
                </div>
              )}

              <div className="space-y-2.5 sm:space-y-3">
                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2 tracking-wide">
                    Join As <span className="text-red-500">*</span>
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 group-hover:text-purple-500 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3H6a3 3 0 00-3 3v2h5m2-4a2 2 0 01-2-2V9a2 2 0 012-2h4a2 2 0 012 2v5a2 2 0 01-2 2h-4z" />
                      </svg>
                    </div>
                    <select
                      value={userType}
                      onChange={(e) => {
                        setUserType(e.target.value);
                        setError("");
                      }}
                      className="w-full pl-10 sm:pl-12 pr-9 sm:pr-11 py-2.5 sm:py-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 bg-white border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 hover:shadow-sm appearance-none cursor-pointer text-sm sm:text-base text-gray-700 font-medium shadow-sm"
                      required={false}
                      style={{ 
                        cursor: 'pointer',
                        backgroundImage: 'none',
                        boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
                      }}
                    >
                      <option value="" disabled className="text-gray-400 font-normal">Select your role</option>
                      <option value="trainer" className="text-gray-700 font-semibold">Join as Trainer</option>
                      <option value="client" className="text-gray-700 font-semibold">Join as Client</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none z-10">
                      <svg 
                        className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400 transition-transform duration-200 group-hover:text-purple-600" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth={2.5}
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2 tracking-wide">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                      </svg>
                    </div>
                    <input
                      type="email"
                      className={`w-full pl-10 sm:pl-12 pr-4 py-2.5 sm:py-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm ${emailTouched && !email
                          ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400"
                        }`}
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setError("");
                      }}
                      onBlur={() => setEmailTouched(true)}
                      required
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1.5 sm:mb-2 tracking-wide">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      onBlur={() => setPasswordTouched(true)}
                      required
                      autoComplete="current-password"
                      className={`w-full pl-10 sm:pl-12 pr-12 sm:pr-14 py-2.5 sm:py-3 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm ${passwordTouched && !password
                          ? "border-red-300 focus:ring-red-500 focus:border-red-500"
                          : "border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400"
                        }`}
                      placeholder="Enter your password"
                      style={{
                        WebkitAppearance: 'none',
                        appearance: 'none'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-purple-600 transition-colors z-10 active:scale-95"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={0}
                    >
                      {showPassword ? (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="group relative w-full mt-3 sm:mt-4 py-2.5 sm:py-3 rounded-lg text-white font-bold text-sm transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none overflow-hidden"
                style={{
                  background: loading
                    ? "linear-gradient(135deg, #7a6a9a 0%, #6a5a8a 100%)"
                    : "linear-gradient(135deg, #5D4B8B 0%, #7B68C7 100%)",
                  boxShadow: loading
                    ? "0 4px 14px 0 rgba(93, 75, 139, 0.3)"
                    : "0 8px 20px -5px rgba(93, 75, 139, 0.4)"
                }}
              >
                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                {loading ? (
                  <>
                    <svg className="animate-spin h-5 w-5 text-white relative z-10" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span className="relative z-10">Logging in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    <span className="relative z-10">Login</span>
                  </>
                )}
              </button>

              <div className="mt-3">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">Or continue with</span>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (userType && (userType === "trainer" || userType === "client")) {
                        const role = userType === "trainer" ? "trainer" : "customer";
                        window.location.href = `${API_BASE}/api/auth/google/login/${role}`;
                      }
                    }}
                    disabled={!userType || (userType !== "trainer" && userType !== "client")}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg transition-all active:scale-[0.98] ${
                      !userType || (userType !== "trainer" && userType !== "client")
                        ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50"
                        : "border-gray-300 hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm cursor-pointer"
                    }`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span className={`text-sm font-medium ${
                      !userType || (userType !== "trainer" && userType !== "client")
                        ? "text-gray-400"
                        : "text-gray-700"
                    }`}>Google</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (userType && (userType === "trainer" || userType === "client")) {
                        const role = userType === "trainer" ? "trainer" : "customer";
                        window.location.href = `${API_BASE}/api/auth/microsoft/login/${role}`;
                      }
                    }}
                    disabled={!userType || (userType !== "trainer" && userType !== "client")}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 border rounded-lg transition-all active:scale-[0.98] ${
                      !userType || (userType !== "trainer" && userType !== "client")
                        ? "border-gray-200 bg-gray-50 cursor-not-allowed opacity-50"
                        : "border-gray-300 hover:bg-gray-50 hover:border-gray-400 hover:shadow-sm cursor-pointer"
                    }`}
                  >
                    <svg className="w-5 h-5" viewBox="0 0 23 23" fill="none">
                      <path fill="#F25022" d="M0 0h11v11H0z"/>
                      <path fill="#00A4EF" d="M12 0h11v11H12z"/>
                      <path fill="#7FBA00" d="M0 12h11v11H0z"/>
                      <path fill="#FFB900" d="M12 12h11v11H12z"/>
                    </svg>
                    <span className={`text-sm font-medium ${
                      !userType || (userType !== "trainer" && userType !== "client")
                        ? "text-gray-400"
                        : "text-gray-700"
                    }`}>Microsoft</span>
                  </button>
                </div>
              </div>

              <div className="text-center mt-3 text-xs">
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={onSwitchToSignup}
                  className="font-semibold hover:underline transition"
                  style={{ color: "#5D4B8B" }}
                >
                  Sign Up
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      <style>{`
        [data-auth-page] {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          height: 100vh !important;
          overflow: hidden !important;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        @keyframes gradientShift {
          0%, 100% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
        }
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        .animate-fade-in {
          animation: fadeIn 0.6s ease-out;
        }
        .animate-fade-in-delay {
          animation: fadeIn 0.8s ease-out 0.2s both;
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        input[type="password"]::-webkit-textfield-decoration-container,
        input[type="password"]::-webkit-credentials-auto-fill-button {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          position: absolute !important;
          right: -9999px !important;
        }
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none !important;
        }
        select {
          background-image: none !important;
          -webkit-appearance: none;
          -moz-appearance: none;
          appearance: none;
          position: relative;
        }
        select::-ms-expand {
          display: none;
        }
        select option {
          padding: 14px 16px;
          background-color: #FFFFFF;
          color: #374151;
          font-weight: 500;
          font-size: 14px;
          line-height: 1.5;
          cursor: pointer;
          border-radius: 6px;
          margin: 2px 4px;
          transition: all 0.15s ease;
        }
        select option:disabled {
          color: #9CA3AF;
          font-style: italic;
          background-color: #F9FAFB;
          cursor: not-allowed;
        }
        select option:not(:disabled) {
          background-color: #FFFFFF;
        }
        select option:not(:disabled):hover {
          background: linear-gradient(135deg, #F3F4F6 0%, #EDE9FE 100%) !important;
          color: #5D4B8B !important;
          font-weight: 600;
          transform: translateX(2px);
        }
        select option:checked,
        select option[selected] {
          background: linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 50%, #F3F4F6 100%) !important;
          color: #5D4B8B !important;
          font-weight: 700;
          box-shadow: 0 2px 4px rgba(93, 75, 139, 0.1);
        }
        select:focus option:checked,
        select:focus option[selected] {
          background: linear-gradient(135deg, #EDE9FE 0%, #DDD6FE 50%, #C4B5FD 100%) !important;
          color: #5D4B8B !important;
          box-shadow: 0 2px 6px rgba(93, 75, 139, 0.15);
        }
        select:focus {
          border-color: #7B68C7 !important;
          outline: none;
          box-shadow: 0 0 0 3px rgba(123, 104, 199, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06) !important;
        }
        select:hover:not(:focus) {
          border-color: #A78BFA;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
      `}</style>
    </div>
  );
}