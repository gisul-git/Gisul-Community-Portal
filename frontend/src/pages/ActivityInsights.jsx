import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Plot from "react-plotly.js";
import { getActivityLogs } from "../api";

export default function ActivityInsights({ token, onLogout, embedded = false }) {
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

  useEffect(() => {
    fetchLogs();
  }, [filters]);

  const fetchLogs = async () => {
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
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  };

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

  // Extract skills from query text
  const extractSkillsFromQuery = (query) => {
    if (!query) return [];
    // Split by comma or common separators
    const skills = query
      .split(/[,;|]/)
      .map(s => s.trim())
      .filter(s => s.length > 1 && !s.toLowerCase().includes("location"));
    return skills;
  };

  // Prepare data for charts
  const prepareChartData = () => {
    const actionCounts = {};
    const roleCounts = {};
    const skillCounts = {};
    const userSearchCounts = {};
    const roleSkillCounts = {}; // Skills searched by role
    const userSkillMatrix = {}; // User -> Skills mapping
    const searchQueries = [];

    logs.forEach((log) => {
      // Action type counts
      actionCounts[log.action_type] = (actionCounts[log.action_type] || 0) + 1;

      // Role counts
      roleCounts[log.user_role] = (roleCounts[log.user_role] || 0) + 1;

      // Extract search queries and skills
      if (log.action_type === "search" && log.details?.query) {
        const query = log.details.query || "";
        const skills = extractSkillsFromQuery(query);
        
        searchQueries.push({
          query: query,
          location: log.details.location || "",
          timestamp: log.timestamp,
          user_email: log.user_email,
          user_role: log.user_role,
          skills: skills,
        });

        // Count skills
        skills.forEach(skill => {
          const skillLower = skill.toLowerCase().trim();
          if (skillLower) {
            skillCounts[skillLower] = (skillCounts[skillLower] || 0) + 1;
            
            // Count by role
            const role = log.user_role || "unknown";
            if (!roleSkillCounts[role]) {
              roleSkillCounts[role] = {};
            }
            roleSkillCounts[role][skillLower] = (roleSkillCounts[role][skillLower] || 0) + 1;
          }
        });

        // Count searches by user
        const userEmail = log.user_email || "unknown";
        userSearchCounts[userEmail] = (userSearchCounts[userEmail] || 0) + 1;

        // Build user-skill matrix
        if (!userSkillMatrix[userEmail]) {
          userSkillMatrix[userEmail] = {
            role: log.user_role || "unknown",
            skills: new Set(),
          };
        }
        skills.forEach(skill => {
          if (skill.trim()) {
            userSkillMatrix[userEmail].skills.add(skill.toLowerCase().trim());
          }
        });
      }
    });

    return { 
      actionCounts, 
      roleCounts, 
      skillCounts, 
      userSearchCounts, 
      roleSkillCounts,
      userSkillMatrix,
      searchQueries 
    };
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch {
      return dateString;
    }
  };

  const { actionCounts, roleCounts, skillCounts, userSearchCounts, roleSkillCounts, userSkillMatrix, searchQueries } = prepareChartData();

  // Get top skills
  const topSkills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([skill, count]) => ({ skill, count }));

  // Get top users
  const topUsers = Object.entries(userSearchCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([user, count]) => ({ 
      user: user.length > 30 ? user.substring(0, 30) + "..." : user, 
      count,
      role: userSkillMatrix[user]?.role || "unknown"
    }));

  return (
    <div className="w-full">
      {!embedded && (
        <header
          className="text-white px-3 sm:px-4 md:px-6 py-2 sm:py-3 flex items-center justify-between shadow-lg mb-6"
          style={{ backgroundColor: "#6953a3" }}
        >
          <h1 className="text-lg sm:text-xl md:text-2xl font-semibold">Activity Insights</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchLogs()}
              disabled={loading}
              className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition text-sm md:text-base disabled:opacity-50 flex items-center gap-2"
              title="Refresh"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => navigate("/admin/dashboard")}
              className="px-3 py-2 rounded-lg bg-white/20 hover:bg-white/30 transition text-sm md:text-base"
            >
              ← Back to Dashboard
            </button>
          </div>
        </header>
      )}
      
      {/* Refresh button for embedded mode */}
      {embedded && (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="px-3 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition text-sm disabled:opacity-50 flex items-center gap-2"
            title="Refresh Activity Logs"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>
      )}

      <div className="w-full">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-gray-300" style={{ paddingTop: embedded ? "0" : "1rem" }}>
          <button
            onClick={() => setActiveTab("search")}
            className={`px-4 py-2 font-medium transition ${
              activeTab === "search"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-purple-600"
            }`}
          >
            Search History
          </button>
          <button
            onClick={() => setActiveTab("logs")}
            className={`px-4 py-2 font-medium transition ${
              activeTab === "logs"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-purple-600"
            }`}
          >
            Action Logs
          </button>
          <button
            onClick={() => setActiveTab("insights")}
            className={`px-4 py-2 font-medium transition ${
              activeTab === "insights"
                ? "text-purple-600 border-b-2 border-purple-600"
                : "text-gray-600 hover:text-purple-600"
            }`}
          >
            Insights
          </button>
        </div>

        {/* Search History Tab */}
        {activeTab === "search" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
              Search History
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Timestamp</th>
                    <th className="border p-2 text-left">User</th>
                    <th className="border p-2 text-left">Role</th>
                    <th className="border p-2 text-left">Query</th>
                    <th className="border p-2 text-left">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {searchQueries.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="border p-4 text-center text-gray-500">
                        No search history found
                      </td>
                    </tr>
                  ) : (
                    searchQueries.map((search, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border p-2 text-sm">{formatDate(search.timestamp)}</td>
                        <td className="border p-2 text-sm">{search.user_email || "-"}</td>
                        <td className="border p-2 text-sm capitalize">{search.user_role || "-"}</td>
                        <td className="border p-2 text-sm">{search.query || "-"}</td>
                        <td className="border p-2 text-sm">{search.location || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action Logs Tab */}
        {activeTab === "logs" && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
              Action Logs
            </h2>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <label className="block text-sm font-medium mb-1">Start Date</label>
                <input
                  type="datetime-local"
                  value={filters.start_date}
                  onChange={(e) => handleFilterChange("start_date", e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">End Date</label>
                <input
                  type="datetime-local"
                  value={filters.end_date}
                  onChange={(e) => handleFilterChange("end_date", e.target.value)}
                  className="w-full p-2 border rounded"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">User Role</label>
                <select
                  value={filters.user_role}
                  onChange={(e) => handleFilterChange("user_role", e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">All</option>
                  <option value="admin">Admin</option>
                  <option value="trainer">Trainer</option>
                  <option value="customer">Customer</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Action Type</label>
                <select
                  value={filters.action_type}
                  onChange={(e) => handleFilterChange("action_type", e.target.value)}
                  className="w-full p-2 border rounded"
                >
                  <option value="">All</option>
                  <option value="search">Search</option>
                  <option value="upload">Upload</option>
                  <option value="delete">Delete</option>
                  <option value="login">Login</option>
                  <option value="logout">Logout</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">User Email</label>
                <input
                  type="text"
                  value={filters.user_email}
                  onChange={(e) => handleFilterChange("user_email", e.target.value)}
                  placeholder="Filter by email"
                  className="w-full p-2 border rounded"
                />
              </div>
            </div>

            <div className="flex justify-between items-center mb-4">
              <button
                onClick={clearFilters}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded transition"
              >
                Clear Filters
              </button>
              {loading && <div className="text-gray-500">Loading...</div>}
              {error && <div className="text-red-500">{error}</div>}
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-2 text-left">Timestamp</th>
                    <th className="border p-2 text-left">User</th>
                    <th className="border p-2 text-left">Role</th>
                    <th className="border p-2 text-left">Action</th>
                    <th className="border p-2 text-left">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 && !loading ? (
                    <tr>
                      <td colSpan="5" className="border p-4 text-center text-gray-500">
                        No activity logs found
                      </td>
                    </tr>
                  ) : (
                    logs.map((log, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="border p-2 text-sm">{formatDate(log.timestamp)}</td>
                        <td className="border p-2 text-sm">{log.user_email || "-"}</td>
                        <td className="border p-2 text-sm capitalize">{log.user_role || "-"}</td>
                        <td className="border p-2 text-sm capitalize">{log.action_type || "-"}</td>
                        <td className="border p-2 text-sm">
                          {log.details ? JSON.stringify(log.details).substring(0, 100) : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="flex justify-center items-center gap-2 mt-4">
                <button
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="px-4 py-2 bg-purple-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2">
                  Page {pagination.page} of {pagination.total_pages} (Total: {pagination.total})
                </span>
                <button
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.total_pages}
                  className="px-4 py-2 bg-purple-600 text-white rounded disabled:bg-gray-300 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}

        {/* Insights Tab */}
        {activeTab === "insights" && (
          <div className="space-y-6">
            {/* Top Skills Searched */}
            {topSkills.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
                  Top Skills Searched
                </h2>
                <Plot
                  data={[
                    {
                      x: topSkills.map(s => s.skill),
                      y: topSkills.map(s => s.count),
                      type: "bar",
                      orientation: "v",
                      marker: { 
                        color: topSkills.map((_, i) => `rgba(105, 83, 163, ${0.6 + (i / topSkills.length) * 0.4})`),
                      },
                      text: topSkills.map(s => s.count),
                      textposition: "outside",
                    },
                  ]}
                  layout={{
                    height: 500,
                    title: "Most Searched Skills",
                    xaxis: { title: "Skill", tickangle: -45 },
                    yaxis: { title: "Search Count" },
                    margin: { b: 100 },
                  }}
                />
              </div>
            )}

            {/* Skills Searched by Role (Stacked Bar) */}
            {Object.keys(roleSkillCounts).length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
                  Skills Searched by User Role
                </h2>
                {(() => {
                  // Get top 10 skills across all roles
                  const allSkillsSet = new Set();
                  Object.values(roleSkillCounts).forEach(roleSkills => {
                    Object.keys(roleSkills).forEach(skill => allSkillsSet.add(skill));
                  });
                  const topSkillsAll = Array.from(allSkillsSet)
                    .map(skill => ({
                      skill,
                      total: Object.values(roleSkillCounts).reduce((sum, roleSkills) => sum + (roleSkills[skill] || 0), 0)
                    }))
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 10)
                    .map(s => s.skill);

                  const roles = Object.keys(roleSkillCounts);
                  const colors = ["#6953a3", "#fbbf24", "#ef4444", "#10b981", "#3b82f6"];

                  return (
                    <Plot
                      data={roles.map((role, roleIdx) => ({
                        x: topSkillsAll,
                        y: topSkillsAll.map(skill => roleSkillCounts[role][skill] || 0),
                        name: role.charAt(0).toUpperCase() + role.slice(1),
                        type: "bar",
                        marker: { color: colors[roleIdx % colors.length] },
                      }))}
                      layout={{
                        height: 500,
                        title: "Skills Distribution by Role",
                        barmode: "stack",
                        xaxis: { title: "Skill", tickangle: -45 },
                        yaxis: { title: "Search Count" },
                        legend: { x: 1, y: 1 },
                        margin: { b: 100 },
                      }}
                    />
                  );
                })()}
              </div>
            )}

            {/* Top Users by Search Activity */}
            {topUsers.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
                  Top Users by Search Activity
                </h2>
                <Plot
                  data={[
                    {
                      x: topUsers.map(u => u.count),
                      y: topUsers.map(u => u.user),
                      type: "bar",
                      orientation: "h",
                      marker: { 
                        color: topUsers.map(u => {
                          const colorMap = { admin: "#6953a3", customer: "#fbbf24", trainer: "#ef4444" };
                          return colorMap[u.role] || "#94a3b8";
                        }),
                      },
                      text: topUsers.map(u => u.count),
                      textposition: "outside",
                    },
                  ]}
                  layout={{
                    height: Math.max(400, topUsers.length * 40),
                    title: "Most Active Users",
                    xaxis: { title: "Number of Searches" },
                    yaxis: { title: "User Email" },
                    margin: { l: 150 },
                  }}
                />
              </div>
            )}

            {/* User Role Distribution */}
            {Object.keys(roleCounts).length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-bold mb-4" style={{ color: "#6953a3" }}>
                  User Role Distribution
                </h2>
                <Plot
                  data={[
                    {
                      labels: Object.keys(roleCounts).map(r => r.charAt(0).toUpperCase() + r.slice(1)),
                      values: Object.values(roleCounts),
                      type: "pie",
                      marker: { 
                        colors: Object.keys(roleCounts).map(r => {
                          const colorMap = { admin: "#6953a3", customer: "#fbbf24", trainer: "#ef4444" };
                          return colorMap[r] || "#94a3b8";
                        })
                      },
                      textinfo: "label+percent",
                      hovertemplate: "<b>%{label}</b><br>Count: %{value}<br>Percentage: %{percent}<extra></extra>",
                    },
                  ]}
                  layout={{
                    height: 400,
                    title: "Activities by User Role",
                    showlegend: true,
                  }}
                />
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

