import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API, formatApiError } from "@/App";
import axios from "axios";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, Trash2, User, Mail, Shield, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const UserManagementPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUserDialog, setAddUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", password: "", name: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role');

    if (error) throw error;
    setUsers(data);
  } catch (error) {
    toast.error(error.message || "Failed to load users");
  } finally {
    setLoading(false);
  }
}, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = async (e) => {
  e.preventDefault();
  if (!newUser.email || !newUser.password || !newUser.name) {
    toast.error("Please fill all fields");
    return;
  }

  setSaving(true);
  try {
    const { data, error } = await supabase.rpc('admin_create_user', {
      admin_id:     user.id,
      new_email:    newUser.email,
      new_password: newUser.password,
      new_name:     newUser.name,
    });

    if (error) throw error;

    setUsers(prev => [...prev, data]);
    setAddUserDialog(false);
    setNewUser({ email: "", password: "", name: "" });
    toast.success("User added successfully");
  } catch (error) {
    toast.error(error.message || "Failed to add user");
  } finally {
    setSaving(false);
  }
};

    setSaving(true);
    try {
      const response = await supabase.rpc('admin_create_user', {
        admin_id:     user.id,        // current logged-in admin's UUID
        new_email:    newUser.email,
        new_password: newUser.password,
        new_name:     newUser.name,
      });
      if (response.error) throw response.error;
      setUsers(prev => [...prev, response.data]);
      setAddUserDialog(false);
      setNewUser({ email: "", password: "", name: "" });
      toast.success("User added successfully");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to delete this user?")) return;

    setSaving(true);
    try {
      await axios.delete(`${API}/users/${userId}`);
      setUsers(prev => prev.filter(u => u.id !== userId));
      toast.success("User deleted");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="user-management-page">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/")}
                className="text-gray-600 hover:text-gray-900"
                data-testid="back-to-dashboard"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              <div className="h-6 w-px bg-gray-300"></div>
              <h1 className="text-lg font-bold text-gray-900 font-['Outfit']">User Management</h1>
            </div>
            <Button
              onClick={() => setAddUserDialog(true)}
              className="bg-[#E40000] hover:bg-[#B30000]"
              data-testid="add-user-button"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-[#E40000] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-12">
              <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No users found</p>
            </div>
          ) : (
            <Table data-testid="users-table">
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="font-semibold">Name</TableHead>
                  <TableHead className="font-semibold">Email</TableHead>
                  <TableHead className="font-semibold">Role</TableHead>
                  <TableHead className="font-semibold text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((u) => (
                  <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <span className="font-medium text-gray-900">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-gray-600">
                        <Mail className="w-4 h-4" />
                        {u.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={u.role === "admin" ? "default" : "secondary"}
                        className={u.role === "admin" ? "bg-[#E40000]" : ""}
                      >
                        <Shield className="w-3 h-3 mr-1" />
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {u.id !== user?.id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteUser(u.id)}
                          disabled={saving}
                          className="text-gray-400 hover:text-red-600"
                          data-testid={`delete-user-${u.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Managing Access</h3>
          <p className="text-sm text-blue-700">
            Add authorized email addresses and set default passwords for users who need access to the PPO Tracker.
            Users can log in with their email and the password you set.
          </p>
        </div>
      </main>

      {/* Add User Dialog */}
      <Dialog open={addUserDialog} onOpenChange={setAddUserDialog}>
        <DialogContent className="sm:max-w-md" data-testid="add-user-dialog">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">Add New User</DialogTitle>
          </DialogHeader>
          <form onSubmit={addUser} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newUser.name}
                onChange={(e) => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Full Name"
                className="mt-1"
                data-testid="new-user-name-input"
              />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={newUser.email}
                onChange={(e) => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                placeholder="user@airtel.com"
                className="mt-1"
                data-testid="new-user-email-input"
              />
            </div>
            <div>
              <Label htmlFor="password">Default Password</Label>
              <div className="relative mt-1">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={newUser.password}
                  onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="Set a password"
                  className="pr-10"
                  data-testid="new-user-password-input"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddUserDialog(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#E40000] hover:bg-[#B30000]"
                data-testid="add-user-submit"
              >
                {saving ? "Adding..." : "Add User"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserManagementPage;
