import React, { useState, useRef } from "react";
import { searchByJD, uploadJD, searchByText, API_BASE } from "../api";

export default function UnifiedTrainerSearch({ token }) {
  // JD Search state
  const [jdResults, setJdResults] = useState([]);
  const [parsedJD, setParsedJD] = useState(null);
  const [showJdResults, setShowJdResults] = useState(false);
  const [jdLoading, setJdLoading] = useState(false);
  const [topK, _setTopK] = useState(10);
  const [jdForm, setJdForm] = useState({
    domain: "",
    experienceYears: "",
    skills: "",
  });
  const [uploadedFileText, setUploadedFileText] = useState("");
  const [uploading, setUploading] = useState(false);

  // Trainer Search state
  const [searchQuery, setSearchQuery] = useState("");
 // const [locationQuery, setLocationQuery] = useState("");
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
      const res = await searchByJD(token, jdTextToUse, "", topK); 
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

  // const truncateText = (text, limit = 120) => {
  //   if (!text) return "";
  //   return text.length > limit ? text.slice(0, limit) + "..." : text;
  // };

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
    <div className="bg-[#f8fafc] min-h-screen p-4 sm:p-6 md:p-10 font-sans">
      <div className="max-w-[1600px] mx-auto">
        
        {/* Modern Header Section */}
        <div className="flex flex-col lg:flex-row justify-between items-center mb-10 gap-6">
          <div className="text-center lg:text-left">
            <h2 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
              Trainer<span className="text-[#6953a3]"> Search</span>
            </h2>
    
          </div>

          {/* Integrated Config Card */}
        </div>

        {/* Action Panels */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 mb-12">
          
          {/* JD Matching Panel */}
          <div className="xl:col-span-5">
            <div className="bg-white rounded-[40px] p-8 md:p-10 shadow-[0_20px_50px_rgba(105,83,163,0.03)] border border-purple-50 h-full flex flex-col relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-40 h-40 bg-purple-50/50 rounded-full -mr-20 -mt-20 group-hover:scale-110 transition-transform duration-700"></div>
              
              <div className="flex items-center gap-4 mb-10 relative">
                <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center text-[#6953a3]">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-gray-800">JD Semantic Match</h3>
              </div>

              {/* Upload Dropzone */}
              <div className="relative mb-8 group/upload">
                <input
                  type="file"
                  accept=".pdf,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileUpload}
                  disabled={uploading || jdLoading}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                />
                <div className={`border-4 border-dashed rounded-[32px] p-10 text-center transition-all duration-500 ${
                  uploadedFileText ? 'border-green-400 bg-green-50/30' : 'border-purple-100 bg-purple-50/20 group-hover/upload:border-purple-300'
                }`}>
                  <div className={`w-16 h-16 rounded-[24px] mx-auto mb-4 flex items-center justify-center transition-all ${uploadedFileText ? 'bg-green-100' : 'bg-purple-100'}`}>
                    <svg className="w-8 h-8" style={{ color: uploadedFileText ? '#10b981' : "#6953a3" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-gray-800 mb-1">{uploadedFileText ? 'JD Attached' : 'Drop JD Here'}</p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">PDF • Word • Excel</p>
                </div>
              </div>

              {/* Form Input */}
              <div className="space-y-4 mb-8 flex-1">
                <div className="relative">
                  <input
                    placeholder="Domain / Industry *"
                    value={jdForm.domain}
                    onChange={(e) => handleFormChange("domain", e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-100 transition-all outline-none text-sm font-bold"
                  />
                  <div className="absolute right-4 top-4 text-gray-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg></div>
                </div>
                <div className="relative">
                  <input
                    placeholder="Key Skills *"
                    value={jdForm.skills}
                    onChange={(e) => handleFormChange("skills", e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-100 transition-all outline-none text-sm font-bold"
                  />
                  <div className="absolute right-4 top-4 text-gray-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg></div>
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="Years of Exp"
                    value={jdForm.experienceYears}
                    onChange={(e) => handleFormChange("experienceYears", e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl bg-gray-50 border-2 border-transparent focus:bg-white focus:border-purple-100 transition-all outline-none text-sm font-bold"
                  />
                  <div className="absolute right-4 top-4 text-gray-300"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div>
                </div>
              </div>

              <button
                onClick={handleJDSearch}
                disabled={jdLoading || uploading || (!uploadedFileText && !buildJDTextFromForm().trim())}
                className="w-full py-5 rounded-[24px] text-white font-black text-lg shadow-xl shadow-purple-100 hover:shadow-purple-200 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ backgroundColor: "#6953a3" }}
              >
                {jdLoading ? 'Analyzing...' : 'Search by JD Match'}
              </button>

              {parsedJD && (
                <div className="mt-8 p-6 rounded-[28px] bg-gradient-to-br from-blue-50/50 to-purple-50/50 border border-blue-100/50">
                  <p className="text-[10px] font-black text-[#6953a3] uppercase tracking-widest mb-3">AI Intelligence Extraction</p>
                  {parsedJD.skills && <p className="text-xs font-bold text-gray-700 leading-relaxed mb-1"><span className="opacity-50 uppercase mr-2">Skills:</span> {parsedJD.skills.join(", ")}</p>}
                  {parsedJD.experience_years && <p className="text-xs font-bold text-gray-700"><span className="opacity-50 uppercase mr-2">Tenure:</span> {parsedJD.experience_years} Years</p>}
                </div>
              )}
            </div>
          </div>

          {/* Search Engine Panel */}
          <div className="xl:col-span-7">
            <div className="h-full bg-white rounded-[40px] p-12 md:p-20 shadow-[0_20px_50px_rgba(105,83,163,0.03)] border border-purple-50 flex flex-col justify-center items-center text-center relative overflow-hidden">
              <div className="absolute bottom-0 left-0 w-full h-2 bg-gradient-to-r from-[#6953a3] via-purple-300 to-[#f4e403]"></div>
              
              <div className="max-w-2xl w-full z-10">
                <div className="w-24 h-24 bg-[#f4e403]/10 rounded-[32px] flex items-center justify-center mx-auto mb-10 transform rotate-12 shadow-xl shadow-yellow-50/50">
                   <svg className="w-12 h-12 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                   </svg>
                </div>
                
                <h2 className="text-6xl font-black text-gray-900 mb-4 tracking-tighter uppercase">Trainer Search</h2>
                <p className="text-gray-400 font-bold text-xl mb-12 leading-relaxed">Discover experts using semantic natural language context.</p>

                <div className="relative group mb-10">
                  <input
                    type="text"
                    placeholder="Search e.g. 'React trainer from Bangalore'..."
                    className="w-full pl-10 pr-48 py-9 rounded-[40px] bg-gray-50 border-4 border-transparent focus:bg-white focus:border-purple-50 transition-all outline-none text-2xl font-bold shadow-inner placeholder-gray-300"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={handleKeyPress}
                  />
                  <button
                    onClick={handleTextSearch}
                    disabled={textLoading || !searchQuery.trim()}
                    className="absolute right-4 top-4 bottom-4 px-12 rounded-[32px] text-white font-black text-xl transition-all active:scale-[0.95] shadow-xl shadow-purple-100"
                    style={{ backgroundColor: "#6953a3" }}
                  >
                    {textLoading ? '...' : 'Search'}
                  </button>
                </div>

                <div className="flex flex-wrap justify-center gap-3">
                  {['SAP HANA', 'NodeJS Expert', 'Soft Skills', 'DevOps'].map(tag => (
                    <button 
                      key={tag} 
                      onClick={() => setSearchQuery(tag)}
                      className="px-5 py-2.5 bg-gray-50 text-gray-500 rounded-full text-xs font-black hover:bg-[#6953a3] hover:text-white transition-all border border-gray-100 uppercase tracking-widest shadow-sm"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Global Toolbar for Selection and Actions (Sticky) */}
        {(currentResults.length > 0 || isLoading) && (
          <div ref={resultsRef} className="sticky top-6 z-50 mb-12">
            <div className="bg-white/95 backdrop-blur-2xl px-12 py-8 rounded-[48px] shadow-[0_30px_90px_rgba(0,0,0,0.12)] border border-white/50 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex items-center gap-6">
                <div className="w-16 h-16 rounded-3xl bg-purple-50 flex items-center justify-center text-[#6953a3] shadow-inner relative overflow-hidden">
                  <svg className="w-8 h-8 relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                </div>
                <div>
                  <p className="font-black text-gray-900 text-3xl leading-none mb-1 uppercase tracking-tighter">Expert Discovery</p>
                  {!isLoading && <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.4em]">Optimized Cluster Ranking</p>}
                </div>
              </div>

              {!isLoading && (
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-4 bg-gray-50 px-8 py-5 rounded-3xl border border-gray-100 shadow-inner group/select">
                    <input
                      type="checkbox"
                      checked={currentResults.length > 0 && currentResults.every(r => selectedTrainers.has(r.email || r.profile_id))}
                      onChange={(e) => {
                        const allIds = new Set(selectedTrainers);
                        if (e.target.checked) currentResults.forEach(r => allIds.add(r.email || r.profile_id));
                        else currentResults.forEach(r => allIds.delete(r.email || r.profile_id));
                        setSelectedTrainers(allIds);
                      }}
                      className="w-6 h-6 rounded-lg border-2 border-gray-200 accent-[#6953a3] cursor-pointer"
                      id="select-all-master"
                    />
                    <label htmlFor="select-all-master" className="text-xs font-black text-gray-400 uppercase tracking-widest cursor-pointer select-none group-hover/select:text-gray-600 transition-colors">Global Select</label>
                  </div>

                  {selectedTrainers.size > 0 && (
                    <div className="flex items-center gap-5 animate-in fade-in slide-in-from-right-10 duration-700">
                      <div className="px-10 py-5 rounded-[24px] font-black text-sm shadow-2xl shadow-yellow-100/50" style={{ backgroundColor: "#f4e403" }}>
                        {selectedTrainers.size} TRAINERS
                      </div>
                      <button 
                        onClick={handleExportToExcel}
                        className="px-12 py-5 rounded-[24px] text-white font-black text-sm transition-all hover:opacity-90 active:scale-95 shadow-2xl shadow-purple-200"
                        style={{ backgroundColor: "#6953a3" }}
                      >
                        EXPORT XLSX
                      </button>
                    </div>
                  )}
                  
                  <button onClick={handleClear} className="p-5 text-gray-200 hover:text-red-500 transition-all hover:rotate-90">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Result States (Every Original Detail Maintained) */}
        {!isLoading && hasSearched && currentResults.length === 0 && activeSearchType === 'text' && (
          <div className="text-center py-40 bg-white rounded-[64px] border-8 border-dashed border-gray-50/50 shadow-inner">
             <div className="w-28 h-28 bg-gray-50 rounded-[48px] flex items-center justify-center mx-auto mb-10 shadow-inner">
                <svg className="w-14 h-14 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
             </div>
             <p className="text-4xl font-black text-gray-300 tracking-tighter mb-4 uppercase">Zero Neural Hits</p>
             <p className="text-gray-400 font-bold text-sm uppercase tracking-[0.4em] mb-12">Search query yielded no matches.</p>
             <button onClick={handleClear} className="px-14 py-6 bg-[#6953a3] text-white font-black rounded-3xl text-xs tracking-[0.4em] shadow-2xl shadow-purple-200 transition-all active:scale-95">FLUSH ENGINE</button>
          </div>
        )}

        {!isLoading && showJdResults && currentResults.length === 0 && activeSearchType === 'jd' && (
          <div className="text-center py-40 bg-white rounded-[64px] border-8 border-dashed border-gray-50/50 shadow-inner">
             <div className="w-28 h-28 bg-gray-50 rounded-[48px] flex items-center justify-center mx-auto mb-10 shadow-inner">
                <svg className="w-14 h-14 text-gray-200/40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             </div>
             <p className="text-4xl font-black text-gray-300 tracking-tighter mb-4 uppercase">No matches found</p>
             <p className="text-gray-400 font-bold text-sm uppercase tracking-[0.4em]">The JD parameters do not correlate with existing trainer nodes.</p>
          </div>
        )}

        {!isLoading && !hasSearched && !showJdResults && currentResults.length === 0 && (
          <div className="text-center py-20 border-4 border-dashed border-purple-100 rounded-[56px] bg-[#6953a3]/[0.01]">
             <p className="text-gray-300 font-black uppercase text-xs tracking-[0.4em] px-10 leading-loose opacity-60">Initialize Neural Discovery or analyze a JD to view matches</p>
          </div>
        )}

        {/* Profiles Result Grid */}
        {!isLoading && currentResults.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-12 pb-32">
            {currentResults.map((trainer, i) => {
              const identifier = trainer.email || trainer.profile_id;
              const isSelected = selectedTrainers.has(identifier);
              const score = trainer.match_percentage !== undefined 
                ? trainer.match_percentage 
                : Math.round((trainer.score || trainer.match_score || 0) * 100);

              return (
                <div 
                  key={i}
                  onClick={() => toggleTrainerSelection(identifier)}
                  className={`group bg-white rounded-[64px] p-10 border-4 transition-all duration-500 cursor-pointer relative flex flex-col ${
                    isSelected 
                    ? 'border-[#6953a3] shadow-[0_40px_100px_rgba(105,83,163,0.18)] scale-[1.03] z-10 bg-purple-50/[0.04]' 
                    : 'border-transparent shadow-[0_20px_60px_rgba(0,0,0,0.03)] hover:shadow-[0_35px_80px_rgba(0,0,0,0.08)] hover:-translate-y-4'
                  }`}
                >
                  <div className="absolute top-0 right-0 px-10 py-5 rounded-bl-[40px] font-black text-xs text-white z-20 shadow-xl" style={{ backgroundColor: "#6953a3" }}>
                     {score}% SIMILARITY
                  </div>

                  <div className="flex items-center gap-8 mb-12">
                    <div className="w-24 h-24 rounded-[36px] bg-purple-50 flex items-center justify-center text-[#6953a3] font-black text-4xl shadow-inner group-hover:scale-110 transition-transform duration-500">
                      {trainer.name?.[0] || 'T'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="font-black text-gray-900 text-3xl leading-none mb-3 truncate tracking-tighter uppercase">
                        {trainer.name || "Anonymous"}
                      </h4>
                      <p className="text-gray-400 text-[10px] font-black tracking-[0.35em] flex items-center gap-3 uppercase">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/></svg>
                        {trainer.location && trainer.location.trim() ? trainer.location : "Global Remote"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-10 flex-1">
                    {trainer.email && (
                      <div className="text-xs sm:text-sm text-gray-600 mb-2 break-words leading-relaxed">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Expert Identifier</p>
                        <p className="font-bold text-gray-700">{trainer.email}</p>
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between items-center mb-5">
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Neural Tech Matrix</p>
                        {trainer.skills && trainer.skills.join(", ").length > 120 && (
                          <button onClick={(e) => { e.stopPropagation(); toggleSkills(i); }} className="text-[11px] font-black text-[#6953a3] underline underline-offset-4 tracking-widest uppercase">
                            {expandedSkills[i] ? 'MINIMIZE' : 'EXPAND'}
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {trainer.skills && trainer.skills.length > 0 ? (
                          (expandedSkills[i] ? trainer.skills : trainer.skills.slice(0, 6)).map((skill, idx) => (
                            <span key={idx} className="px-5 py-2.5 bg-gray-50 text-gray-500 rounded-2xl text-[11px] font-black border border-gray-100 group-hover:bg-white group-hover:border-purple-200 transition-all uppercase tracking-wide">
                              {skill}
                            </span>
                          ))
                        ) : <span className="text-xs text-gray-300 font-bold italic tracking-wider">No Competency Hub Found</span>}
                        {(!expandedSkills[i] && trainer.skills?.length > 6) && <span className="text-[11px] font-black text-[#6953a3] py-2.5 opacity-60">+{trainer.skills.length - 6} MORE</span>}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 pt-10 border-t border-gray-50">
                      <div className="bg-gray-50/70 rounded-[32px] p-6 group-hover:bg-white transition-colors border border-gray-100/50 flex flex-col items-center">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-3 text-center">Tenure</p>
                        <p className="text-2xl font-black text-gray-800 tracking-tighter">{trainer.experience_years ? `${trainer.experience_years} Years` : 'N/A'}</p>
                      </div>
                      <div className="bg-gray-50/70 rounded-[32px] p-6 group-hover:bg-white transition-colors border border-gray-100/50 flex flex-col items-center">
                        <p className="text-[9px] font-black text-gray-300 uppercase tracking-widest mb-3 text-center">Unit</p>
                        <p className="text-lg font-black text-gray-800 truncate tracking-tight w-full text-center">{trainer.current_company || 'N/A'}</p>
                      </div>
                    </div>

                    {trainer.education && (
                      <div className="px-2">
                        <p className="text-[10px] text-gray-300 font-black uppercase tracking-[0.2em] mb-4">Academic Background</p>
                        <div className="text-xs font-bold text-gray-500 italic leading-relaxed break-words opacity-80">
                          {typeof trainer.education === 'string' ? (
                            trainer.education
                          ) : Array.isArray(trainer.education) ? (
                            trainer.education.map((edu) => 
                              typeof edu === 'string' ? edu : 
                              `${edu.degree || ''}${edu.institution ? ` from ${edu.institution}` : ''}`
                            ).filter(Boolean).join(', ')
                          ) : typeof trainer.education === 'object' ? (
                            <>
                              {trainer.education.degree && <span className="font-bold">{trainer.education.degree}</span>}
                              {trainer.education.institution && <span className="ml-1 opacity-70">@{trainer.education.institution}</span>}
                            </>
                          ) : String(trainer.education)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="mt-12 flex gap-5 relative z-10">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDownloadPDF(identifier, trainer.name); }}
                      className="flex-1 py-7 rounded-[32px] bg-red-50 text-red-500 text-[10px] font-black tracking-[0.3em] transition-all hover:bg-red-500 hover:text-white shadow-xl shadow-red-50 hover:shadow-none uppercase"
                    >
                      Download CV
                    </button>
                    
                    <div className={`w-20 h-20 rounded-[32px] border-4 flex items-center justify-center transition-all ${
                      isSelected ? 'bg-[#6953a3] border-[#6953a3] text-white shadow-2xl scale-110' : 'border-gray-50 text-gray-100 group-hover:border-purple-200 group-hover:text-purple-200'
                    }`}>
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}