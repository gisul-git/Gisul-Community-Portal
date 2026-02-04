import React, { useState } from "react";
import { trainerSignup, customerSignup, API_BASE } from "../api";
import gisulLogo from "../assets/gisul purple.webp";
import authImage from "../assets/auth.webp";

export default function Signup({ onSignupSuccess }) {
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

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!userType) {
      setError("Please select 'Join as Trainer' or 'Join as Client'");
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

  if (success) {
    return (
      <div 
        data-auth-page 
        className="relative w-full min-h-screen overflow-hidden" 
        style={{ 
          minHeight: '133.33vh',
          width: '100%',
          background: 'linear-gradient(135deg, #f5f0ff 0%, #e8dfff 25%, #faf5ff 50%, #ede7ff 75%, #f5f0ff 100%)',
          backgroundSize: '400% 400%',
          animation: 'gradientShift 15s ease infinite'
        }}
      >
        <div className="absolute top-0 left-0 p-3 sm:p-4 z-10" style={{ position: 'absolute' }}>
          <img 
            src={gisulLogo} 
            alt="GISUL Logo" 
            className="h-8 sm:h-9 md:h-10 w-auto"
          />
        </div>
        <div className="flex items-center justify-center px-4 flex-1 overflow-hidden" style={{ minHeight: 0, paddingTop: '60px', paddingBottom: '20px' }}>
          <div className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-3xl p-6 sm:p-7 md:p-8 w-full max-w-lg text-center border border-white/20 animate-fade-in-success" style={{ marginTop: 0, marginBottom: 0 }}>
            <div className="mb-6 flex justify-center">
              <div className="relative">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-green-400 to-green-600 shadow-lg animate-scale-in">
                  <svg className="w-12 h-12 text-white animate-checkmark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ripple"></div>
                <div className="absolute inset-0 rounded-full bg-green-400 animate-ripple-delay"></div>
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-3 animate-slide-up" style={{ color: "#5D4B8B" }}>
              Signup Successful!
            </h2>
            <p className="text-lg text-gray-700 font-medium mb-6 animate-slide-up-delay">
              Your account has been created successfully. Redirecting to login...
            </p>
          </div>
        </div>
      </div>
    );
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
              className="bg-white/95 backdrop-blur-sm shadow-2xl rounded-2xl p-4 sm:p-5 w-full max-w-sm border border-white/20 relative overflow-hidden"
              style={{ 
                boxShadow: "0 20px 60px -12px rgba(93, 75, 139, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.05)",
                marginTop: 0,
                marginBottom: 0
              }}
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-600 shadow-lg"></div>
              
              <div className="text-center mb-2 sm:mb-3 relative z-10">
                <div className="inline-flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl mb-1.5 sm:mb-2 shadow-lg transform hover:scale-110 transition-transform duration-300"
                  style={{
                    background: "linear-gradient(135deg, #5D4B8B 0%, #7B68C7 100%)",
                    boxShadow: "0 10px 30px -5px rgba(93, 75, 139, 0.4)"
                  }}>
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                </div>
                <h1 className="text-lg sm:text-xl font-extrabold mb-0.5 bg-gradient-to-r from-purple-600 to-purple-400 bg-clip-text text-transparent">
                  Sign Up
                </h1>
                <p className="text-xs text-gray-600 font-medium">
                  Create your account
                </p>
              </div>

              {error && (
                <div className="mb-2 sm:mb-2.5 p-2 bg-gradient-to-r from-red-50 to-red-100 border-l-4 border-red-500 text-red-800 rounded-lg text-xs animate-shake flex items-center gap-2 shadow-sm">
                  <div className="flex-shrink-0 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                    <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="font-medium text-xs">{error}</span>
                </div>
              )}

              <div className="space-y-2 sm:space-y-2.5 relative z-10">
                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
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
                      className="w-full pl-10 sm:pl-12 pr-9 sm:pr-11 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all duration-200 bg-white border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 hover:shadow-sm appearance-none cursor-pointer text-sm sm:text-base text-gray-700 font-medium shadow-sm"
                      required
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
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
                    Full Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 text-sm sm:text-base"
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
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
                      className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 text-sm sm:text-base"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {userType === "client" && (
                  <div className="group">
                    <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
                      Company Name <span className="text-gray-500 text-xs">(Optional)</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                        <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        className="w-full pl-10 sm:pl-12 pr-4 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 text-sm sm:text-base"
                        placeholder="Enter company name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
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
                      className="w-full pl-10 sm:pl-12 pr-12 sm:pr-14 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 text-sm sm:text-base"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      style={{ WebkitAppearance: 'none', appearance: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-purple-600 transition-colors z-10"
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className="group">
                  <label className="block text-xs sm:text-sm font-bold text-gray-700 mb-1 sm:mb-1.5 tracking-wide">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                      <svg className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      type={showConfirmPassword ? "text" : "password"}
                      className="w-full pl-10 sm:pl-12 pr-12 sm:pr-14 py-2 sm:py-2.5 border-2 rounded-lg focus:outline-none focus:ring-2 transition-all bg-white shadow-sm border-gray-300 focus:ring-purple-500 focus:border-purple-500 hover:border-purple-400 text-sm sm:text-base"
                      placeholder="Confirm your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      style={{ WebkitAppearance: 'none', appearance: 'none' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-purple-600 transition-colors z-10"
                    >
                      {showConfirmPassword ? (
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                className="group relative w-full mt-2.5 sm:mt-3 py-2 sm:py-2.5 rounded-lg text-white font-bold text-sm transition-all duration-300 transform hover:scale-[1.02] hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none overflow-hidden"
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
                    <span className="relative z-10">Signing up...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 relative z-10 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    <span className="relative z-10">Sign Up</span>
                  </>
                )}
              </button>

              <div className="text-center mt-3 sm:mt-4 text-xs">
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={onSignupSuccess}
                  className="font-semibold hover:underline transition"
                  style={{ color: "#5D4B8B" }}
                >
                  Login
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
        @keyframes fadeInSuccess {
          from {
            opacity: 0;
            transform: scale(0.9);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        @keyframes scaleIn {
          from { transform: scale(0); }
          to { transform: scale(1); }
        }
        @keyframes checkmark {
          0% { stroke-dashoffset: 100; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.5); opacity: 0; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
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
        .animate-fade-in-success {
          animation: fadeInSuccess 0.5s ease-out;
        }
        .animate-scale-in {
          animation: scaleIn 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .animate-checkmark {
          animation: checkmark 0.6s ease-out 0.3s both;
          stroke-dasharray: 100;
          stroke-dashoffset: 100;
        }
        .animate-ripple {
          animation: ripple 2s ease-out infinite;
        }
        .animate-ripple-delay {
          animation: ripple 2s ease-out 1s infinite;
        }
        .animate-slide-up {
          animation: slideUp 0.6s ease-out 0.4s both;
        }
        .animate-slide-up-delay {
          animation: slideUp 0.6s ease-out 0.6s both;
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

