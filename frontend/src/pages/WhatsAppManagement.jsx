import React, { useState, useEffect } from 'react';
import { api } from '../api';

/**
 * WhatsApp User Management Component
 * Admin panel for managing WhatsApp integrations
 */
const WhatsAppManagement = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    phone_number: '',
    user_email: '',
    permissions: []
  });

  // Fetch WhatsApp users
  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await api.get('/whatsapp/users');
      setUsers(response.data.users || []);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to fetch WhatsApp users');
      console.error('Error fetching users:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle permission checkbox changes
  const handlePermissionChange = (permission) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  // Register new WhatsApp user
  const handleRegister = async (e) => {
    e.preventDefault();
    
    try {
      await api.post('/whatsapp/users/register', formData);
      alert('WhatsApp user registered successfully!');
      setShowAddForm(false);
      setFormData({ phone_number: '', user_email: '', permissions: [] });
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to register user');
      console.error('Error registering user:', err);
    }
  };

  // Delete WhatsApp user
  const handleDelete = async (phoneNumber) => {
    if (!window.confirm(`Delete WhatsApp user ${phoneNumber}?`)) return;
    
    try {
      await api.delete(`/whatsapp/users/${phoneNumber}`);
      alert('User deleted successfully');
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete user');
      console.error('Error deleting user:', err);
    }
  };

  // Toggle user active status
  const handleToggle = async (phoneNumber) => {
    try {
      await api.patch(`/whatsapp/users/${phoneNumber}/toggle`);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to toggle user status');
      console.error('Error toggling user:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg">Loading WhatsApp users...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">WhatsApp Integration Management</h1>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg"
          >
            {showAddForm ? 'Cancel' : '+ Add User'}
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {/* Add User Form */}
        {showAddForm && (
          <div className="bg-gray-50 p-6 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-4">Register WhatsApp User</h2>
            <form onSubmit={handleRegister}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Phone Number (with country code)
                  </label>
                  <input
                    type="text"
                    name="phone_number"
                    value={formData.phone_number}
                    onChange={handleInputChange}
                    placeholder="919876543210"
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Format: country code + number (no + or spaces)
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">
                    User Email
                  </label>
                  <input
                    type="email"
                    name="user_email"
                    value={formData.user_email}
                    onChange={handleInputChange}
                    placeholder="user@example.com"
                    className="w-full px-3 py-2 border rounded-lg"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Must be an existing user in the system
                  </p>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Permissions</label>
                <div className="flex gap-4">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes('search')}
                      onChange={() => handlePermissionChange('search')}
                      className="mr-2"
                    />
                    Search Trainers
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={formData.permissions.includes('bulk_upload')}
                      onChange={() => handlePermissionChange('bulk_upload')}
                      className="mr-2"
                    />
                    Bulk Upload
                  </label>
                </div>
              </div>

              <button
                type="submit"
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg"
              >
                Register User
              </button>
            </form>
          </div>
        )}

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Phone Number
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Permissions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Last Interaction
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                    No WhatsApp users registered yet
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.phone_number}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {user.phone_number}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{user.user_email}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
                        {user.user_role}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {user.permissions.join(', ')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          user.active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {user.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {user.last_interaction
                        ? new Date(user.last_interaction).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => handleToggle(user.phone_number)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        {user.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => handleDelete(user.phone_number)}
                        className="text-red-600 hover:text-red-900"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">📱 WhatsApp Bot Commands</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• Send "help" or "menu" for available commands</li>
            <li>• Send search query to find trainers (e.g., "Python developer in Bangalore")</li>
            <li>• Send PDF/DOC files to upload resumes</li>
            <li>• Send "status &lt;task_id&gt;" to check upload status</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppManagement;
