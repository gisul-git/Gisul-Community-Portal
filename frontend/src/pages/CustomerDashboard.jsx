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
  <header className="flex items-center justify-between w-full max-w-7xl bg-white/90 backdrop-blur-xl rounded-full px-6 sm:px-8 py-2 shadow-[0_12px_40px_rgb(0,0,0,0.12)] border border-white/50 transition-all duration-300">
    
    {/* Left: Brand Identity */}
    <div className="flex items-center gap-4 sm:gap-5 pl-1">
      <img 
        src={gisulLogo} 
        alt="GISUL" 
        // CHANGED: Increased height to h-16 (mobile) and h-20 (desktop)
        // 'object-contain' ensures it doesn't get cut off
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

      {/* --- Main Content (Added pt-40 to clear floating navbar) --- */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 md:px-8 pt-40 transition-all duration-300">
        
        {/* Simplified Tab Navigation (Restored from your code) */}
        <div className="bg-white border-b shadow-sm rounded-t-2xl mb-6 sticky top-32 z-40">
          <div className="flex gap-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab("search")}
              className={`relative px-6 py-4 font-semibold text-base transition-colors duration-200 whitespace-nowrap ${
                activeTab === "search"
                  ? "text-purple-600"
                  : "text-gray-600 hover:text-purple-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Trainer Search</span>
              </span>
              {activeTab === "search" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab("post_requirement")}
              className={`relative px-6 py-4 font-semibold text-base transition-colors duration-200 whitespace-nowrap ${
                activeTab === "post_requirement"
                  ? "text-purple-600"
                  : "text-gray-600 hover:text-purple-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span>Post Requirement</span>
              </span>
              {activeTab === "post_requirement" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full"></div>
              )}
            </button>
            <button
              onClick={() => setActiveTab("requirements")}
              className={`relative px-6 py-4 font-semibold text-base transition-colors duration-200 whitespace-nowrap ${
                activeTab === "requirements"
                  ? "text-purple-600"
                  : "text-gray-600 hover:text-purple-600"
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span>My Requirements</span>
              </span>
              {activeTab === "requirements" && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-purple-600 rounded-t-full"></div>
              )}
            </button>
          </div>
        </div>

        <div className={`transition-opacity duration-300 ${activeTab === "search" ? "opacity-100" : "opacity-0 hidden"}`}>
          {activeTab === "search" && <TrainerSearchEngine token={token} />}
        </div>
        <div className={`transition-opacity duration-300 ${activeTab === "post_requirement" ? "opacity-100" : "opacity-0 hidden"}`}>
          {activeTab === "post_requirement" && <RequirementPosting token={token} />}
        </div>
        <div className={`transition-opacity duration-300 ${activeTab === "requirements" ? "opacity-100" : "opacity-0 hidden"}`}>
          {activeTab === "requirements" && <PostedRequirements token={token} />}
        </div>
      </main>
      
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        
        .animate-slide-up {
          animation: slide-up 0.6s ease-out;
        }
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
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    try {
      // Location is now automatically extracted from query text by backend, so pass empty string
      const data = await customerSearchByText(token, searchQuery, "", 50);
      const matches = data.matches || [];
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
      
      // Results are already scrolled to (scrolled when loading started)
    } catch (err) {
      let errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("OpenAI API key error")) {
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
    <div className="w-full max-w-7xl mx-auto animate-fade-in">
      {/* Enhanced Search Bar */}
      <div className="flex flex-col items-center justify-center min-h-[400px] py-8">
        <div className="w-full mb-6">
          <div className="text-center mb-8">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
              Find Your Perfect Trainer
            </h2>
          </div>
          
          <div className="relative max-w-3xl mx-auto">
            {/* Search Icon */}
            <div className={`absolute left-5 top-1/2 transform -translate-y-1/2 transition-colors duration-200 ${isFocused ? "text-purple-600" : "text-gray-400"}`}>
              <svg className="w-6 h-6 sm:w-7 sm:h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              placeholder="Search trainers by skills (e.g., 'etl trainer from bangalore')..."
              className={`w-full pl-14 pr-14 py-5 sm:py-6 text-base sm:text-lg border-2 rounded-full shadow-lg focus:outline-none transition-all duration-300 ${
                isFocused 
                  ? "border-purple-500 shadow-xl ring-4 ring-purple-100" 
                  : "border-gray-300 hover:border-purple-300"
              }`}
              autoFocus
            />
            
            {/* Clear Button */}
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-14 top-1/2 transform -translate-y-1/2 p-2 rounded-full hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
                title="Clear"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            
            {/* Search Button */}
            <button
              onClick={handleSearch}
              disabled={loading || !searchQuery.trim()}
              className={`absolute right-2 top-1/2 transform -translate-y-1/2 px-5 py-3 rounded-full font-semibold transition-all duration-200 flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${
                searchQuery.trim() ? "hover:scale-105 active:scale-95" : ""
              }`}
              style={{ 
                backgroundColor: searchQuery.trim() ? "#6953a3" : "#d1d5db",
                color: "#fff"
              }}
              title="Search"
            >
              {loading ? (
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <span className="hidden sm:inline">Search</span>
                </>
              )}
            </button>
          </div>
          
          {/* Enhanced Helper Text with Examples */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 mb-3">Try searching for:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {["Python developer", "React expert", "etl trainer from bangalore", "data engineer from mumbai"].map((example, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSearchQuery(example);
                    setTimeout(() => handleSearch(), 100);
                  }}
                  className="px-4 py-2 text-xs sm:text-sm bg-white border border-purple-200 rounded-full text-purple-600 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200 shadow-sm hover:shadow-md"
                >
                  {example}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-3">
              Location is automatically extracted from your query (e.g., "from bangalore", "in mumbai")
            </p>
          </div>
        </div>
      </div>

      {/* Loading Animation */}
      {loading && (
        <div ref={resultsRef} className="flex flex-col items-center justify-center py-12 sm:py-16 space-y-4 mt-8">
          {/* Animated Spinner */}
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-purple-200 rounded-full"></div>
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-transparent border-t-purple-600 rounded-full animate-spin absolute top-0 left-0"></div>
            <div className="w-16 h-16 sm:w-20 sm:h-20 border-4 border-transparent border-r-purple-400 rounded-full animate-spin absolute top-0 left-0" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
          </div>
          
          {/* Pulsing Text */}
          <div className="text-center space-y-2">
            <p className="text-lg sm:text-xl font-semibold animate-pulse" style={{ color: "#6953a3" }}>
              Searching for trainers...
            </p>
            <p className="text-sm text-gray-500">
              This may take a few moments
            </p>
          </div>
          
          {/* Animated Dots */}
          <div className="flex space-x-2">
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
            <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
          </div>
        </div>
      )}

      {/* Enhanced Results Section */}
      {!loading && hasSearched && (
        <div ref={resultsRef} id="search-results" className="mt-8 animate-slide-up">
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 border border-gray-100">
            <div className="flex items-center justify-between mb-6 pb-4 border-b-2" style={{ borderColor: "#e5e7eb" }}>
              <div>
                <h3 className="text-2xl sm:text-3xl font-bold mb-1" style={{ color: "#6953a3" }}>
                  Search Results
                </h3>
                <p className="text-gray-600 text-sm sm:text-base">
                  Found <span className="font-semibold text-purple-600">{results.length}</span> {results.length === 1 ? "trainer" : "trainers"} matching your criteria
                </p>
              </div>
              {results.length > 0 && (
                <button
                  onClick={clearSearch}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition"
                >
                  Clear Search
                </button>
              )}
            </div>
            
            {results.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-lg font-medium mb-2">No trainers found</p>
                <p className="text-gray-400 text-sm">Try adjusting your search terms or location</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl shadow-xl border border-gray-200">
                <table className="w-full border-collapse bg-white overflow-hidden">
                  <thead>
                    <tr className="bg-gradient-to-r from-purple-600 via-purple-700 to-purple-800 text-white shadow-lg">
                      <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Name</th>
                      <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Location</th>
                      <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Experience</th>
                      <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Skills</th>
                      <th className="px-4 sm:px-5 py-3 sm:py-4 text-left text-xs sm:text-sm font-bold uppercase tracking-wider">Companies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                {results.filter(trainer => {
                  const name = trainer.name || "";
                  return name.trim() !== "" && name.trim().toLowerCase() !== "n/a";
                }).map((trainer, idx) => (
                      <tr 
                    key={idx} 
                        className={`transition-all duration-200 ${
                          idx % 2 === 0 
                            ? "bg-white hover:bg-purple-50" 
                            : "bg-gray-50 hover:bg-purple-100"
                        }`}
                      >
                        <td className="px-4 sm:px-5 py-3 sm:py-4">
                          <div className="font-bold text-gray-900 text-sm sm:text-base">{trainer.name || "N/A"}</div>
                        </td>
                        <td className="px-4 sm:px-5 py-3 sm:py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>{trainer.location || "N/A"}</span>
                          </div>
                        </td>
                        <td className="px-4 sm:px-5 py-3 sm:py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                            <span className="font-medium">
                              {trainer.experience_years ? `${trainer.experience_years} years` : "N/A"}
                            </span>
                        </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1 max-w-xs relative group">
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
                                          className={`px-2 py-1 rounded text-xs font-medium relative ${
                                            isSearched 
                                              ? "bg-yellow-400 text-yellow-900 font-bold ring-2 ring-yellow-500" 
                                              : "bg-purple-200 text-purple-800"
                                          }`}
                              >
                                {skill}
                                          {isExpanded && (
                                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-white"></span>
                                          )}
                              </span>
                            ))}
                                      
                                      {/* Show unrelated skills count */}
                                      {unrelatedSkills.length > 0 && (
                                        <span 
                                          className="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-600 border border-gray-300"
                                        >
                                          +{unrelatedSkills.length} other{unrelatedSkills.length > 1 ? 's' : ''}
                                        </span>
                                      )}
                                      
                                      {/* Single tooltip for other skills - appears on hover over skills area */}
                                      {unrelatedSkills.length > 0 && (
                                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-[100] min-w-[280px] pointer-events-none">
                                          <div className="bg-white border-2 border-gray-300 rounded-lg py-3 px-4 shadow-xl pointer-events-auto">
                                            <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                                            </svg>
                                              Other Skills
                                          </div>
                                            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                                              {unrelatedSkills.map((skill, idx) => (
                                                <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-700 rounded-md text-xs font-medium border border-gray-200">
                                                {skill}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                        {/* Arrow pointer */}
                                        <div className="absolute top-full left-4 -mt-1 pointer-events-none">
                                          <div className="w-3 h-3 bg-white border-r-2 border-b-2 border-gray-300 transform rotate-45"></div>
                                        </div>
                                      </div>
                                      )}
                                    </>
                                  );
                                })()}
                              </>
                            ) : (
                              <span className="text-xs text-gray-400">N/A</span>
                      )}
                    </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm text-gray-600 max-w-xs truncate">
                            {trainer.companies && trainer.companies.length > 0 
                              ? trainer.companies.slice(0, 2).join(", ") + (trainer.companies.length > 2 ? "..." : "")
                              : "N/A"}
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
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
        
        .animate-slide-up {
          animation: slide-up 0.6s ease-out;
        }
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
    <div className="w-full max-w-6xl mx-auto animate-fade-in">

      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 lg:p-12 border border-gray-100">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br from-purple-500 to-purple-700">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
            Post Your Requirement
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            Upload a JD file or describe your requirements in detail. Your requirement will be sent to admin for approval.
          </p>
        </div>

        {/* File Upload Section - Enhanced */}
        <div 
          className={`mb-8 p-8 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer ${
            isDragging 
              ? "border-purple-500 bg-purple-50 scale-105" 
              : uploadedFile 
                ? "border-green-300 bg-green-50" 
                : "border-purple-300 bg-purple-50/30 hover:border-purple-400 hover:bg-purple-50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !uploadedFile && document.getElementById("file-upload-input")?.click()}
        >
          <div className="text-center">
            {uploading ? (
              <div className="py-8">
                <svg className="animate-spin h-12 w-12 text-purple-600 mx-auto mb-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-purple-600 font-medium">Processing file...</p>
              </div>
            ) : uploadedFile ? (
              <div className="py-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
                  <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex items-center justify-center gap-3 mb-3">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="font-semibold text-gray-800 text-lg">{uploadedFile.name}</span>
                </div>
                <p className="text-sm text-gray-600 mb-4">File uploaded successfully</p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile();
                  }}
                  className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div className="py-8">
                <svg className="mx-auto h-16 w-16 text-purple-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-lg font-semibold text-gray-700 mb-2">
                  {isDragging ? "Drop your file here" : "Drag & drop your JD file here"}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  or <span className="text-purple-600 font-medium">click to browse</span>
                </p>
                <p className="text-xs text-gray-400">
                  Supported formats: PDF, DOC, DOCX, XLSX, XLS
                </p>
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
        <div className="relative my-8">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center">
            <span className="px-6 py-2 bg-white text-gray-500 font-medium text-sm rounded-full border border-gray-200">
              OR ENTER AS TEXT
            </span>
          </div>
        </div>

        {/* Text Input Section - Enhanced */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <label className="block text-base font-semibold" style={{ color: "#6953a3" }}>
              Requirement Details
            </label>
            {requirementText && (
              <span className="text-xs text-gray-500">
                {wordCount} {wordCount === 1 ? "word" : "words"}
              </span>
            )}
          </div>
          <textarea
            value={requirementText}
            onChange={(e) => setRequirementText(e.target.value)}
            placeholder="Example: We need a Senior Python Developer with 5+ years experience in Django, React, and PostgreSQL. Location: Bangalore. Experience with cloud platforms (AWS) is a plus. Must have experience in microservices architecture and database optimization."
            className="w-full p-5 border-2 rounded-xl focus:outline-none focus:ring-4 focus:ring-purple-100 min-h-[250px] text-sm sm:text-base resize-y transition-all duration-200"
            style={{ 
              borderColor: requirementText ? "#6953a3" : "#d1d5db"
            }}
          />
          {requirementText && (
            <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Be specific about skills, experience level, and location for better matches</span>
            </div>
          )}
        </div>

        {/* Clear Button */}
          {(requirementText || uploadedFileText) && (
          <div className="mb-6 flex justify-end">
            <button
              onClick={clearAll}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition whitespace-nowrap"
            >
              Clear All
            </button>
        </div>
        )}

        {/* Post Requirement Button */}
        <button
          onClick={handlePostRequirement}
          disabled={posting || (!requirementText.trim() && !hasValidFileRequirements())}
          className={`w-full px-8 py-4 rounded-xl font-semibold text-base transition-all duration-200 flex items-center justify-center gap-3 shadow-lg ${
            !posting && (requirementText.trim() || hasValidFileRequirements())
              ? "hover:shadow-xl hover:scale-[1.02] active:scale-[0.98]" 
              : ""
          } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
          style={{ 
            backgroundColor: (!requirementText.trim() && !hasValidFileRequirements()) ? "#d1d5db" : "#6953a3",
            color: "#fff"
          }}
        >
          {posting ? (
            <>
              <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Posting requirement...</span>
            </>
          ) : posted ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>Posted Successfully!</span>
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Post Requirement</span>
            </>
          )}
        </button>

        {/* Success Message */}
        {posted && (
          <div className="mt-6 p-4 bg-green-50 border-2 border-green-200 rounded-xl">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-green-800 font-medium">
                Requirement posted successfully! Waiting for admin approval.
                </p>
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
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
            Approved
          </span>
        );
      case "rejected":
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
            Rejected
          </span>
        );
      default:
        return (
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
            Pending
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
    <div className="w-full max-w-6xl mx-auto animate-fade-in">
      <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 md:p-10 lg:p-12 border border-gray-100">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 bg-gradient-to-br from-purple-500 to-purple-700">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3 bg-gradient-to-r from-purple-600 to-purple-800 bg-clip-text text-transparent">
            Posted Requirements
          </h2>
          <p className="text-gray-600 text-base sm:text-lg max-w-2xl mx-auto">
            View the status of your posted requirements
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
        ) : requirements.length === 0 ? (
              <div className="text-center py-16">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-100 mb-4">
                  <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
            <p className="text-gray-500 text-lg font-medium mb-2">No requirements posted yet</p>
            <p className="text-gray-400 text-sm">Post a requirement to see its status here</p>
              </div>
            ) : (
          <div className="space-y-4">
            {requirements.map((req, idx) => (
              <div
                key={req.requirement_id || idx}
                className="border-2 rounded-xl p-6 hover:shadow-lg transition-shadow duration-200"
                style={{ borderColor: req.status === "approved" ? "#10b981" : req.status === "rejected" ? "#ef4444" : "#f59e0b" }}
              >
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                      <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">Requirement #{idx + 1}</h3>
                      {getStatusBadge(req.status)}
                          </div>
                    <p className="text-sm text-gray-500 mb-2">
                      Posted on: {formatDate(req.created_at)}
                    </p>
                    {req.updated_at && req.updated_at !== req.created_at && (
                      <p className="text-sm text-gray-500">
                        Updated on: {formatDate(req.updated_at)}
                      </p>
                        )}
                      </div>
                    </div>
                    
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-700 mb-1">Requirement Text:</p>
                  <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg max-h-32 overflow-y-auto">
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

                {req.admin_notes && (
                  <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs font-semibold text-yellow-800 mb-1">Admin Notes:</p>
                    <p className="text-sm text-yellow-900">{req.admin_notes}</p>
                        </div>
                      )}
                  </div>
                ))}
              </div>
            )}
          </div>
    </div>
  );
}