const API_PORT = import.meta.env.VITE_API_PORT || "8000";
const CONFIGURED_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_BASE ||
  import.meta.env.VITE_BACKEND_URL ||
  null;

const resolveDefaultApiBase = () => {
  if (CONFIGURED_BASE) {
    return CONFIGURED_BASE;
  }

  if (typeof window === "undefined") {
    return `http://localhost:${API_PORT}`;
  }

  const { protocol, hostname, port } = window.location;
  const inferredPort = import.meta.env.VITE_API_PORT || API_PORT;

  // For domain-based deployments (not localhost/127.0.0.1), don't append port
  // Port is handled by reverse proxy/load balancer (e.g., community.gisul.co.in)
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";
  const isIPAddress = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  
  // Domain-based deployment (accessed via reverse proxy) - use same hostname without port
  // Examples: community.gisul.co.in, gisul.co.in, etc.
  if (!isLocalhost && !isIPAddress) {
    // Use same protocol and hostname (reverse proxy handles routing)
    return `${protocol}//${hostname}`;
  }
  
  // HTTPS with localhost/IP - likely behind reverse proxy, don't append port
  if (protocol === "https:") {
    return `${protocol}//${hostname}`;
  }
  
  // HTTP with localhost/IP - development mode, append port
  return `${protocol}//${hostname}:${inferredPort}`;
};

export const API_BASE = resolveDefaultApiBase().replace(/\/$/, "");

export async function adminLogin(email, password) {
  const res = await fetch(`${API_BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role: "admin" }),
  });
  return res.json();
}

export async function trainerSignup(name, email, password) {
  const res = await fetch(`${API_BASE}/trainer/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });
  return res.json();
}

export async function trainerLogin(email, password) {
  const res = await fetch(`${API_BASE}/trainer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role: "trainer" }),
  });
  return res.json();
}

export async function startBulkUpload(token, files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  const res = await fetch(`${API_BASE}/admin/bulk_upload_start`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  
  if (!res.ok) {
    // Check if response is JSON or HTML
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      const error = new Error(errorData.detail || errorData.message || "Upload failed");
      error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
      throw error;
    } else {
      // Response is HTML (error page from nginx or server)
      const text = await res.text();
      throw new Error(`Server error (${res.status}): Unable to reach upload endpoint. The backend may be unavailable.`);
    }
  }
  
  // Check content type before parsing
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(`Unexpected response format: Expected JSON but received ${contentType}. Response: ${text.substring(0, 100)}...`);
  }
  
  return res.json();
}

export async function cancelTask(token, taskId) {
  const res = await fetch(`${API_BASE}/admin/tasks/${taskId}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(errorData.detail || errorData.message || "Failed to cancel task");
    } else {
      throw new Error(`Server error (${res.status}): Unable to cancel task`);
    }
  }
  
  return res.json();
}

export async function getTaskStatus(id) {
  const url = `${API_BASE}/tasks/${id}`;
  console.log(`[getTaskStatus] Fetching task status from: ${url}`);
  
  const res = await fetch(url);
  
  // Check content type FIRST - before checking res.ok
  // Sometimes servers return HTML even with 200 status (e.g., nginx fallback to index.html)
  const contentType = res.headers.get("content-type") || "";
  const isHTML = contentType.includes("text/html") || contentType.includes("text/plain");
  
  console.log(`[getTaskStatus] Response status: ${res.status}, content-type: ${contentType}, isHTML: ${isHTML}`);
  
  if (!res.ok) {
    // Response is not OK
    if (contentType.includes("application/json")) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      const error = new Error(errorData.detail || errorData.message || `Task status check failed: ${res.statusText}`);
      error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
      throw error;
    } else if (isHTML) {
      // Response is HTML (error page from nginx or server)
      const text = await res.text();
      throw new Error(`Server error (${res.status}): Unable to reach task status endpoint. The backend may be unavailable.`);
    } else {
      // Unknown content type
      const text = await res.text();
      throw new Error(`Task status check failed (${res.status}): ${res.statusText}. Response: ${text.substring(0, 200)}`);
    }
  }
  
  // Response is OK - but check content type before parsing
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    if (isHTML) {
      // If we get HTML, this means nginx is falling back to index.html
      // This is a routing configuration issue - we should throw an error so the frontend can handle it
      console.error(`[getTaskStatus] Received HTML response instead of JSON - Nginx routing issue!`, {
        url,
        status: res.status,
        contentType,
        responsePreview: text.substring(0, 500)
      });
      // Throw error so the frontend can detect this is a routing problem
      throw new Error(`HTML_RESPONSE: Received HTML instead of JSON. The /tasks endpoint may not be properly configured in nginx. Task ID: ${id}`);
    }
    throw new Error(`Unexpected response format: Expected JSON but received ${contentType}. Response: ${text.substring(0, 100)}...`);
  }
  
  const data = await res.json();
  console.log(`[getTaskStatus] Successfully received task status:`, { taskId: id, state: data.state });
  return data;
}

