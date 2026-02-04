import React, { useState, useRef } from "react";
import { searchByJD, uploadJD, searchByText, API_BASE } from "../api";

export default function UnifiedTrainerSearch({ token }) {
  // JD Search state
  const [jdResults, setJdResults] = useState([]);
  const [parsedJD, setParsedJD] = useState(null);
  const [showJdResults, setShowJdResults] = useState(false);
  const [jdLoading, setJdLoading] = useState(false);
  const [topK, setTopK] = useState(10);
  const [jdForm, setJdForm] = useState({
    domain: "",
    experienceYears: "",
    skills: "",
  });
  const [uploadedFileText, setUploadedFileText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Trainer Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [textResults, setTextResults] = useState([]);
  const [textLoading, setTextLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [expandedSkills, setExpandedSkills] = useState({});

  // Common state
  const [selectedTrainers, setSelectedTrainers] = useState(new Set());
  const [activeSearchType, setActiveSearchType] = useState(null); // 'jd' or 'text'
  
  // Ref for scrolling to results area
  const resultsRef = useRef(null);

  // JD Search handlers
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    setUploading(true);
    try {
      const res = await uploadJD(token, file);
      setUploadedFileText(res.jd_text);
      setParsedJD(res.parsed);
      setShowJdResults(false);
      setSelectedTrainers(new Set());
      setUploading(false);
    } catch (err) {
      alert("Error uploading file: " + (err.message || "Unknown error"));
      setUploading(false);
    }
  }

  const handleFormChange = (field, value) => {
    setJdForm((prev) => ({ ...prev, [field]: value }));
    setUploadedFileText("");
    setShowJdResults(false);
    setSelectedTrainers(new Set());
  };

  const buildJDTextFromForm = () => {
    const { domain, experienceYears, skills } = jdForm;
    let text = "";
    if (domain) text += `Domain/Industry: ${domain}\n`;
    if (experienceYears) text += `Experience Required: ${experienceYears} years\n`;
    if (skills) text += `Skills Required: ${skills}\n`;
    return text.trim();
  };

  async function handleJDSearch() {
    const jdTextToUse = uploadedFileText || buildJDTextFromForm();
    
    if (!jdTextToUse.trim()) {
      alert("Please upload a JD file or fill in the JD form (Domain and Skills are required)");
      return;
    }
    
    if (!uploadedFileText) {
      if (!jdForm.domain.trim()) {
        alert("Domain/Industry is required");
        return;
      }
      if (!jdForm.skills.trim()) {
        alert("Skills Required is required");
        return;
      }
    }
    
    setJdLoading(true);
    setActiveSearchType('jd');
    
    // Scroll to results area
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    try {
      const res = await searchByJD(token, jdTextToUse, "", topK);  // Pass empty location for now
      setJdResults(res.matches || []);
      setParsedJD(res.parsed_jd || res.parsed || null);
      setShowJdResults(true);
      setSelectedTrainers(new Set());
      // Clear text search results
      setTextResults([]);
      setHasSearched(false);
    } catch (err) {
      console.error("JD Search error:", err);
      alert("Search failed: " + (err.message || "Unknown error"));
      setJdResults([]);
      setShowJdResults(false);
    } finally {
      setJdLoading(false);
    }
  }

  // Trainer Search handlers
  const handleTextSearch = async () => {
    if (!searchQuery.trim()) {
      alert("Please enter a search query (e.g., 'etl trainer from bangalore')");
      return;
    }
    
    setTextLoading(true);
    setActiveSearchType('text');
    setTextResults([]);
    setHasSearched(false);
    
    // Scroll to results area
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
    
    try {
      // Location is now automatically extracted from query text, so pass empty string
      const data = await searchByText(token, searchQuery, "");
      const matches = data.matches || [];
      // Limit to topK results
      const limitedMatches = matches.slice(0, topK);
      setTextResults(limitedMatches);
      setHasSearched(true);
      setSelectedTrainers(new Set());
      // Clear JD search results
      setJdResults([]);
      setShowJdResults(false);
    } catch (err) {
      let errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("OpenAI API key error")) {
        alert(errorMessage);
      } else if (errorMessage.includes("Search error:")) {
        alert(errorMessage);
      } else {
        alert("Search failed: " + errorMessage);
      }
      setTextResults([]);
      setHasSearched(true);
    } finally {
      setTextLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      if (activeSearchType === 'text' || (!activeSearchType && searchQuery)) {
        handleTextSearch();
      }
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setTextResults([]);
    setHasSearched(false);
    setJdResults([]);
    setShowJdResults(false);
    setSelectedTrainers(new Set());
    setActiveSearchType(null);
  };

  // Common handlers
  function toggleTrainerSelection(identifier) {
    if (!identifier) return;
    const newSelected = new Set(selectedTrainers);
    if (newSelected.has(identifier)) {
      newSelected.delete(identifier);
    } else {
      newSelected.add(identifier);
    }
    setSelectedTrainers(newSelected);
  }

  const truncateText = (text, limit = 120) => {
    if (!text) return "";
    return text.length > limit ? text.slice(0, limit) + "..." : text;
  };

  const toggleSkills = (index) => {
    setExpandedSkills((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const handleDownloadPDF = async (identifier, name) => {
    try {
      if (!identifier) {
        alert("Cannot download PDF: Trainer identifier (email or profile ID) is missing");
        return;
      }
      
      // Try email first, then fallback to profile_id
      const isEmail = identifier.includes("@");
      const endpoint = isEmail 
        ? `${API_BASE}/admin/trainer/${encodeURIComponent(identifier)}/download_pdf`
        : `${API_BASE}/admin/trainer/profile/${encodeURIComponent(identifier)}/download_pdf`;
      
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Failed to download PDF (${response.status})`);
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (name || "resume").replace(/[^a-zA-Z0-9]/g, "_");
      a.download = `${safeName}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert("Error downloading PDF: " + (err.message || "Unknown error"));
      console.error("Download PDF error:", err);
    }
  };

  const handleExportToExcel = async () => {
    if (selectedTrainers.size === 0) {
      alert("Please select at least one trainer");
      return;
    }
    
    try {
      // Separate emails and profile_ids
      const identifiers = Array.from(selectedTrainers);
      const emails = identifiers.filter(id => id && id.includes("@"));
      const profileIds = identifiers.filter(id => id && !id.includes("@"));
      
      const response = await fetch(`${API_BASE}/admin/export_trainers_to_excel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trainer_emails: emails.length > 0 ? emails : undefined,
          trainer_profile_ids: profileIds.length > 0 ? profileIds : undefined,
        }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to export to Excel");
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trainers_export.xlsx";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert("Error exporting to Excel: " + (err.message || "Unknown error"));
    }
  };

  // Get current results based on active search type
  const currentResults = activeSearchType === 'jd' ? jdResults : textResults;
  const isLoading = jdLoading || textLoading;

  return (
    <div className="bg-white p-3 sm:p-4 md:p-6 rounded-lg shadow-md max-w-[1536px] mx-auto">
      <h2 className="text-xl sm:text-2xl font-semibold mb-4 sm:mb-6" style={{ color: "#6953a3" }}>
        Trainer Search
      </h2>

      {/* Number of Trainers to Return - Applies to both searches */}
      <div className="mb-6 p-4 border rounded-lg bg-blue-50 border-blue-200">
        <label className="block text-sm font-semibold mb-2" style={{ color: "#6953a3" }}>
          Number of Trainers to Return
        </label>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          <input
            type="number"
            min="1"
            max="50"
            value={topK}
            onChange={(e) => setTopK(Math.max(1, Math.min(50, parseInt(e.target.value) || 10)))}
            className="w-full sm:w-32 p-2 border rounded-md focus:outline-none focus:ring-2 text-sm"
            style={{ focusRingColor: "#6953a3" }}
          />
          <span className="text-xs sm:text-sm text-gray-600">(e.g., top 5 or 10)</span>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          This setting applies to both JD Search and Trainer Search Engine results
        </p>
      </div>

      {/* Search Sections - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* JD Search Section */}
      <div className="p-5 sm:p-6 border-2 rounded-xl bg-gradient-to-br from-gray-50 to-purple-50/30 border-purple-200 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 rounded-lg bg-purple-100">
            <svg className="w-5 h-5" style={{ color: "#6953a3" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h3 className="text-lg sm:text-xl font-bold" style={{ color: "#6953a3" }}>
            Job Description Search
          </h3>
        </div>
        
        {/* File Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-3 text-gray-700">
            📄 Upload JD File
          </label>
          <div className="relative">
            <div className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 ${
              uploading ? 'border-purple-400 bg-purple-50' : uploadedFileText ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-purple-400 hover:bg-purple-50/50'
            }`}>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx"
                onChange={handleFileUpload}
                disabled={uploading || jdLoading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                id="jd-file-upload"
              />
              <div className="pointer-events-none">
                <svg className="w-12 h-12 mx-auto mb-3" style={{ color: "#6953a3" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {uploading ? (
                  <div>
                    <p className="text-sm font-medium text-purple-700 mb-1">Processing file...</p>
                    <div className="w-32 h-1 bg-purple-200 rounded-full mx-auto overflow-hidden">
                      <div className="h-full bg-purple-600 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                ) : uploadedFileText ? (
                  <div>
                    <p className="text-sm font-medium text-green-700 mb-1">✓ File processed successfully</p>
                    <p className="text-xs text-green-600">Ready to search</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm font-medium text-gray-700 mb-1">Click to upload or drag and drop</p>
                    <p className="text-xs text-gray-500">PDF, DOC, DOCX, XLS, XLSX</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="flex items-center mb-6">
          <div className="flex-1 border-t border-gray-300"></div>
          <span className="px-3 text-xs font-medium text-gray-500 uppercase">OR</span>
          <div className="flex-1 border-t border-gray-300"></div>
        </div>

        {/* Form Section */}
        <div className="mb-6">
          <label className="block text-sm font-semibold mb-4 text-gray-700 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Fill in Job Description Form
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-2 text-gray-700">
                Domain/Industry <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={jdForm.domain}
                  onChange={(e) => handleFormChange("domain", e.target.value)}
                  placeholder="e.g., Software Development, Data Science"
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm transition-all"
                  style={{ focusRingColor: "#6953a3", focusBorderColor: "#6953a3" }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-2 text-gray-700">
                Experience Required (Years)
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <input
                  type="number"
                  value={jdForm.experienceYears}
                  onChange={(e) => handleFormChange("experienceYears", e.target.value)}
                  placeholder="e.g., 3"
                  min="0"
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm transition-all"
                  style={{ focusRingColor: "#6953a3", focusBorderColor: "#6953a3" }}
                />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold mb-2 text-gray-700">
                Skills Required (comma-separated) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute top-3 left-3 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={jdForm.skills}
                  onChange={(e) => handleFormChange("skills", e.target.value)}
                  placeholder="e.g., Python, Docker, Kubernetes, AWS"
                  className="w-full pl-10 pr-4 py-2.5 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent text-sm transition-all"
                  style={{ focusRingColor: "#6953a3", focusBorderColor: "#6953a3" }}
                />
              </div>
            </div>
          </div>
        </div>

        {parsedJD && (
          <div className="mb-6 p-4 border-2 border-blue-200 rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 shadow-sm">
            <h4 className="font-bold mb-3 text-sm flex items-center gap-2" style={{ color: "#6953a3" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Parsed JD Information
            </h4>
            <div className="space-y-2">
              {parsedJD.skills && parsedJD.skills.length > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Skills:</span>
                  <span className="text-xs sm:text-sm text-gray-800">{parsedJD.skills.join(", ")}</span>
                </div>
              )}
              {parsedJD.experience_years && (
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Experience:</span>
                  <span className="text-xs sm:text-sm text-gray-800">{parsedJD.experience_years} years</span>
                </div>
              )}
              {parsedJD.domain && (
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-gray-600 min-w-[80px]">Domain:</span>
                  <span className="text-xs sm:text-sm text-gray-800">{parsedJD.domain}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="flex justify-center sm:justify-start">
          <button
            onClick={handleJDSearch}
            disabled={jdLoading || uploading || (!uploadedFileText && !buildJDTextFromForm().trim())}
            className="group relative px-6 sm:px-8 py-3 sm:py-3.5 rounded-lg font-semibold text-sm sm:text-base text-white transition-all duration-200 transform hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:shadow-none flex items-center gap-2"
            style={{ backgroundColor: "#6953a3" }}
            title={uploading ? "Please wait for file processing to complete" : (!uploadedFileText && !buildJDTextFromForm().trim()) ? "Please upload a JD file or fill in the form" : ""}
          >
            {jdLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Searching...</span>
              </>
            ) : uploading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processing file...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <span>Search by JD</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Trainer Search Engine Section - Google Style */}
      <div className="flex flex-col items-center justify-center min-h-[500px] py-12 px-4 bg-white">
        {/* Logo/Title - Google Style */}
        <div className="mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg className="w-10 h-10" style={{ color: "#6953a3" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h1 className="text-5xl sm:text-6xl font-light text-gray-900" style={{ fontFamily: 'Arial, sans-serif', letterSpacing: '-2px' }}>
              Trainer Search
            </h1>
          </div>
        </div>

        {/* Google-style Search Box */}
        <div className="w-full max-w-2xl mb-8">
          <div className="relative group">
            {/* Search Icon */}
            <div className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none z-10">
              <svg className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            {/* Main Search Input - Google-style rounded */}
            <input
              type="text"
              placeholder="Search trainers by skills, location or both"
              className="w-full pl-14 pr-12 py-3.5 text-base border border-gray-300 rounded-full shadow-sm hover:shadow-md focus:outline-none focus:shadow-lg focus:border-gray-400 transition-all duration-200 bg-white"
              style={{ 
                fontFamily: 'Arial, sans-serif',
                fontSize: '16px'
              }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            
            {/* Clear Icon (when there's text) - Google style */}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 transform -translate-y-1/2 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
                aria-label="Clear search"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Google-style Search Buttons */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={handleTextSearch}
            disabled={textLoading || !searchQuery.trim()}
            className="px-6 py-2.5 bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-300 text-sm text-gray-700 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            {textLoading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Searching...
              </span>
            ) : (
              'Trainer Search'
            )}
          </button>
          <button
            onClick={handleClear}
            disabled={isLoading || (!searchQuery && !hasSearched)}
            className="px-6 py-2.5 bg-gray-50 hover:bg-gray-100 border border-transparent hover:border-gray-300 text-sm text-gray-700 rounded-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            Clear
          </button>
        </div>

        {/* Subtle tip text - Google style */}
        <div className="text-sm text-gray-500 text-center max-w-xl">
          <p>Search by skills, location or both (e.g., "etl trainer from bangalore")</p>
        </div>
      </div>
      </div>

      {/* Results Section */}
      {selectedTrainers.size > 0 && (
        <div className="mb-4 p-2 sm:p-3 rounded-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2" style={{ backgroundColor: "#f4e403" }}>
          <span className="font-semibold text-black text-xs sm:text-sm">
            {selectedTrainers.size} trainer(s) selected
          </span>
          <button
            onClick={handleExportToExcel}
            className="px-3 sm:px-4 py-2 rounded-lg text-white font-semibold transition hover:opacity-90 text-xs sm:text-sm whitespace-nowrap"
            style={{ backgroundColor: "#6953a3" }}
          >
            Export to Excel
          </button>
        </div>
      )}

      {isLoading && (
        <div ref={resultsRef} className="flex flex-col items-center justify-center py-12 sm:py-16 space-y-4">
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

      {!isLoading && hasSearched && currentResults.length === 0 && activeSearchType === 'text' && (
        <div className="text-center py-8">
          <p className="text-gray-500 mb-2">No matching trainers found. Try a different search query.</p>
        </div>
      )}

      {!isLoading && showJdResults && currentResults.length === 0 && activeSearchType === 'jd' && (
        <div className="text-center py-8">
          <p className="text-gray-500">No matches found</p>
        </div>
      )}

      {!isLoading && !hasSearched && !showJdResults && currentResults.length === 0 && (
        <div className="text-center py-8">
          <p className="text-gray-500">Enter a search query above to find trainers.</p>
        </div>
      )}

      {!isLoading && currentResults.length > 0 && (
        <div ref={resultsRef}>
          {(() => {
        const filteredResults = currentResults.filter(r => {
          const name = r.name || "";
          return true; // Keep all trainers, even with N/A names
        });
        return filteredResults.length > 0 ? (
          <div className="space-y-3 sm:space-y-4">
            <div className="mb-4">
              <p className="text-xs sm:text-sm text-gray-600 mb-3">
                Showing {filteredResults.length} matching trainer(s) {filteredResults.length === topK && `(showing top ${topK} results)`}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filteredResults.length > 0 && filteredResults.every(r => selectedTrainers.has(r.email || r.profile_id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      // Select all
                      const allIds = new Set(filteredResults.map(r => r.email || r.profile_id));
                      setSelectedTrainers(allIds);
                    } else {
                      // Deselect all
                      const filteredIds = new Set(filteredResults.map(r => r.email || r.profile_id));
                      const newSelected = new Set(selectedTrainers);
                      filteredIds.forEach(id => newSelected.delete(id));
                      setSelectedTrainers(newSelected);
                    }
                  }}
                  className="w-4 h-4 sm:w-5 sm:h-5 cursor-pointer"
                  title="Select All"
                />
                <label className="text-xs sm:text-sm text-gray-700 font-medium cursor-pointer" onClick={() => {
                  const allSelected = filteredResults.every(r => selectedTrainers.has(r.email || r.profile_id));
                  if (allSelected) {
                    // Deselect all
                    const filteredIds = new Set(filteredResults.map(r => r.email || r.profile_id));
                    const newSelected = new Set(selectedTrainers);
                    filteredIds.forEach(id => newSelected.delete(id));
                    setSelectedTrainers(newSelected);
                  } else {
                    // Select all
                    const allIds = new Set(filteredResults.map(r => r.email || r.profile_id));
                    setSelectedTrainers(allIds);
                  }
                }}>
                  Select All
                </label>
              </div>
            </div>
            {filteredResults.map((r, i) => (
            <div
              key={i}
              className={`p-4 sm:p-5 border rounded-lg transition-all duration-200 ${
                selectedTrainers.has(r.email || r.profile_id)
                  ? "bg-purple-50 border-purple-400 shadow-md"
                  : "bg-white hover:bg-purple-50 border-gray-300 hover:border-purple-400"
              }`}
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-start justify-between gap-3">
                <div className="flex-1 w-full min-w-0">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2">
                    <input
                      type="checkbox"
                      checked={selectedTrainers.has(r.email || r.profile_id)}
                      onChange={() => toggleTrainerSelection(r.email || r.profile_id)}
                      className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0"
                    />
                    <div className="font-semibold text-base sm:text-lg break-words" style={{ color: "#6953a3" }}>
                      {r.name || "Unknown Trainer"}
                    </div>
                  </div>
                  {r.email && r.email.trim() && (
                    <div className="text-xs sm:text-sm text-gray-600 mb-2 break-words">
                      <span className="font-semibold">Email:</span> {r.email}
                    </div>
                  )}
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:gap-3 mt-2">
                    <div className="text-xs sm:text-sm text-gray-700">
                      <span className="font-semibold">Phone:</span> {r.phone && r.phone.trim() ? r.phone : "N/A"}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-700">
                      <span className="font-semibold">Location:</span> {r.location && r.location.trim() ? r.location : "N/A"}
                    </div>
                  </div>
                  {(() => {
                    if (r.skills && r.skills.length > 0) {
                      const skillsText = r.skills.join(", ");
                      const isExpanded = expandedSkills[i];
                      const shouldTruncate = skillsText.length > 120;
                      return (
                        <div className="text-xs sm:text-sm mt-2 break-words">
                          <span className="font-semibold">Skills: </span>
                          <span className="text-gray-700">
                            {isExpanded || !shouldTruncate ? skillsText : truncateText(skillsText, 120)}
                          </span>
                          {shouldTruncate && (
                            <button
                              onClick={() => toggleSkills(i)}
                              className="text-indigo-600 text-sm ml-2 hover:underline font-medium"
                              style={{ color: "#6953a3" }}
                            >
                              {isExpanded ? "View Less" : "View More"}
                            </button>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-xs sm:text-sm mt-2 break-words">
                          <span className="font-semibold">Skills: </span>
                          <span className="text-gray-700">N/A</span>
                        </div>
                      );
                    }
                  })()}
                  <div className="text-xs sm:text-sm mt-1">
                    <span className="font-semibold">Experience: </span>
                    <span className="text-gray-700">
                      {r.experience_years ? `${r.experience_years} years` : "N/A"}
                    </span>
                  </div>
                  {r.education && (
                    <div className="text-xs sm:text-sm mt-1 break-words">
                      <span className="font-semibold">Education: </span>
                      <span className="text-gray-700">
                        {typeof r.education === 'string' ? (
                          r.education
                        ) : Array.isArray(r.education) ? (
                          r.education.map((edu, idx) => 
                            typeof edu === 'string' ? edu : 
                            `${edu.degree || ''}${edu.institution ? ` from ${edu.institution}` : ''}${edu.year ? ` (${edu.year})` : ''}`
                          ).filter(Boolean).join(', ')
                        ) : typeof r.education === 'object' ? (
                          <>
                            {r.education.degree && <span className="font-medium">{r.education.degree}</span>}
                            {r.education.institution && <span className="ml-2">from {r.education.institution}</span>}
                            {(r.education.year || r.education.duration) && <span className="ml-2 text-gray-600">({r.education.year || r.education.duration})</span>}
                            {r.education.CGPA && <span className="ml-2 text-gray-600">- CGPA: {r.education.CGPA}</span>}
                          </>
                        ) : (
                          String(r.education)
                        )}
                      </span>
                    </div>
                  )}
                  {r.certifications && r.certifications.length > 0 && (
                    <div className="text-xs sm:text-sm mt-1 break-words">
                      <span className="font-semibold">Certifications: </span>
                      <span className="text-gray-700">{r.certifications.join(", ")}</span>
                    </div>
                  )}
                  <div className="text-xs sm:text-sm mt-1 break-words">
                    <span className="font-semibold">Current Company: </span>
                    <span className="text-gray-700">{r.current_company || "N/A"}</span>
                  </div>
                  <div className="text-xs sm:text-sm mt-1 break-words">
                    <span className="font-semibold">Companies Worked: </span>
                    <span className="text-gray-700">
                      {r.companies && r.companies.length > 0 ? r.companies.join(", ") : "N/A"}
                    </span>
                  </div>
                  {r.clients && r.clients.length > 0 && (
                    <div className="text-xs sm:text-sm mt-1 break-words">
                      <span className="font-semibold">Clients: </span>
                      <span className="text-gray-700">{r.clients.join(", ")}</span>
                    </div>
                  )}
                </div>
                <div className="mt-3 sm:mt-0 sm:ml-4 flex-shrink-0 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  {(r.email || r.profile_id) && (
                    <button
                      onClick={() => handleDownloadPDF(r.email || r.profile_id, r.name)}
                      className="px-2 sm:px-3 py-1 rounded-lg text-white text-xs font-semibold transition hover:opacity-90 whitespace-nowrap"
                      style={{ backgroundColor: "#e11d48" }}
                      title="Download PDF"
                    >
                      <span className="hidden sm:inline">Download PDF</span>
                      <span className="sm:hidden">PDF</span>
                    </button>
                  )}
                  <div
                    className="px-2 sm:px-3 py-1 rounded text-xs sm:text-sm font-semibold text-center text-white"
                    style={{ backgroundColor: "#6953a3" }}
                    title={`Match score: ${(r.score || r.match_score || r.match_percentage !== undefined ? (r.match_percentage / 100) : 0).toFixed(3)}`}
                  >
                    {r.match_percentage !== undefined 
                      ? `${r.match_percentage}% Match`
                      : `${Math.round((r.score || r.match_score || 0) * 100)}% Match`}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

