import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
import { motion, AnimatePresence } from "framer-motion";
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
    <div className="w-full bg-[#f8f9fc] min-h-screen">
      {!embedded && (
        <header className="text-white px-6 py-4 flex items-center justify-between shadow-md mb-6" style={{ backgroundColor: primaryPurple }}>
          <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-2xl font-bold">Activity Insights</motion.h1>
          <div className="flex gap-3">
            <button onClick={fetchLogs} className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 transition-all text-sm flex items-center gap-2">
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh
            </button>
            <button onClick={() => navigate("/admin/dashboard")} className="px-4 py-2 rounded-xl bg-white text-[#6953a3] font-medium text-sm">← Dashboard</button>
          </div>
        </header>
      )}

      <div className="max-w-7xl mx-auto px-4 pb-10">
        <div className="flex gap-1 mb-8 bg-white p-1 rounded-2xl shadow-sm w-fit border border-gray-100">
          {["search", "logs", "insights"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2.5 rounded-xl font-semibold transition-all ${activeTab === tab ? "bg-[#6953a3] text-white shadow-lg" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {tab === "search" ? "Search History" : tab === "logs" ? "Action Logs" : "Visual Insights"}
            </button>
          ))}
        </div>

        {error && <div className="mb-4 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100">{error}</div>}

        <AnimatePresence mode="wait">
          <motion.div key={activeTab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
            {activeTab === "search" && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-xl font-bold mb-6 flex items-center gap-2" style={{ color: primaryPurple }}>
                  <div className="w-1.5 h-6 rounded-full bg-[#6953a3]" /> Search History
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-600 uppercase text-xs font-bold">
                      <tr><th className="px-6 py-4">Timestamp</th><th className="px-6 py-4">User</th><th className="px-6 py-4">Query</th></tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {searchQueries.map((search, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-500">{formatDate(search.timestamp)}</td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-700">{search.user_email}</td>
                          <td className="px-6 py-4 text-sm text-gray-600 italic">"{search.query}"</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeTab === "logs" && (
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: primaryPurple }}>
                    <div className="w-1.5 h-6 rounded-full bg-[#6953a3]" /> Activity Stream
                  </h2>
                  <button onClick={clearFilters} className="text-sm text-gray-400 hover:text-red-500 transition-colors font-medium">Clear All Filters</button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
                  <input type="datetime-local" value={filters.start_date} onChange={(e) => handleFilterChange("start_date", e.target.value)} className="w-full p-3 bg-gray-50 border-none rounded-2xl text-sm" />
                  <select value={filters.user_role} onChange={(e) => handleFilterChange("user_role", e.target.value)} className="w-full p-3 bg-gray-50 border-none rounded-2xl text-sm">
                    <option value="">All Roles</option><option value="admin">Admin</option><option value="trainer">Trainer</option><option value="customer">Customer</option>
                  </select>
                  <input type="text" placeholder="Email Filter" value={filters.user_email} onChange={(e) => handleFilterChange("user_email", e.target.value)} className="w-full p-3 bg-gray-50 border-none rounded-2xl text-sm col-span-2" />
                </div>

                <div className="overflow-x-auto rounded-2xl border border-gray-50 mb-6">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 text-xs font-bold">
                      <tr><th className="px-6 py-4">Timestamp</th><th className="px-6 py-4">User</th><th className="px-6 py-4">Action</th></tr>
                    </thead>
                    <tbody>
                      {logs.map((log, idx) => (
                        <tr key={idx} className="hover:bg-purple-50/30 border-b border-gray-50 last:border-none">
                          <td className="px-6 py-4 text-sm text-gray-400">{formatDate(log.timestamp)}</td>
                          <td className="px-6 py-4 text-sm font-bold text-gray-700">{log.user_email}</td>
                          <td className="px-6 py-4"><span className="px-3 py-1 rounded-lg text-xs font-bold uppercase bg-blue-50 text-blue-500">{log.action_type}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {pagination.total_pages > 1 && (
                  <div className="flex justify-center items-center gap-4">
                    <button onClick={() => handlePageChange(pagination.page - 1)} disabled={pagination.page === 1} className="p-2 rounded-xl bg-gray-100 disabled:opacity-30">Prev</button>
                    <span className="text-sm font-bold text-gray-500">Page {pagination.page} of {pagination.total_pages}</span>
                    <button onClick={() => handlePageChange(pagination.page + 1)} disabled={pagination.page >= pagination.total_pages} className="p-2 rounded-xl bg-gray-100 disabled:opacity-30">Next</button>
                  </div>
                )}
              </div>
            )}

            {activeTab === "insights" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 col-span-2">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Weekly Skill Trends</h2>
                  <Plot
                    data={[{ x: topSkills.map(s => s.skill), y: topSkills.map(s => s.count), type: "scatter", mode: "lines+markers", fill: "tozeroy", line: { shape: "spline", color: primaryPurple, width: 4 }, fillcolor: "rgba(105, 83, 163, 0.1)" }]}
                    layout={{ autosize: true, height: 350, margin: { l: 40, r: 20, t: 10, b: 40 }, paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' }}
                    style={{ width: "100%" }} config={{ displayModeBar: false }}
                  />
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Role Distribution</h2>
                  <Plot
                    data={[{ labels: Object.keys(roleCounts), values: Object.values(roleCounts), type: "pie", hole: 0.7, marker: { colors: ["#6953a3", "#8b5cf6", "#c4b5fd"] } }]}
                    layout={{ height: 300, margin: { t: 0, b: 0, l: 0, r: 0 } }} style={{ width: "100%" }} config={{ displayModeBar: false }}
                  />
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8">
                  <h2 className="text-xl font-bold mb-6" style={{ color: primaryPurple }}>Active User Ranking</h2>
                  <Plot
                    data={[{ x: topUsers.map(u => u.count), y: topUsers.map(u => u.user), type: "bar", orientation: "h", marker: { color: primaryPurple } }]}
                    layout={{ height: 300, margin: { l: 120, r: 20, t: 10, b: 40 } }} style={{ width: "100%" }} config={{ displayModeBar: false }}
                  />
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}