export async function uploadJD(token, file, isCustomer = false) {
  const fd = new FormData();
  fd.append("file", file);
  const endpoint = isCustomer ? `${API_BASE}/customer/upload_jd` : `${API_BASE}/admin/upload_jd`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "File upload failed");
  }
  return res.json();
}

export async function searchByJD(token, jdText, location = "", topK = 10) {
  const res = await fetch(`${API_BASE}/admin/search_by_jd`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jd_text: jdText, location: location, top_k: topK }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "JD search failed");
  }
  return res.json();
}

export async function searchByText(token, query, location = "", onProgress = null) {
  const res = await fetch(`${API_BASE}/admin/search_by_text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, location }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    
    // Extract a user-friendly error message
    let errorMessage = errorData.detail || errorData.message || "Search failed";
    
    // Handle OpenAI API key errors with a cleaner message
    if (errorMessage.includes("api_key") || errorMessage.includes("API key") || errorMessage.includes("401")) {
      errorMessage = "OpenAI API key error: Please check your API key configuration. Contact your administrator.";
    } else if (typeof errorMessage === "string" && errorMessage.includes("Search error:")) {
      // Extract just the relevant part after "Search error:"
      const parts = errorMessage.split("Search error:");
      if (parts.length > 1) {
        const errorPart = parts[1].trim();
        // Try to extract a cleaner message if it's a JSON-like error
        if (errorPart.includes("'error'") || errorPart.includes('"error"')) {
          try {
            // If it looks like a JSON string, try to parse it
            const jsonMatch = errorPart.match(/\{.*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.error && parsed.error.message) {
                errorMessage = `Search error: ${parsed.error.message}`;
              }
            }
          } catch (e) {
            // If parsing fails, use a generic message
            errorMessage = "Search error: Unable to process search request. Please try again.";
          }
        } else {
          errorMessage = `Search error: ${errorPart}`;
        }
      }
    }
    
    const error = new Error(errorMessage);
    error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
    throw error;
  }
  
  // Handle streaming response (NDJSON) - shows 100% matches immediately
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("ndjson") || contentType.includes("stream") || res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let allMatches = [];
    let perfectMatches = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === "matches" && data.is_perfect) {
              // 100% matches - show immediately
              perfectMatches = data.matches;
              allMatches = [...perfectMatches];
              if (onProgress) {
                onProgress({
                  type: "perfect",
                  matches: perfectMatches,
                  total: perfectMatches.length
                });
              }
            } else if (data.type === "match") {
              // Progressive match
              allMatches.push(data.match);
              if (onProgress) {
                onProgress({
                  type: "progressive",
                  match: data.match,
                  total: allMatches.length
                });
              }
            } else if (data.type === "complete") {
              // Final result
              return {
                total_matches: data.total_matches,
                matches: data.matches || allMatches
              };
            } else if (data.type === "error") {
              throw new Error(data.error);
            }
          } catch (e) {
            console.warn("Failed to parse streaming data:", e, line);
          }
        }
      }
      
      // Return accumulated results if stream ended without complete message
      return {
        total_matches: allMatches.length,
        matches: allMatches
      };
    } catch (streamError) {
      console.error("Streaming error:", streamError);
      throw streamError;
    }
  }
  
  // Fallback to regular JSON response
  return res.json();
}

export async function getAllTrainers(token) {
  const res = await fetch(`${API_BASE}/admin/trainers_list`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(errorData.detail || errorData.message || "Failed to fetch trainers");
    error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
    throw error;
  }
  return res.json();
}

export async function getSkillDomains(token) {
  const res = await fetch(`${API_BASE}/admin/skill_domains`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to fetch skill domains");
  }
  return res.json();
}

// In-memory cache for domain expansion (frontend-side caching for instant responses)
const domainExpansionCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export async function expandDomain(token, domain) {
  if (!domain || !domain.trim()) {
    return { keywords: [], cached: false };
  }
  
  const cacheKey = domain.toLowerCase().trim();
  
  // Check cache first (instant response)
  const cached = domainExpansionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return { keywords: cached.keywords, cached: true };
  }
  
  try {
    const res = await fetch(`${API_BASE}/admin/expand_domain`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ domain: cacheKey }),
    });
    
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ detail: res.statusText }));
      console.warn("Domain expansion failed:", errorData);
      return { keywords: [cacheKey], cached: false };
    }
    
    const data = await res.json();
    const keywords = data.keywords || [cacheKey];
    
    // Cache the result
    domainExpansionCache.set(cacheKey, {
      keywords,
      timestamp: Date.now()
    });
    
    return { keywords, cached: data.cached || false };
  } catch (err) {
    console.warn("Domain expansion error:", err);
    return { keywords: [cacheKey], cached: false };
  }
}

export async function deleteTrainerByAdmin(token, trainerEmail) {
  const res = await fetch(`${API_BASE}/admin/trainers/${encodeURIComponent(trainerEmail)}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function updateTrainerByAdmin(token, identifier, updateData) {
  const res = await fetch(`${API_BASE}/admin/trainers/${encodeURIComponent(identifier)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updateData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to update trainer");
  }
  return res.json();
}

export async function uploadResume(token, file, name, email) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("name", name);
  fd.append("email", email);
  const res = await fetch(`${API_BASE}/trainer/upload_resume`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: fd,
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    const error = new Error(errorData.detail || errorData.message || "Upload failed");
    error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
    throw error;
  }
  
  return res.json();
}

export async function getTrainerProfile(token) {
  const res = await fetch(`${API_BASE}/trainer/profile`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function updateTrainerProfile(token, profileData) {
  const res = await fetch(`${API_BASE}/trainer/profile`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(profileData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to update profile");
  }
  return res.json();
}

export async function deleteTrainerProfile(token) {
  const res = await fetch(`${API_BASE}/trainer/profile`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.json();
}

export async function analyticsQuery(token, queryData) {
  const url = `${API_BASE}/analytics/query`;
  console.log(`[analyticsQuery] Making request to: ${url}`);
  console.log(`[analyticsQuery] Request data:`, queryData);
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryData),
    });
    
    console.log(`[analyticsQuery] Response status: ${res.status}, content-type: ${res.headers.get("content-type")}`);
    
    // Check content type first - before checking res.ok
    const contentType = res.headers.get("content-type") || "";
    const isHTML = contentType.includes("text/html") || contentType.includes("text/plain");
    
    if (!res.ok) {
      // Check if response is JSON or HTML
      if (contentType.includes("application/json")) {
        const errorData = await res.json().catch(() => ({ detail: res.statusText }));
        console.error(`[analyticsQuery] JSON error response:`, errorData);
        const error = new Error(errorData.detail || errorData.message || `Analytics query failed (${res.status})`);
        error.response = { json: () => Promise.resolve(errorData), status: res.status, statusText: res.statusText };
        throw error;
      } else if (isHTML) {
        // Response is HTML (error page from nginx or server)
        const text = await res.text();
        // 405 usually means method not allowed - could be routing or CORS issue
        if (res.status === 405) {
          console.error(`[analyticsQuery] 405 Method Not Allowed - URL: ${url}, Method: POST`);
          console.error(`[analyticsQuery] Response preview:`, text.substring(0, 500));
          throw new Error(`Method not allowed (405): The analytics endpoint may not be accepting POST requests. This could be a routing issue. Please check that the backend route /analytics/query is correctly configured.`);
        }
        console.error(`[analyticsQuery] HTML error response - Status: ${res.status}, Preview:`, text.substring(0, 500));
        throw new Error(`Server error (${res.status}): Unable to reach analytics endpoint. The backend may be unavailable or the route may be incorrect.`);
      } else {
        // Unknown content type
        const text = await res.text();
        console.error(`[analyticsQuery] Unknown content type error - Status: ${res.status}, Content-Type: ${contentType}, Preview:`, text.substring(0, 200));
        throw new Error(`Analytics query failed (${res.status}): ${res.statusText}. Response: ${text.substring(0, 200)}`);
      }
    }
    
    // Response is OK - check content type before parsing
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error(`[analyticsQuery] Unexpected content type - Expected JSON but received ${contentType}, Preview:`, text.substring(0, 100));
      throw new Error(`Unexpected response format: Expected JSON but received ${contentType}. Response: ${text.substring(0, 100)}...`);
    }
    
    const data = await res.json();
    console.log(`[analyticsQuery] Successfully received response:`, { dataLength: data.data?.length || 0, total: data.total || 0 });
    return data;
  } catch (err) {
    // Handle network errors (CORS, connection failures, etc.)
    if (err instanceof TypeError && err.message.includes("fetch")) {
      console.error(`[analyticsQuery] Network error:`, err);
      throw new Error(`Network error: Unable to connect to analytics endpoint. Please check your internet connection and ensure the backend is running. URL: ${url}`);
    }
    // Re-throw other errors
    throw err;
  }
}

// Customer API functions
export async function customerSignup(name, email, password, companyName = "") {
  const res = await fetch(`${API_BASE}/customer/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, company_name: companyName }),
  });
  return res.json();
}

