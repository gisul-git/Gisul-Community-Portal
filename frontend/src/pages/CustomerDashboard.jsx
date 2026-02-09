import React, { useState, useEffect, useRef } from "react";
import { customerSearchByText, customerSearchByJD, uploadJD, API_BASE, postRequirement, getCustomerRequirements } from "../api";
import gisulLogo from "../assets/gisul final logo yellow-01 2.webp";

export default function CustomerDashboard({ token, onLogout }) {
  const [activeTab, setActiveTab] = useState("search"); // "search" or "post_requirement"
  const [customerName, setCustomerName] = useState("");

  // Handle OAuth token from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    
    if (urlToken) {
      // Save token to localStorage
      localStorage.setItem('token', urlToken);
      // Clean URL by removing token parameter
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  useEffect(() => {
    // Fetch customer name from backend
    async function fetchCustomerName() {
      try {
        // Fetch customer info from backend
        const res = await fetch(`${API_BASE}/customer/profile`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        
        if (res.ok) {
          const data = await res.json();
          // Always use the full name from the database (not email)
          const fullName = data.name ? String(data.name).trim() : "";
          if (fullName) {
            setCustomerName(fullName); 
          } else {
            // Only fallback to email if full name is not available in database
            console.warn("Customer name not found in database, using email fallback");
            try {
              const payload = JSON.parse(atob(token.split('.')[1]));
              const email = payload.email;
              setCustomerName(email.split('@')[0]);
            } catch (e) {
              setCustomerName("Customer");
            }
          }
        } else {
          // Fallback to email username if API fails
          try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const email = payload.email;
            setCustomerName(email.split('@')[0]);
          } catch (e) {
            setCustomerName("Customer");
          }
        }
      } catch (err) {
        // Fallback: try to extract name from email
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const email = payload.email;
          setCustomerName(email.split('@')[0]);
        } catch (e) {
          setCustomerName("Customer");
        }
      }
    }
    
    if (token) {
      fetchCustomerName();
    }
  }, [token]);

  return (
    <div className="min-h-screen bg-[#f8f9fc] font-sans selection:bg-purple-100 pb-20">
      
      {/* --- MAXIMIZED FLOATING NAVBAR --- */}
<div className="fixed top-0 left-0 right-0 z-50 flex justify-center px-4 pt-6 sm:pt-10">
  <header className="flex items-center justify-between w-full max-w-[100rem] bg-white/90 backdrop-blur-xl rounded-full px-6 sm:px-8 py-2 shadow-[0_12px_40px_rgb(0,0,0,0.12)] border border-white/50 transition-all duration-300">
    
    {/* Left: Brand Identity */}
    <div className="flex items-center gap-4 sm:gap-5 pl-1">
      <img 
        src={gisulLogo} 
        alt="GISUL" 
        className="h-16 sm:h-20 w-auto object-contain transition-transform hover:scale-105" 
      />
      <div className="hidden sm:flex flex-col justify-center">
        <span className="font-extrabold text-gray-900 text-xl sm:text-2xl leading-none tracking-tight">GISUL</span>
        <span className="text-[10px] sm:text-[12px] text-gray-500 font-bold uppercase tracking-[0.2em] mt-1">Customer Portal</span>
      </div>
    </div>

    {/* Right: Actions */}
    <div className="flex items-center gap-4 pr-1">
      {/* Customer Welcome Text */}
      {customerName && (
        <div className="hidden md:flex flex-col items-end mr-2">
          <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Welcome Back</span>
          <span className="text-sm font-bold text-gray-800">{customerName}</span>
        </div>
      )}
      
      <button
        onClick={onLogout}
        className="group flex items-center gap-3 px-3 sm:px-8 py-2.5 sm:py-3.5 rounded-full bg-[#F4E403] text-black font-extrabold text-sm sm:text-base hover:brightness-105 transition-all shadow-lg shadow-yellow-100 transform active:scale-95"
        title="Logout"
      >
        <span className="hidden sm:block">Logout</span>
        <div className="bg-black/10 rounded-full p-1.5 group-hover:bg-black/20 transition-colors">
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </div>
      </button>
    </div>
  </header>
</div>

      {/* --- Main Content --- */}
      <main className="flex-1 max-w-[100rem] mx-auto w-full px-4 sm:px-6 md:px-8 pt-40 transition-all duration-300">
        
        {/* Simplified Tab Navigation (Enhanced) */}
        <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 shadow-sm sticky top-24 z-40 rounded-xl mb-8 transition-all duration-300">
          <div className="flex gap-2 overflow-x-auto px-4 no-scrollbar">
            <button
              onClick={() => setActiveTab("search")}
              className={`relative px-6 py-4 font-medium text-sm sm:text-base transition-all duration-300 whitespace-nowrap outline-none ${
                activeTab === "search"
                  ? "text-purple-700"
                  : "text-gray-500 hover:text-purple-600 hover:bg-purple-50/50 rounded-t-lg"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg className={`w-5 h-5 transition-transform duration-300 ${activeTab === "search" ? "scale-110 stroke-[2.5px]" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Trainer Search</span>
              </span>
              {activeTab === "search" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-full animate-fade-in"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab("post_requirement")}
              className={`relative px-6 py-4 font-medium text-sm sm:text-base transition-all duration-300 whitespace-nowrap outline-none ${
                activeTab === "post_requirement"
                  ? "text-purple-700"
                  : "text-gray-500 hover:text-purple-600 hover:bg-purple-50/50 rounded-t-lg"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg className={`w-5 h-5 transition-transform duration-300 ${activeTab === "post_requirement" ? "scale-110 stroke-[2.5px]" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Post Requirement</span>
              </span>
              {activeTab === "post_requirement" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-full animate-fade-in"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab("requirements")}
              className={`relative px-6 py-4 font-medium text-sm sm:text-base transition-all duration-300 whitespace-nowrap outline-none ${
                activeTab === "requirements"
                  ? "text-purple-700"
                  : "text-gray-500 hover:text-purple-600 hover:bg-purple-50/50 rounded-t-lg"
              }`}
            >
              <span className="flex items-center gap-2.5">
                <svg className={`w-5 h-5 transition-transform duration-300 ${activeTab === "requirements" ? "scale-110 stroke-[2.5px]" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>My Requirements</span>
              </span>
              {activeTab === "requirements" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-t-full animate-fade-in"></div>
              )}
            </button>
          </div>
        </div>

        <div className={`transition-all duration-500 ease-in-out ${activeTab === "search" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 hidden"}`}>
          {activeTab === "search" && <TrainerSearchEngine token={token} />}
        </div>
        <div className={`transition-all duration-500 ease-in-out ${activeTab === "post_requirement" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 hidden"}`}>
          {activeTab === "post_requirement" && <RequirementPosting token={token} />}
        </div>
        <div className={`transition-all duration-500 ease-in-out ${activeTab === "requirements" ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 hidden"}`}>
          {activeTab === "requirements" && <PostedRequirements token={token} />}
        </div>
      </main>
      
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fade-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-slide-up { animation: slide-up 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}

// Trainer Search Engine - Enhanced Google-style search
function TrainerSearchEngine({ token }) {
  // Persist search state in localStorage
  const getStoredState = () => {
    try {
      const stored = localStorage.getItem('customer_search_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          searchQuery: parsed.searchQuery || "",
          results: parsed.results || [],
          hasSearched: parsed.hasSearched || false,
          expandedTerms: parsed.expandedTerms || [],
          lastSearchSkill: parsed.lastSearchSkill || ""
        };
      }
    } catch (e) {
      console.warn("Failed to load stored search state:", e);
    }
    return {
      searchQuery: "",
      results: [],
      hasSearched: false,
      expandedTerms: [],
      lastSearchSkill: ""
    };
  };

  const saveState = (state) => {
    try {
      localStorage.setItem('customer_search_state', JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save search state:", e);
    }
  };

  const initialState = getStoredState();
  const [searchQuery, setSearchQuery] = useState(initialState.searchQuery);
  const [results, setResults] = useState(initialState.results);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(initialState.hasSearched);
  const [isFocused, setIsFocused] = useState(false);
  const [expandedTerms, setExpandedTerms] = useState(initialState.expandedTerms);
  const [lastSearchSkill, setLastSearchSkill] = useState(initialState.lastSearchSkill);
  
  // Ref for scrolling to results/loading area
  const resultsRef = useRef(null);
  
  async function handleSearch() {
    if (!searchQuery.trim()) {
      alert("Please enter a search query (e.g., 'etl trainer from bangalore')");
      return;
    }
    
    setLoading(true);
    setHasSearched(false);
    
    // Scroll to loading animation area immediately
    if (resultsRef.current) {
        resultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    try {
      // --- FIX: Pass 'undefined' for location to remove it from the payload ---
      // This prevents the 422 error (for null) and empty results (for empty string)
      const data = await customerSearchByText(token, searchQuery, undefined, 50);
      
      // Robust data handling for array or object responses
      const matches = Array.isArray(data) ? data : (data.matches || data.data || []);
      const expanded = data.expanded_terms || [];
      
      // Extract main skill from query for highlighting
      const mainSkill = searchQuery.toLowerCase().trim();
      
      setResults(matches);
      setExpandedTerms(expanded);
      setLastSearchSkill(mainSkill);
      setHasSearched(true);
      
      // Save state
      saveState({
        searchQuery,
        results: matches,
        hasSearched: true,
        expandedTerms: expanded,
        lastSearchSkill: mainSkill
      });
      
    } catch (err) {
      console.error("Search error details:", err);
      let errorMessage = err.message || "Unknown error";
      
      if (errorMessage.includes("422")) {
         alert("Search Error: Please check your input format."); 
      } else if (errorMessage.includes("OpenAI API key error")) {
        alert(errorMessage);
      } else if (errorMessage.includes("Search error:")) {
        alert(errorMessage);
      } else {
        alert("Search failed: " + errorMessage);
      }
      setResults([]);
      setExpandedTerms([]);
      setHasSearched(true);
      saveState({
        searchQuery,
        results: [],
        hasSearched: true,
        expandedTerms: [],
        lastSearchSkill: ""
      });
    } finally {
      setLoading(false);
    }
  }

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !loading && searchQuery.trim()) {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchQuery("");
    setResults([]);
    setHasSearched(false);
    setExpandedTerms([]);
    setLastSearchSkill("");
    setIsFocused(false);
    localStorage.removeItem('customer_search_state');
  };

  return (
    <div className="w-full max-w-[100rem] mx-auto animate-fade-in">
      {/* Enhanced Search Bar */}
      <div className="flex flex-col items-center justify-center min-h-[400px] py-10 transition-all duration-500">
        <div className="w-full mb-6">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
              Find Your Perfect Trainer
            </h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto font-light">
                Connect with top-tier professionals tailored to your specific training requirements.
            </p>
          </div>
          
          <div className="relative max-w-3xl mx-auto group">
            <div className={`absolute -inset-1 bg-gradient-to-r from-purple-400 to-indigo-400 rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500 ${isFocused ? 'opacity-50' : ''}`}></div>
            
            <div className="relative bg-white rounded-full shadow-xl">
                 {/* Search Icon */}
                <div className={`absolute left-6 top-1/2 transform -translate-y-1/2 transition-colors duration-200 ${isFocused ? "text-purple-600" : "text-gray-400"}`}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                </div>
                
                {/* Search Input */}
                <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Search by skills (e.g., 'etl trainer from bangalore')..."
                className={`w-full pl-16 pr-24 py-5 text-lg rounded-full focus:outline-none transition-all duration-300 bg-transparent placeholder-gray-400 text-gray-800 ${
                    isFocused 
                    ? "ring-0" 
                    : ""
                }`}
                autoFocus
                />
                
                {/* Clear Button */}
                {searchQuery && (
                <button
                    onClick={clearSearch}
                    className="absolute right-28 top-1/2 transform -translate-y-1/2 p-2 rounded-full hover:bg-gray-100 transition text-gray-400 hover:text-red-500"
                    title="Clear"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
                )}
                
                {/* Search Button */}
                <div className="absolute right-2 top-2 bottom-2">
                    <button
                    onClick={handleSearch}
                    disabled={loading || !searchQuery.trim()}
                    className={`h-full px-6 rounded-full font-semibold transition-all duration-200 flex items-center gap-2 shadow-md ${
                        searchQuery.trim() 
                        ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:shadow-lg hover:scale-105 active:scale-95 text-white" 
                        : "bg-gray-200 text-gray-400 cursor-not-allowed"
                    }`}
                    title="Search"
                    >
                    {loading ? (
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <>
                        <span className="hidden sm:inline">Search</span>
                        </>
                    )}
                    </button>
                </div>
            </div>
          </div>
          
          {/* Enhanced Helper Text with Examples */}
          <div className="mt-8 text-center">
            <p className="text-sm font-medium text-gray-500 mb-4 uppercase tracking-wide">Quick Search Examples</p>
            <div className="flex flex-wrap justify-center gap-3">
              {["Python developer", "React expert", "etl trainer from bangalore", "data engineer from mumbai"].map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSearchQuery(example);
                    setTimeout(() => handleSearch(), 100);
                  }}
                  className="px-4 py-2 text-xs sm:text-sm bg-white border border-gray-200 rounded-lg text-gray-600 hover:text-purple-600 hover:border-purple-300 hover:bg-purple-50 transition-all duration-200 shadow-sm hover:shadow-md active:scale-95"
                >
                  {example}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4 flex items-center justify-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Smart Location Detection enabled (e.g., "in mumbai")
            </p>
          </div>
        </div>
      </div>

      {/* Loading Animation */}
      {loading && (
        <div ref={resultsRef} className="flex flex-col items-center justify-center py-20 space-y-6 mt-8 animate-fade-in">
          {/* Animated Spinner */}
          <div className="relative">
            <div className="w-20 h-20 border-4 border-purple-100 rounded-full"></div>
            <div className="w-20 h-20 border-4 border-transparent border-t-purple-600 rounded-full animate-spin absolute top-0 left-0"></div>
            <div className="w-20 h-20 border-4 border-transparent border-r-indigo-400 rounded-full animate-spin absolute top-0 left-0" style={{ animationDirection: 'reverse', animationDuration: '1s' }}></div>
            <div className="absolute inset-0 flex items-center justify-center">
                 <svg className="w-8 h-8 text-purple-600 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>
          </div>
          
          {/* Pulsing Text */}
          <div className="text-center space-y-2">
            <p className="text-xl font-bold animate-pulse bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              Finding best matches...
            </p>
            <p className="text-sm text-gray-500 font-medium">
              Scanning database for skills and location
            </p>
          </div>
        </div>
      )}

      {/* Enhanced Results Section */}
      {!loading && hasSearched && (
        <div ref={resultsRef} id="search-results" className="mt-8 animate-slide-up pb-12">
          <div className="bg-white rounded-2xl shadow-xl shadow-purple-900/5 border border-gray-100 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-center justify-between p-6 sm:p-8 bg-gray-50/50 border-b border-gray-100">
              <div className="mb-4 sm:mb-0 text-center sm:text-left">
                <h3 className="text-2xl font-bold mb-1 text-gray-800">
                  Search Results
                </h3>
                <p className="text-gray-500 text-sm">
                  Found <span className="font-bold text-purple-600 px-2 py-0.5 bg-purple-100 rounded-md mx-1">{results.length}</span> {results.length === 1 ? "trainer" : "trainers"} matching your criteria
                </p>
              </div>
              {results.length > 0 && (
                <button
                  onClick={clearSearch}
                  className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-gray-200 hover:border-red-200"
                >
                  Clear Results
                </button>
              )}
            </div>
            
            {results.length === 0 ? (
              <div className="text-center py-20 bg-white">
                <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gray-50 mb-6">
                  <svg className="w-12 h-12 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">No trainers found</h4>
                <p className="text-gray-500 max-w-md mx-auto">We couldn't find any trainers matching those exact terms. Try broadening your search or checking spelling.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse bg-white">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200 text-left">
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Name</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Experience</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider w-1/3">Skills</th>
                      <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Companies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                {results.filter(trainer => {
                  const name = trainer.name || "";
                  return name.trim() !== "" && name.trim().toLowerCase() !== "n/a";
                }).map((trainer, idx) => (
                      <tr 
                    key={idx} 
                        className="hover:bg-purple-50/30 transition-colors duration-150 group"
                      >
                        <td className="px-6 py-4">
                          <div className="font-bold text-gray-900 group-hover:text-purple-700 transition-colors">{trainer.name || "N/A"}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{trainer.location || "N/A"}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 text-sm">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                trainer.experience_years > 8 
                                ? "bg-green-100 text-green-700" 
                                : trainer.experience_years > 4 
                                    ? "bg-blue-100 text-blue-700" 
                                    : "bg-gray-100 text-gray-700"
                            }`}>
                              {trainer.experience_years ? `${trainer.experience_years} years` : "N/A"}
                            </span>
                        </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1.5 relative group/skills">
                            {trainer.skills && trainer.skills.length > 0 ? (
                              <>
                                {(() => {
                                  // Separate skills into related (searched/expanded) and unrelated
                                  const relatedSkills = [];
                                  const unrelatedSkills = [];
                                  const hasExpandedSkills = expandedTerms.length > 0 && relatedSkills.some(s => s.isExpanded);
                                  
                                  trainer.skills.forEach((skill) => {
                                    const skillLower = skill.toLowerCase();
                                    const isSearched = lastSearchSkill && skillLower.includes(lastSearchSkill);
                                    const isExpanded = expandedTerms.some(term => skillLower.includes(term.toLowerCase()));
                                    
                                    if (isSearched || isExpanded) {
                                      relatedSkills.push({ skill, isSearched, isExpanded, skillLower });
                                    } else {
                                      unrelatedSkills.push(skill);
                                    }
                                  });
                                  
                                  const hasAnyExpanded = relatedSkills.some(s => s.isExpanded);
                                  
                                  return (
                                    <>
                                      {/* Show related skills (searched + expanded) */}
                                      {relatedSkills.map(({ skill, isSearched, isExpanded, skillLower }, skillIdx) => (
                              <span 
                                key={skillIdx} 
                                            className={`px-2.5 py-1 rounded-md text-xs font-semibold relative transition-all hover:scale-105 cursor-default ${
                                              isSearched 
                                                ? "bg-amber-100 text-amber-800 border border-amber-200" 
                                                : "bg-purple-100 text-purple-700 border border-purple-200"
                                            }`}
                              >
                                {skill}
                                            {isExpanded && (
                                              <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full ring-2 ring-white"></span>
                                            )}
                              </span>
                            ))}
                                    
                                    {/* Show unrelated skills count */}
                                    {unrelatedSkills.length > 0 && (
                                      <span 
                                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100 transition-colors"
                                      >
                                        +{unrelatedSkills.length} more
                                      </span>
                                    )}
                                    
                                    {/* Single tooltip for other skills - appears on hover over skills area */}
                                    {unrelatedSkills.length > 0 && (
                                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover/skills:block z-[50] min-w-[280px] pointer-events-none">
                                        <div className="bg-gray-900 text-white rounded-lg py-3 px-4 shadow-xl pointer-events-auto">
                                          <div className="text-xs font-bold text-gray-300 mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                            </svg>
                                            Full Skill Set
                                          </div>
                                          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto custom-scrollbar">
                                            {unrelatedSkills.map((skill, idx) => (
                                              <span key={idx} className="px-2 py-1 bg-gray-800 text-gray-300 rounded text-xs">
                                                {skill}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        {/* Arrow pointer */}
                                        <div className="absolute top-full left-6 -mt-1 pointer-events-none">
                                          <div className="w-2 h-2 bg-gray-900 transform rotate-45"></div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </>
                            ) : (
                              <span className="text-xs text-gray-400 italic">No specific skills listed</span>
                      )}
                    </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-gray-600 max-w-[150px] truncate" title={trainer.companies ? trainer.companies.join(", ") : ""}>
                            {trainer.companies && trainer.companies.length > 0 
                              ? trainer.companies.slice(0, 2).join(", ") + (trainer.companies.length > 2 ? "..." : "")
                              : <span className="text-gray-400 italic">N/A</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
      
      <style>{`
        /* Custom scrollbar for tooltip */
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #374151; border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #6b7280; border-radius: 4px; }
      `}</style>
    </div>
  );
}

// Requirement Posting Section - Enhanced UX
function RequirementPosting({ token }) {
  const [requirementText, setRequirementText] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedFileText, setUploadedFileText] = useState("");
  const [parsedJD, setParsedJD] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Check if file has valid requirements
  const hasValidFileRequirements = () => {
    if (!parsedJD || !uploadedFileText) return false;
    const parsed = parsedJD;
    const hasSkills = parsed.skills && Array.isArray(parsed.skills) && parsed.skills.length > 0;
    const hasDomain = parsed.domain && parsed.domain.trim() !== "";
    const hasRequirements = parsed.requirements && parsed.requirements.trim() !== "";
    const hasText = uploadedFileText.trim() !== "";
    return hasText && (hasSkills || hasDomain || hasRequirements);
  };

  async function handleFileUpload(file) {
    if (!file) return;
    
    setUploading(true);
    setUploadedFile(file);
    try {
      const res = await uploadJD(token, file, true); // true indicates customer upload
      const jdText = res.jd_text || "";
      const parsed = res.parsed || null;
      
      setUploadedFileText(jdText);
      setParsedJD(parsed);
      
      // Check if file has valid requirements
      if (jdText && parsed) {
        const hasSkills = parsed.skills && Array.isArray(parsed.skills) && parsed.skills.length > 0;
        const hasDomain = parsed.domain && parsed.domain.trim() !== "";
        const hasRequirements = parsed.requirements && parsed.requirements.trim() !== "";
        
        if (!hasSkills && !hasDomain && !hasRequirements) {
          alert("Warning: The uploaded file could not be parsed for requirements. Please enter your requirements as text or ensure the file contains clear job requirements.");
        }
      }
      
      // Success feedback
      setTimeout(() => {
        setUploading(false);
      }, 500);
    } catch (err) {
      alert("Error uploading file: " + (err.message || "Unknown error"));
      setUploadedFile(null);
      setUploadedFileText("");
      setParsedJD(null);
      setUploading(false);
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFileUpload(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && /\.(pdf|doc|docx|xlsx|xls)$/i.test(file.name)) {
      handleFileUpload(file);
    } else {
      alert("Please upload a valid file (PDF, DOC, DOCX, XLSX, XLS)");
    }
  };

  async function handlePostRequirement() {
    // Use uploaded file text if available, otherwise use requirement text
    const requirementToUse = uploadedFileText || requirementText.trim();
    
    if (!requirementToUse) {
      alert("Please enter your requirement as text or upload a file");
      return;
    }
    
    setPosting(true);
    setPosted(false);
    try {
      // Extract skills, domain, experience from parsed JD if available
      const skills = parsedJD?.skills || [];
      const domain = parsedJD?.domain || "";
      const experience_years = parsedJD?.experience_years || null;
      
      const requirementData = {
        requirement_text: requirementToUse,
        jd_file_text: uploadedFileText || null,
        location: null, // Can be extracted from text if needed
        skills: skills,
        experience_years: experience_years,
        domain: domain,
      };
      
      const res = await postRequirement(token, requirementData);
      
      if (res.status === "success") {
        setPosted(true);
        // Clear form after successful post
      setTimeout(() => {
          clearAll();
          setPosted(false);
        }, 2000);
        alert("Requirement posted successfully! Waiting for admin approval.");
      }
    } catch (err) {
      alert("Failed to post requirement: " + (err.message || "Unknown error"));
    } finally {
      setPosting(false);
    }
  }

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setUploadedFileText("");
    setParsedJD(null);
  };

  const clearAll = () => {
    setRequirementText("");
    setUploadedFile(null);
    setUploadedFileText("");
    setParsedJD(null);
    setPosted(false);
  };

  const wordCount = requirementText.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="w-full max-w-[90rem] mx-auto animate-fade-in pb-12">

      <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 border border-gray-100">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-6 bg-gradient-to-br from-purple-500 to-indigo-700 shadow-lg shadow-purple-500/30 transform transition-transform hover:scale-105 duration-300">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold mb-4 bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-600 bg-clip-text text-transparent">
            Post Your Requirement
          </h2>
          <p className="text-gray-500 text-lg max-w-2xl mx-auto font-light">
            Upload a JD file or describe your needs. We'll find the perfect trainer for you.
          </p>
        </div>

        {/* File Upload Section - Enhanced */}
        <div 
          className={`mb-8 p-10 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer group ${
            isDragging 
              ? "border-purple-500 bg-purple-50 scale-[1.02] shadow-xl" 
              : uploadedFile 
                ? "border-green-300 bg-green-50/50" 
                : "border-gray-200 bg-gray-50/50 hover:border-purple-400 hover:bg-white hover:shadow-lg"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploadedFile && document.getElementById("file-upload-input")?.click()}
        >
          <div className="text-center">
            {uploading ? (
              <div className="py-8">
                <div className="relative mx-auto w-16 h-16 mb-4">
                    <svg className="animate-spin w-full h-full text-purple-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                </div>
                <p className="text-purple-700 font-bold animate-pulse">Analyzing document...</p>
              </div>
            ) : uploadedFile ? (
              <div className="py-4">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-4 animate-fade-in shadow-inner">
                  <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-3 mb-2">
                  <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-bold text-gray-800 text-lg">{uploadedFile.name}</span>
                </div>
                <p className="text-sm text-green-600 font-medium mb-6">Ready for submission</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile();
                  }}
                  className="px-5 py-2.5 text-sm font-semibold text-red-600 hover:text-white hover:bg-red-500 rounded-full transition-all border border-red-200 hover:border-red-500 hover:shadow-md"
                >
                  Remove & Upload Different File
                </button>
              </div>
            ) : (
              <div className="py-6">
                <div className="mx-auto w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <svg className="w-10 h-10 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                </div>
                <p className="text-xl font-bold text-gray-800 mb-2">
                  {isDragging ? "Drop your file here" : "Click to upload or drag & drop"}
                </p>
                <p className="text-gray-500 mb-6 max-w-sm mx-auto">
                    Upload your Job Description (JD) and we'll extract the skills automatically.
                </p>
                <div className="inline-flex gap-2">
                    <span className="px-3 py-1 rounded bg-gray-100 text-xs font-semibold text-gray-500">PDF</span>
                    <span className="px-3 py-1 rounded bg-gray-100 text-xs font-semibold text-gray-500">DOCX</span>
                    <span className="px-3 py-1 rounded bg-gray-100 text-xs font-semibold text-gray-500">XLSX</span>
                </div>
                <input
                  id="file-upload-input"
                  type="file"
                  className="hidden"
                  accept=".pdf,.doc,.docx,.xlsx,.xls"
                  onChange={handleFileInputChange}
                  disabled={uploading}
                />
              </div>
            )}
          </div>
        </div>

        {/* OR Divider */}
        <div className="relative my-10">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="px-6 py-2 bg-white text-gray-400 font-bold text-xs tracking-widest rounded-full border border-gray-100 shadow-sm uppercase">
              Or manually enter details
            </span>
          </div>
        </div>

        {/* Text Input Section - Enhanced */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3 px-1">
            <label className="flex items-center gap-2 text-base font-bold text-gray-800">
               <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
               Requirement Details
            </label>
            {requirementText && (
              <span className={`text-xs font-semibold px-2 py-1 rounded ${wordCount < 10 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                {wordCount} words
              </span>
            )}
          </div>
          <div className="relative">
            <textarea
                value={requirementText}
                onChange={(e) => setRequirementText(e.target.value)}
                placeholder="Describe your ideal trainer:&#10;• Specific technologies (e.g., React, Django, AWS)&#10;• Experience level required&#10;• Location preference&#10;• Training duration"
                className="w-full p-6 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-purple-100 focus:border-purple-400 min-h-[250px] text-base leading-relaxed resize-y transition-all duration-300 shadow-inner bg-gray-50/30"
            />
             <div className="absolute bottom-4 right-4 text-xs text-gray-400 pointer-events-none">Markdown supported</div>
          </div>
          
          <div className="mt-3 flex items-start gap-2 text-sm text-gray-500 px-1">
             <svg className="w-5 h-5 text-purple-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             <p>Tip: The more specific you are about the tech stack and experience, the faster we can match you.</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-100">
             {(requirementText || uploadedFileText) && (
             <button
                onClick={clearAll}
                className="px-6 py-4 text-sm font-bold text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
             >
                Clear Form
             </button>
            )}

            <button
                onClick={handlePostRequirement}
                disabled={posting || (!requirementText.trim() && !hasValidFileRequirements())}
                className={`flex-1 px-8 py-4 rounded-xl font-bold text-lg transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
                !posting && (requirementText.trim() || hasValidFileRequirements())
                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:shadow-purple-500/30 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0" 
                    : "bg-gray-200 text-gray-400 cursor-not-allowed shadow-none"
                }`}
            >
                {posting ? (
                <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>Submitting...</span>
                </>
                ) : posted ? (
                <>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Posted Successfully!</span>
                </>
                ) : (
                <>
                    <span>Submit Requirement</span>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                </>
                )}
            </button>
        </div>

        {/* Success Message */}
        {posted && (
          <div className="mt-8 p-6 bg-green-50 border border-green-200 rounded-2xl animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="p-2 bg-green-100 rounded-full">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h4 className="text-green-800 font-bold text-lg mb-1">Requirement Posted!</h4>
                <p className="text-green-700/80">
                    Your request has been sent to our admins for approval. You can track its status in the "My Requirements" tab.
                </p>
              </div>
              </div>
          </div>
              )}
            </div>
    </div>
  );
}

// Posted Requirements Status Component
function PostedRequirements({ token }) {
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRequirements() {
      try {
        const res = await getCustomerRequirements(token);
        setRequirements(res.requirements || []);
      } catch (err) {
        console.error("Error fetching requirements:", err);
      } finally {
        setLoading(false);
      }
    }
    if (token) {
      fetchRequirements();
      // Refresh every 30 seconds
      const interval = setInterval(fetchRequirements, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700 border border-green-200">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"></path></svg>
            Rejected
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200">
            <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            Pending Review
          </span>
        );
    }
  };

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

  return (
    <div className="w-full max-w-[100rem] mx-auto animate-fade-in pb-12">
      <div className="bg-white rounded-3xl shadow-2xl p-8 md:p-12 border border-gray-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-gray-100">
            <div>
                <h2 className="text-3xl font-bold mb-2 text-gray-800">
                    Posted Requirements
                </h2>
                <p className="text-gray-500">
                    Track the status of your training requests.
                </p>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase text-gray-400">Total:</span>
                <span className="bg-purple-100 text-purple-700 font-bold px-3 py-1 rounded-lg">{requirements.length}</span>
            </div>
        </div>

        {loading ? (
          <div className="text-center py-24">
            <svg className="animate-spin h-12 w-12 text-purple-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-gray-600 font-medium">Syncing your requirements...</p>
          </div>
        ) : requirements.length === 0 ? (
              <div className="text-center py-20 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow-sm mb-4">
                  <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
            <p className="text-gray-900 text-lg font-bold mb-1">No active requirements</p>
            <p className="text-gray-500 text-sm mb-6">You haven't posted any training needs yet.</p>
              </div>
            ) : (
          <div className="grid grid-cols-1 gap-6">
            {requirements.map((req, idx) => (
              <div
                key={req.requirement_id || idx}
                className={`group relative bg-white border rounded-2xl p-6 transition-all duration-300 hover:shadow-xl hover:-translate-y-1 ${
                    req.status === "approved" ? "border-l-4 border-l-green-500 border-gray-200" : 
                    req.status === "rejected" ? "border-l-4 border-l-red-500 border-gray-200" : 
                    "border-l-4 border-l-amber-400 border-gray-200"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 mb-4">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                            <h3 className="text-lg font-bold text-gray-800">Requirement #{requirements.length - idx}</h3>
                            {getStatusBadge(req.status)}
                        </div>
                        
                        <div className="flex items-center gap-4 text-xs font-medium text-gray-500 mb-4">
                            <span className="flex items-center gap-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                                Posted: {formatDate(req.created_at)}
                            </span>
                            {req.updated_at && req.updated_at !== req.created_at && (
                                <span className="flex items-center gap-1">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                                    Updated: {formatDate(req.updated_at)}
                                </span>
                            )}
                        </div>

                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-4 group-hover:bg-white group-hover:border-purple-100 transition-colors">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto custom-scrollbar">
                                {req.requirement_text || <span className="italic text-gray-400">No text description provided</span>}
                            </p>
                        </div>

                {(req.skills && req.skills.length > 0) || req.domain || req.experience_years ? (
                  <div className="flex flex-wrap gap-3">
                    {req.skills && req.skills.length > 0 && (
                        req.skills.map((skill, skillIdx) => (
                              <span 
                                key={skillIdx} 
                                className="px-2.5 py-1 rounded-md text-xs font-bold bg-white border border-gray-200 text-gray-600 shadow-sm"
                              >
                                {skill}
                              </span>
                            ))
                    )}
                    {req.domain && (
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-blue-50 border border-blue-100 text-blue-700">
                          Domain: {req.domain}
                        </span>
                    )}
                    {req.experience_years && (
                        <span className="px-2.5 py-1 rounded-md text-xs font-bold bg-green-50 border border-green-100 text-green-700">
                          {req.experience_years} Yrs Exp
                        </span>
                      )}
                  </div>
                ) : null}
                      </div>
                      
                    {req.admin_notes && (
                    <div className="lg:w-1/3 mt-4 lg:mt-0">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 h-full">
                            <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                                <p className="text-xs font-bold text-yellow-800 uppercase">Admin Feedback</p>
                            </div>
                            <p className="text-sm text-yellow-900 italic">"{req.admin_notes}"</p>
                        </div>
                    </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
    </div>
  );
}