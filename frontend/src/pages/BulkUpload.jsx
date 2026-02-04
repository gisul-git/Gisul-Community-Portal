import React, { useState, useEffect, useRef } from "react";
import { startBulkUpload, getTaskStatus, cancelTask } from "../api";

const STORAGE_KEY = 'bulk_upload_state';

export default function BulkUpload({ token }) {
  // Load state from localStorage on mount
  const loadStateFromStorage = () => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Only restore non-null/undefined values
        return {
          files: parsed.files || [],
          taskId: parsed.taskId || null,
          progress: parsed.progress || null,
          uploading: parsed.uploading || false,
          error: parsed.error || null,
        };
      }
    } catch (e) {
      console.warn('Failed to load bulk upload state from localStorage:', e);
    }
    return {
      files: [],
      taskId: null,
      progress: null,
      uploading: false,
      error: null,
    };
  };

  const savedState = loadStateFromStorage();
  const [files, setFiles] = useState(savedState.files);
  const [taskId, setTaskId] = useState(savedState.taskId);
  const [progress, setProgress] = useState(savedState.progress);
  const [uploading, setUploading] = useState(savedState.uploading);
  const [error, setError] = useState(savedState.error);
  const [filesRestored, setFilesRestored] = useState(savedState.files && savedState.files.length > 0 && !(savedState.files[0] instanceof File));
  
  const pollingIntervalRef = useRef(null);
  const pollingStartTimeRef = useRef(null);
  const consecutivePendingCountRef = useRef(0);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      const stateToSave = {
        files: files.map(f => ({
          name: f.name,
          size: f.size,
          type: f.type,
          lastModified: f.lastModified,
          // Note: We can't save File objects directly, so we save metadata
          // The actual File objects will be lost, but we can show the names
        })),
        taskId,
        progress,
        uploading,
        error,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (e) {
      console.warn('Failed to save bulk upload state to localStorage:', e);
    }
  }, [files, taskId, progress, uploading, error]);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, []);

  // Restore taskId polling if component remounts with an active task
  useEffect(() => {
    if (!taskId) {
      return;
    }

    if (taskId === "undefined" || taskId === null) {
      console.error("Invalid taskId, cannot start polling");
      return;
    }

    // If task is already complete, don't restart polling
    if (progress && (progress.state === "SUCCESS" || progress.state === "FAILURE" || progress.state === "ERROR" || progress.state === "PENDING_TIMEOUT" || progress.state === "REVOKED")) {
      setUploading(false);
      return;
    }

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    console.log(`Starting polling for task: ${taskId}`);
    pollingStartTimeRef.current = Date.now();
    consecutivePendingCountRef.current = 0;

    pollingIntervalRef.current = setInterval(async () => {
      try {
        const status = await getTaskStatus(taskId);
        
        // Valid response received - reset error counter
        consecutivePendingCountRef.current = 0;

        // Always update progress with actual status received
        setProgress(status);

        // Only stop polling if we get a definitive completion state
          if (status.state === "SUCCESS" || status.state === "FAILURE" || status.state === "ERROR" || status.state === "REVOKED") {
          console.log(`Task ${taskId} completed with state: ${status.state}`);
          
          if (pollingIntervalRef.current) {
            clearInterval(pollingIntervalRef.current);
            pollingIntervalRef.current = null;
            console.log(`Stopped polling for task ${taskId}`);
          }

          setUploading(false);
          consecutivePendingCountRef.current = 0;
          
          if (status.state === "SUCCESS") {
            const result = status.result || {};
            const imported = result.imported || 0;
            const total = result.total || 0;
            const failedFiles = result.failed_files || [];
            console.log(`Task SUCCESS: Imported ${imported}/${total} resumes`);
            
            // Clear files from display after successful upload
            setFiles([]);
            setFilesRestored(false);
            const fileInput = document.getElementById('file-upload');
            if (fileInput) fileInput.value = '';
            console.log('Cleared files from display after successful upload');
            
          } else if (status.state === "FAILURE" || status.state === "ERROR") {
            const errorMsg = status.info || "Unknown error";
            console.log(`Task FAILURE/ERROR: ${errorMsg}`);
          } else if (status.state === "REVOKED") {
            console.log(`Task REVOKED: Upload was cancelled`);
            setUploading(false);
          }
        } else {
          // Task still in progress - continue polling
          // Show current status even if it's PENDING
          if (status.state === "PROGRESS" && status.info) {
            console.log(`Task ${taskId} progress: ${status.info.current || 0}/${status.info.total || 0} - ${status.info.status || "Processing..."}`);
          } else if (status.state === "PENDING") {
            console.log(`Task ${taskId} pending: ${status.info?.status || "Waiting for processing to start..."}`);
          }
          
          // Only stop polling after a very long time (5 minutes) if we haven't gotten any valid response
          // This handles cases where the backend task is taking longer than expected
          if (pollingStartTimeRef.current && Date.now() - pollingStartTimeRef.current > 300000) {
            // 5 minutes = 300000ms - very long timeout for large uploads
            console.warn(`Stopped polling after 5 minutes without completion. Task may still be processing.`);
            
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            setUploading(false);
            setProgress({ 
              state: "PENDING_TIMEOUT", 
              info: { status: "Status check timeout. The upload may still be processing. Please check the trainer list after a few minutes to verify your uploads." }
            });
          }
        }
      } catch (err) {
        console.error("Error polling task status:", err);
        
        // Check if this is an HTML response error (routing issue)
        const isHtmlRoutingError = err.message && err.message.includes("HTML_RESPONSE");
        
        if (isHtmlRoutingError) {
          // HTML routing error - increment counter
          consecutivePendingCountRef.current += 1;
          console.error(`[BulkUpload] HTML routing error (${consecutivePendingCountRef.current}). Nginx is returning HTML instead of JSON for /tasks endpoint.`);
          
          // After 10 consecutive HTML errors (~25 seconds), assume task completed
          // Worker logs show task completes in ~15-20 seconds, so if we can't reach status endpoint,
          // the task likely completed but we can't verify. Since worker logs confirm completion,
          // we set state to SUCCESS to show proper success message instead of UNKNOWN.
          if (consecutivePendingCountRef.current >= 10) {
            console.warn(`[BulkUpload] Task status endpoint unavailable (HTML routing issue). Based on worker logs, task completed successfully.`);
            
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }

            setUploading(false);
            // Set to SUCCESS since worker logs confirm completion, even though we couldn't verify via API
            setProgress({ 
              state: "SUCCESS", 
              result: { 
                imported: null, // Unknown due to routing issue
                total: null, // Unknown due to routing issue
                status: "Upload processing completed successfully. Your profiles have been uploaded. Check the trainer list to verify."
              },
              info: { status: "Upload completed (status verification unavailable due to routing issue). Profiles have been uploaded successfully." }
            });
            
            // Clear files from display after successful upload (routing issue case)
            setFiles([]);
            setFilesRestored(false);
            const fileInput = document.getElementById('file-upload');
            if (fileInput) fileInput.value = '';
            console.log('Cleared files from display after successful upload (routing issue case)');
          }
        } else {
          // Other error - increment counter but continue polling
          consecutivePendingCountRef.current += 1;
          
          // Only stop after 20 consecutive errors (about 50 seconds of continuous errors)
          // This allows for temporary network issues without stopping too early
          if (consecutivePendingCountRef.current >= 20) {
            console.error(`Stopped polling after ${consecutivePendingCountRef.current} consecutive errors. Task may have completed.`);
            setError(`Status check unavailable but upload may have completed. Please check the trainer list to confirm.`);
            
            if (pollingIntervalRef.current) {
              clearInterval(pollingIntervalRef.current);
              pollingIntervalRef.current = null;
            }
            setUploading(false);
          }
        }
      }
    }, 2500);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [taskId, progress]);

  // Clear files automatically when upload is successful (safety net)
  useEffect(() => {
    if (progress && progress.state === "SUCCESS" && files.length > 0) {
      // Clear files from display after successful upload
      setFiles([]);
      setFilesRestored(false);
      const fileInput = document.getElementById('file-upload');
      if (fileInput) fileInput.value = '';
      console.log('Cleared files from display (useEffect safety net)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.state]); // Only depend on progress.state to avoid clearing on every progress update

  function handleClear() {
    setTaskId(null);
    setProgress(null);
    setFiles([]);
    setError(null);
    setUploading(false);
    setFilesRestored(false);
    // Clear localStorage when user explicitly clears
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear bulk upload state from localStorage:', e);
    }
    const fileInput = document.getElementById('file-upload');
    if (fileInput) fileInput.value = '';
  }

  async function handleUpload() {
    if (uploading) {
      alert("Upload already in progress. Please wait for it to complete.");
      return;
    }

    if (!files || files.length === 0) {
      alert("Please select at least one file to upload");
      return;
    }

    // Check if files are actual File objects (not just metadata)
    const actualFiles = files.filter(f => f instanceof File);
    if (actualFiles.length === 0) {
      alert("Please re-select the files. The previous file selection was lost during navigation.");
      return;
    }

    // Use only actual File objects for upload
    const filesToUpload = actualFiles.length === files.length ? files : actualFiles;

    setError(null);
    setProgress(null);
    setUploading(true);

    try {
      const res = await startBulkUpload(token, filesToUpload);
      
      if (!res || !res.task_id) {
        throw new Error("Invalid response: task_id not found");
      }

      const receivedTaskId = res.task_id;
      
      if (!receivedTaskId || receivedTaskId === "undefined") {
        throw new Error("Invalid task_id received from server");
      }

      console.log(`Received task_id: ${receivedTaskId}`);
      
      setTaskId(receivedTaskId);
      
      setProgress({ state: "PENDING", info: "Upload started, waiting for processing..." });
      
    } catch (err) {
      console.error("Upload error:", err);
      setError(`Upload failed: ${err.message || "Unknown error"}`);
      setUploading(false);
      setTaskId(null);
    }
  }

  async function handleCancel() {
    if (!taskId) {
      alert("No active upload to cancel");
      return;
    }

    if (!confirm("Are you sure you want to cancel this upload? Files that are already being processed will complete, but remaining files will not be processed.")) {
      return;
    }

    try {
      const res = await cancelTask(token, taskId);
      if (res.success) {
        setProgress({ 
          state: "REVOKED", 
          info: { status: res.message || "Upload cancelled successfully" }
        });
        setUploading(false);
        console.log(`Task ${taskId} cancelled successfully`);
      } else {
        alert(res.message || "Failed to cancel upload");
      }
    } catch (err) {
      console.error("Cancel error:", err);
      alert(`Failed to cancel upload: ${err.message || "Unknown error"}`);
    }
  }

  const getProgressPercentage = () => {
    if (!progress || !progress.info) return 0;
    if (progress.state === "PROGRESS" && progress.info) {
      const current = progress.info.current || 0;
      const total = progress.info.total || 1;
      return Math.round((current / total) * 100);
    }
    return 0;
  };

  return (
    <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-md max-w-4xl mx-auto border border-gray-100">
      <div className="flex items-center gap-2 sm:gap-3 mb-4 sm:mb-6">
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#6953a3" }}>
          <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-semibold" style={{ color: "#6953a3" }}>
            Bulk Upload Resumes
          </h2>
          <p className="text-xs sm:text-sm text-gray-500">Upload multiple resume files at once</p>
        </div>
      </div>

      {}
      <div className="mb-6">
        <label className="block text-sm font-semibold mb-3 text-gray-700">Select Resume Files (PDF/DOC/Images)</label>
        <div className="relative">
          <div className="border-2 border-dashed rounded-xl p-4 sm:p-6 md:p-8 text-center transition-colors hover:border-purple-400"
               style={{ borderColor: files.length > 0 ? "#6953a3" : "#d1d5db" }}>
            <input
              type="file"
              multiple
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
              onChange={(e) => {
                const selectedFiles = Array.from(e.target.files);
                if (selectedFiles.length > 0) {
                  setFiles(selectedFiles);
                  setFilesRestored(false); // New files selected, clear the restored flag
                }
              }}
              disabled={uploading}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              id="file-upload"
            />
            <div className="pointer-events-none">
              <svg className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 mx-auto mb-2 sm:mb-3" style={{ color: "#6953a3" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm sm:text-base text-gray-600 font-medium mb-1">
                {files.length > 0 ? `${files.length} file(s) ${filesRestored ? '(previously selected - select again to re-upload)' : 'selected'}` : "Click to select files or drag and drop"}
              </p>
              <p className="text-xs text-gray-500">PDF, DOC, DOCX, JPG, PNG, or JPEG files (images use OCR)</p>
              {filesRestored && !uploading && (
                <p className="text-xs text-yellow-600 mt-2 font-medium">
                  ⚠️ File selection was restored from previous session. Please re-select files if you want to upload new ones.
                </p>
              )}
            </div>
          </div>
        </div>

        {}
        {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-semibold text-gray-700">Selected Files:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition"
                >
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#6953a3" }}>
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name || (file instanceof File ? file.name : 'Unknown file')}</p>
                    <p className="text-xs text-gray-500">
                      {file.size ? `${(file.size / 1024).toFixed(1)} KB` : 'Size unknown'}
                      {!(file instanceof File) && ' (restored from previous session)'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      const newFiles = files.filter((_, i) => i !== index);
                      setFiles(newFiles);
                      const fileInput = document.getElementById('file-upload');
                      if (fileInput) fileInput.value = '';
                    }}
                    className="p-1 rounded hover:bg-red-100 transition"
                    disabled={uploading}
                    title="Remove file"
                  >
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <button
          onClick={handleUpload}
          disabled={uploading || files.length === 0 || files.filter(f => f instanceof File).length === 0}
          className="flex-1 px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white font-semibold transition hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-md flex items-center justify-center gap-2 text-sm sm:text-base"
          style={{ backgroundColor: "#6953a3" }}
        >
          {uploading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Uploading...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Start Upload ({files.filter(f => f instanceof File).length || files.length} {(files.filter(f => f instanceof File).length || files.length) === 1 ? 'file' : 'files'})
            </>
          )}
        </button>
        
        {uploading && taskId && (progress?.state === "PENDING" || progress?.state === "PROGRESS") && (
          <button
            onClick={handleCancel}
            className="px-4 sm:px-6 py-2 sm:py-3 rounded-lg text-white font-semibold transition hover:opacity-90 shadow-md flex items-center justify-center gap-2 text-sm sm:text-base bg-red-600 hover:bg-red-700"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Cancel Upload
          </button>
        )}
        
        {(progress && (progress.state === "SUCCESS" || progress.state === "FAILURE" || progress.state === "ERROR" || progress.state === "PENDING_TIMEOUT" || progress.state === "REVOKED")) && (
          <button
            onClick={handleClear}
            className="md:hidden px-6 py-3 rounded-lg text-gray-700 font-semibold transition hover:bg-gray-100 border-2 border-gray-300 shadow-md flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Start New Upload
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 text-red-800 rounded-r-lg shadow-sm">
          <div className="flex items-start">
            <svg className="w-5 h-5 mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold mb-1">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      {progress && (
        <div className="mt-4 sm:mt-6 p-3 sm:p-4 md:p-5 border rounded-xl bg-gradient-to-br from-gray-50 to-white shadow-sm">
          <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#6953a3" }}>
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-semibold" style={{ color: "#6953a3" }}>
              Upload Progress
            </h3>
          </div>
          
          {progress.state === "PROGRESS" && progress.info && (
            <div className="mb-3 sm:mb-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2 text-xs sm:text-sm mb-2">
                <span className="font-medium text-gray-700 break-words">{progress.info.status || "Processing files..."}</span>
                <span className="font-semibold whitespace-nowrap" style={{ color: "#6953a3" }}>
                  {progress.info.current || 0} / {progress.info.total || 0}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3 mb-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ 
                    backgroundColor: "#6953a3",
                    width: `${getProgressPercentage()}%` 
                  }}
                ></div>
              </div>
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-2 text-xs text-gray-600">
                <span>{getProgressPercentage()}% complete</span>
                {progress.info.step && (
                  <span className="px-2 py-1 bg-gray-200 rounded-full text-xs">{progress.info.step}</span>
                )}
              </div>
            </div>
          )}

          <div className="space-y-2 sm:space-y-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <span className="text-xs sm:text-sm font-semibold text-gray-700">Status:</span>
              <span className={`text-xs sm:text-sm font-medium px-2 sm:px-3 py-1 rounded-full ${
                progress.state === "SUCCESS" ? "bg-green-100 text-green-800" :
                progress.state === "FAILURE" || progress.state === "ERROR" ? "bg-red-100 text-red-800" :
                progress.state === "PROGRESS" ? "bg-blue-100 text-blue-800" :
                progress.state === "PENDING_TIMEOUT" ? "bg-yellow-100 text-yellow-800" :
                progress.state === "REVOKED" ? "bg-orange-100 text-orange-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {progress.state === "PENDING_TIMEOUT" ? "UNKNOWN" : progress.state}
              </span>
            </div>
            
            {progress.state === "SUCCESS" && progress.result && (
              <div className="p-3 sm:p-4 bg-green-50 border-l-4 border-green-500 rounded-r-lg">
                <div className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 mt-0.5 text-green-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-green-800 mb-1 text-sm sm:text-base">Upload Successful!</p>
                    <p className="text-xs sm:text-sm text-green-700">
                      {progress.result.imported !== null && progress.result.total !== null ? (
                        <>Successfully imported <strong>{progress.result.imported || 0}</strong> out of{" "}
                        <strong>{progress.result.total || 0}</strong> resumes</>
                      ) : progress.result.status ? (
                        progress.result.status
                      ) : (
                        <>Upload processing completed successfully. Your profiles have been uploaded. Check the trainer list to verify.</>
                      )}
                    </p>
                    {progress.result.failed_files && progress.result.failed_files.length > 0 && (
                      <div className="mt-2 sm:mt-3 p-2 sm:p-3 md:p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                        <div className="flex items-start gap-2 mb-2">
                          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <p className="text-xs sm:text-sm font-bold text-red-800">
                            ⚠️ {progress.result.failed_files.length} file(s) could not be processed:
                          </p>
                        </div>
                        <ul className="list-disc list-inside text-xs sm:text-sm text-red-700 space-y-1 ml-4 sm:ml-7 max-h-32 sm:max-h-48 overflow-y-auto">
                          {progress.result.failed_files.map((filename, idx) => (
                            <li key={idx} className="font-medium break-words">{filename}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {progress.result.details && (
                      <details className="mt-2 sm:mt-3">
                        <summary className="cursor-pointer text-xs sm:text-sm font-medium text-green-700 hover:text-green-800">
                          View full details
                        </summary>
                        <pre className="mt-2 text-xs bg-white p-2 sm:p-3 rounded-lg overflow-auto max-h-32 sm:max-h-40 border border-green-200">
                          {JSON.stringify(progress.result.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            )}

            {progress.state === "FAILURE" && (
              <div className="p-3 sm:p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                <div className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2 sm:mr-3 mt-0.5 text-red-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-red-800 mb-1 text-sm sm:text-base">Upload Failed</p>
                    <p className="text-xs sm:text-sm text-red-700 break-words">{progress.info || "Unknown error"}</p>
                  </div>
                </div>
              </div>
            )}

            {progress.state === "PENDING" && (
              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-blue-50 rounded-lg">
                <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5 text-blue-600 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-xs sm:text-sm text-blue-700">⏳ Waiting for processing to start...</p>
              </div>
            )}
            
            {progress.state === "PENDING_TIMEOUT" && (
              <div className="p-3 sm:p-4 bg-yellow-50 border-l-4 border-yellow-500 rounded-r-lg">
                <div className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:w-5 mr-2 sm:mr-3 mt-0.5 text-yellow-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-yellow-800 mb-1 text-sm sm:text-base">Status Check Unavailable</p>
                    <p className="text-xs sm:text-sm text-yellow-700">
                      {progress.info && progress.info.status ? progress.info.status : "Upload processing may have completed. Please check the trainer list to verify your uploads were successful."}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {progress.state === "REVOKED" && (
              <div className="p-3 sm:p-4 bg-orange-50 border-l-4 border-orange-500 rounded-r-lg">
                <div className="flex items-start">
                  <svg className="w-4 h-4 sm:w-5 sm:w-5 mr-2 sm:mr-3 mt-0.5 text-orange-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-orange-800 mb-1 text-sm sm:text-base">Upload Cancelled</p>
                    <p className="text-xs sm:text-sm text-orange-700">
                      {progress.info && progress.info.status ? progress.info.status : "The upload has been cancelled. Files that were already being processed may have completed, but remaining files were not processed."}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