export async function customerLogin(email, password) {
  const res = await fetch(`${API_BASE}/customer/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, role: "customer" }),
  });
  return res.json();
}

// OAuth login URLs
export function getGoogleLoginUrl(role) {
  return `${API_BASE}/api/auth/google/login/${role}`;
}

export function getMicrosoftLoginUrl(role) {
  return `${API_BASE}/api/auth/microsoft/login/${role}`;
}

export async function customerSearchByText(token, query, location = "", topK = 10, onProgress = null) {
  const res = await fetch(`${API_BASE}/customer/search_by_text`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, location, top_k: topK }),
  });
  
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Search failed");
  }
  
  // Handle streaming response (NDJSON) - shows 100% matches immediately
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("ndjson") || contentType.includes("stream") || res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let allMatches = [];
    let perfectMatches = [];
    let expandedTerms = [];
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer
        
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            
            if (data.type === "matches" && data.is_perfect) {
              // 100% matches - show immediately
              perfectMatches = data.matches;
              allMatches = [...perfectMatches];
              if (onProgress) {
                onProgress({
                  type: "perfect",
                  matches: perfectMatches,
                  total: perfectMatches.length
                });
              }
            } else if (data.type === "match") {
              // Progressive match
              allMatches.push(data.match);
              if (onProgress) {
                onProgress({
                  type: "progressive",
                  match: data.match,
                  total: allMatches.length
                });
              }
            } else if (data.type === "complete") {
              // Final result
              expandedTerms = data.expanded_terms || [];
              return {
                total_matches: data.total_matches,
                matches: data.matches || allMatches,
                expanded_terms: expandedTerms
              };
            } else if (data.type === "error") {
              throw new Error(data.error);
            }
          } catch (e) {
            console.warn("Failed to parse streaming data:", e, line);
          }
        }
      }
      
      // Return accumulated results if stream ended without complete message
      return {
        total_matches: allMatches.length,
        matches: allMatches,
        expanded_terms: expandedTerms
      };
    } catch (streamError) {
      console.error("Streaming error:", streamError);
      throw streamError;
    }
  }
  
  // Fallback to regular JSON response
  return res.json();
}

export async function customerSearchByJD(token, jdText, location = "", topK = 10) {
  const res = await fetch(`${API_BASE}/customer/search_by_jd`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jd_text: jdText, location, top_k: topK }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Search failed");
  }
  return res.json();
}

export async function logActivity(token, actionType, details = {}) {
  try {
    const response = await fetch(`${API_BASE}/log_activity`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action_type: actionType,
        details: details,
      }),
    });
    if (!response.ok) {
      throw new Error("Failed to log activity");
    }
    return await response.json();
  } catch (err) {
    console.error("Activity logging error:", err);
    // Don't throw - logging failures shouldn't break the app
    return { status: "error" };
  }
}

export async function getActivityLogs(token, filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.start_date) params.append("start_date", filters.start_date);
    if (filters.end_date) params.append("end_date", filters.end_date);
    if (filters.user_role) params.append("user_role", filters.user_role);
    if (filters.action_type) params.append("action_type", filters.action_type);
    if (filters.user_email) params.append("user_email", filters.user_email);
    if (filters.page) params.append("page", filters.page);
    if (filters.page_size) params.append("page_size", filters.page_size);
    
    const response = await fetch(`${API_BASE}/admin/activity_logs?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) {
      throw new Error("Failed to fetch activity logs");
    }
    return await response.json();
  } catch (err) {
    console.error("Get activity logs error:", err);
    throw err;
  }
}


