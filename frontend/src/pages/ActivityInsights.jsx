import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
import {motion, AnimatePresence } from "framer-motion";
import { getActivityLogs } from "../api";


export default function ActivityInsights({ token, embedded = false }) {
  const [activeTab, setActiveTab] = useState("search");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    start_date: "",
    end_date: "",
    user_role: "",
    action_type: "",
    user_email: "",
    page: 1,
    page_size: 50,
  });
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    page_size: 50,
    total_pages: 0,
  });
  const navigate = useNavigate();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getActivityLogs(token, filters);
      setLogs(response.logs || []);
      setPagination({
        total: response.total || 0,
        page: response.page || 1,
        page_size: response.page_size || 50,
        total_pages: response.total_pages || 0,
      });
    } catch (err) {
      setError(err.message || "Failed to fetch activity logs");
    } finally {
      setLoading(false);
    }
  }, [token, filters]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (newPage) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const clearFilters = () => {
    setFilters({
      start_date: "",
      end_date: "",
      user_role: "",
      action_type: "",
      user_email: "",
      page: 1,
      page_size: 50,
    });
  };

  const extractSkillsFromQuery = (query) => {
    if (!query) return [];
    return query
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && !s.toLowerCase().includes("location"));
  };

  // Helper to generate consistent colors based on user email string
  const getUserColor = (role) => {
    switch (role) {
    case "admin":
      return "text-purple-700";
    case "trainer":
      return "text-blue-600";
    case "customer":
    case "client":
      return "text-emerald-600";
    default:
      return "text-gray-600";
  }
  };

  const prepareChartData = () => {
    const actionCounts = {};
    const roleCounts = {};
    const skillCounts = {};
    const userSearchCounts = {};
    const userSkillMatrix = {};
    const searchQueries = [];

    logs.forEach((log) => {
      actionCounts[log.action_type] = (actionCounts[log.action_type] || 0) + 1;
      roleCounts[log.user_role] = (roleCounts[log.user_role] || 0) + 1;

      if (log.action_type === "search" && log.details?.query) {
        const query = log.details.query || "";
        const skills = extractSkillsFromQuery(query);
        
        searchQueries.push({
          query: query,
          location: log.details.location || "",
          timestamp: log.timestamp,
          user_email: log.user_email,
          user_role: log.user_role,
        });

        skills.forEach(skill => {
          const skillLower = skill.toLowerCase().trim();
          if (skillLower) skillCounts[skillLower] = (skillCounts[skillLower] || 0) + 1;
        });

        const userEmail = log.user_email || "unknown";
        userSearchCounts[userEmail] = (userSearchCounts[userEmail] || 0) + 1;

        if (!userSkillMatrix[userEmail]) {
          userSkillMatrix[userEmail] = { role: log.user_role || "unknown" };
        }
      }
    });

    return { roleCounts, skillCounts, userSearchCounts, userSkillMatrix, searchQueries };
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleString();
  };

  const { roleCounts, skillCounts, userSearchCounts, userSkillMatrix, searchQueries } = prepareChartData();

  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  const topUsers = Object.entries(userSearchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user, count]) => ({ 
      user: user.length > 20 ? user.substring(0, 20) + "..." : user, 
      count,
      role: userSkillMatrix[user]?.role || "unknown"
    }));

  const primaryPurple = "#6953a3";

  return (
    <div className="w-full bg-[#f8f9fc] min-h-screen font-sans">
      {!embedded && (
        <header className="px-8 py-5 flex items-center justify-between shadow-lg mb-8 sticky top-0 z-50 backdrop-blur-md bg-[#6953a3]/95 text-white transition-all">
          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-2xl font-bold tracking-tight">
            Activity Insights
          </motion.h1>
          <div className="flex gap-3">
            <button 
              onClick={fetchLogs} 
              className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 transition-all text-sm font-medium flex items-center gap-2"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button 
              onClick={() => navigate("/admin/dashboard")} 
              className="px-5 py-2.5 rounded-xl bg-white text-[#6953a3] font-bold text-sm shadow-sm hover:shadow-md transition-all active:scale-95"
            >
              ← Dashboard
            </button>
          </div>
        </header>
      )}

      {/* Widened Container */}
      <div className="max-w-[100rem] mx-auto px-6 pb-12 pt-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div className="flex gap-1 bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
            {["search", "logs", "insights"].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 rounded-xl font-bold text-sm transition-all duration-200 ${
                  activeTab === tab 
                    ? "bg-[#6953a3] text-white shadow-md transform scale-100" 
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
              >
                {tab === "search" ? "Search History" : tab === "logs" ? "Action Logs" : "Visual Insights"}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div 
            key={activeTab} 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "search" && (
              <div className="bg-white rounded-3xl shadow-xl shadow-purple-900/5 border border-gray-100 p-8">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-3" style={{ color: primaryPurple }}>
                  <div className="w-1.5 h-6 rounded-full bg-[#6953a3]" /> Search History
                </h2>
                <div className="overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 uppercase text-xs font-bold tracking-wider">
                      <tr>
                        <th className="px-8 py-5 border-b border-gray-100">Timestamp</th>
                        <th className="px-8 py-5 border-b border-gray-100">User</th>
                        <th className="px-8 py-5 border-b border-gray-100">Query</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                      {searchQueries.map((search, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/40 transition-colors">
                          <td className="px-8 py-5 text-sm text-gray-500 whitespace-nowrap">{formatDate(search.timestamp)}</td>
                          {/* Apply dynamic color to user text */}
                          <td className={`px-8 py-5 text-sm font-bold ${getUserColor(search.user_role)}`}>{search.user_email}</td>
                          <td className="px-8 py-5 text-sm text-gray-600">
                            <span className="bg-gray-50 border border-gray-200 px-3 py-1 rounded-lg">"{search.query}"</span>
                          </td>
                        </tr>
                      ))}
                      {searchQueries.length === 0 && (
                        <tr><td colSpan="3" className="px-8 py-10 text-center text-gray-400 italic">No search history found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "logs" && (
              <div className="bg-white rounded-3xl shadow-xl shadow-purple-900/5 border border-gray-100 p-8">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                  <h2 className="text-xl font-bold flex items-center gap-3" style={{ color: primaryPurple }}>
                    <div className="w-1.5 h-6 rounded-full bg-[#6953a3]" /> Activity Stream
                  </h2>
                  <button 
                    onClick={clearFilters} 
                    className="text-sm text-gray-500 hover:text-red-600 font-bold transition-colors hover:bg-red-50 px-3 py-1.5 rounded-lg border border-transparent hover:border-red-100"
                  >
                    Clear All Filters
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8 bg-gray-50/50 p-6 rounded-2xl border border-gray-100">
                  <input 
                    type="datetime-local" 
                    value={filters.start_date} 
                    onChange={(e) => handleFilterChange("start_date", e.target.value)} 
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6953a3] focus:border-transparent outline-none transition-shadow" 
                  />
                  <select 
                    value={filters.user_role} 
                    onChange={(e) => handleFilterChange("user_role", e.target.value)} 
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6953a3] focus:border-transparent outline-none transition-shadow"
                  >
                    <option value="">All Roles</option>
                    <option value="admin">Admin</option>
                    <option value="trainer">Trainer</option>
                    <option value="customer">Customer</option>
                  </select>
                  <input 
                    type="text" 
                    placeholder="Filter by User Email" 
                    value={filters.user_email} 
                    onChange={(e) => handleFilterChange("user_email", e.target.value)} 
                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-[#6953a3] focus:border-transparent outline-none transition-shadow col-span-1 md:col-span-2" 
                  />
                   {/* Placeholder for future filter or empty space to align grid */}
                   <div className="hidden md:block"></div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-gray-100 mb-8">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50/80 text-gray-500 uppercase text-xs font-bold tracking-wider border-b border-gray-100">
                      <tr>
                        <th className="px-8 py-5">Timestamp</th>
                        <th className="px-8 py-5">User</th>
                        <th className="px-8 py-5 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 bg-white">
                      {logs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-8 py-5 text-sm text-gray-500 whitespace-nowrap">{formatDate(log.timestamp)}</td>
                          {/* Apply dynamic color to user text */}
                          <td className={`px-8 py-5 text-sm font-bold ${getUserColor(log.user_email)}`}>{log.user_email}</td>
                          <td className="px-8 py-5 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border ${
                                log.action_type === 'login' ? 'bg-green-50 text-green-600 border-green-100' :
                                log.action_type === 'logout' ? 'bg-gray-50 text-gray-500 border-gray-200' :
                                'bg-purple-50 text-purple-600 border-purple-100'
                            }`}>
                              {log.action_type}
                            </span>
                          </td>
                        </tr>
                      ))}
                       {logs.length === 0 && (
                        <tr><td colSpan="3" className="px-8 py-12 text-center text-gray-400 font-medium">No activity logs found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {pagination.total_pages > 1 && (
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-100">
                    <span className="text-sm font-medium text-gray-500">Page <span className="text-gray-900 font-bold">{pagination.page}</span> of {pagination.total_pages}</span>
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handlePageChange(pagination.page - 1)} 
                        disabled={pagination.page === 1} 
                        className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        Previous
                      </button>
                      <button 
                        onClick={() => handlePageChange(pagination.page + 1)} 
                        disabled={pagination.page >= pagination.total_pages} 
                        className="px-4 py-2 rounded-xl bg-[#6953a3] text-white hover:bg-[#5a468c] font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === "insights" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-8">
                <div className="bg-white rounded-3xl shadow-xl shadow-purple-900/5 border border-gray-100 p-8 col-span-1 lg:col-span-2">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Weekly Skill Trends</h2>
                  <div className="w-full h-[350px] border border-gray-100 rounded-2xl overflow-hidden p-2">
                    <Plot
                        data={[{ 
                            x: topSkills.map(s => s.skill), 
                            y: topSkills.map(s => s.count), 
                            type: "scatter", 
                            mode: "lines+markers", 
                            fill: "tozeroy", 
                            line: { shape: "spline", color: primaryPurple, width: 3 }, 
                            fillcolor: "rgba(105, 83, 163, 0.1)" 
                        }]}
                        layout={{ 
                            autosize: true, 
                            height: 330, 
                            margin: { l: 40, r: 20, t: 10, b: 40 }, 
                            paper_bgcolor: 'rgba(0,0,0,0)', 
                            plot_bgcolor: 'rgba(0,0,0,0)',
                            xaxis: { showgrid: false, zeroline: false },
                            yaxis: { showgrid: true, gridcolor: '#f3f4f6' }
                        }}
                        style={{ width: "100%", height: "100%" }} 
                        config={{ displayModeBar: false, responsive: true }}
                    />
                  </div>
                </div>
                <div className="bg-white rounded-3xl shadow-xl shadow-purple-900/5 border border-gray-100 p-8">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Role Distribution</h2>
                  <div className="w-full h-[300px]">
                    <Plot
                        data={[{ 
                            labels: Object.keys(roleCounts), 
                            values: Object.values(roleCounts), 
                            type: "pie", 
                            hole: 0.6, 
                            marker: { colors: ["#6953a3", "#8b5cf6", "#c4b5fd"] },
                            textposition: 'outside'
                        }]}
                        layout={{ 
                            height: 300, 
                            margin: { t: 0, b: 0, l: 0, r: 0 },
                            paper_bgcolor: 'rgba(0,0,0,0)'
                        }} 
                        style={{ width: "100%", height: "100%" }} 
                        config={{ displayModeBar: false, responsive: true }}
                    />
                  </div>
                </div>
                <div className="bg-white rounded-3xl shadow-xl shadow-purple-900/5 border border-gray-100 p-8">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Active User Ranking</h2>
                  <div className="w-full h-[300px]">
                    <Plot
                        data={[{ 
                            x: topUsers.map(u => u.count), 
                            y: topUsers.map(u => u.user), 
                            type: "bar", 
                            orientation: "h", 
                            marker: { color: primaryPurple } 
                        }]}
                        layout={{ 
                            height: 300, 
                            margin: { l: 150, r: 20, t: 10, b: 30 },
                            paper_bgcolor: 'rgba(0,0,0,0)',
                            plot_bgcolor: 'rgba(0,0,0,0)'
                        }} 
                        style={{ width: "100%", height: "100%" }} 
                        config={{ displayModeBar: false, responsive: true }}
                    />
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}