// Requirements API functions
export async function postRequirement(token, requirementData) {
  const res = await fetch(`${API_BASE}/customer/post_requirement`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requirementData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to post requirement");
  }
  return res.json();
}

export async function getCustomerRequirements(token) {
  const res = await fetch(`${API_BASE}/customer/requirements`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to fetch requirements");
  }
  return res.json();
}

export async function getAdminRequirements(token) {
  const res = await fetch(`${API_BASE}/admin/requirements`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to fetch requirements");
  }
  return res.json();
}

export async function getPendingRequirementsCount(token) {
  const res = await fetch(`${API_BASE}/admin/requirements/pending_count`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to fetch pending count");
  }
  return res.json();
}

export async function clearAllCaches(token) {
  const res = await fetch(`${API_BASE}/admin/clear_caches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to clear caches");
  }
  return res.json();
}

export async function approveRequirement(token, requirementId, approved, adminNotes = null) {
  const res = await fetch(`${API_BASE}/admin/approve_requirement`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requirement_id: requirementId,
      approved: approved,
      admin_notes: adminNotes,
    }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to approve requirement");
  }
  return res.json();
}

export async function getCustomerTrainersList(token) {
  const res = await fetch(`${API_BASE}/customer/trainers_list`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(errorData.detail || errorData.message || "Failed to fetch trainers");
  }
  return res.json();
}
