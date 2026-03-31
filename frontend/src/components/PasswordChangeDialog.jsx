import { useState } from "react";
import { useAuth } from "@/App";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, Shield, Key } from "lucide-react";

const PasswordChangeDialog = () => {
  const { user, showPasswordDialog, changePassword, keepPassword } = useAuth();
  const [mode, setMode] = useState("choice"); // "choice", "change"
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    const result = await changePassword(currentPassword, newPassword);
    setLoading(false);

    if (!result.success) {
      setError(result.error || "Failed to change password");
    }
  };

  const handleKeepPassword = async () => {
    setLoading(true);
    await keepPassword();
    setLoading(false);
  };

  if (!showPasswordDialog || !user) return null;

  return (
    <Dialog open={showPasswordDialog} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" data-testid="password-change-dialog">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#E40000] rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <DialogTitle className="text-xl font-['Outfit']">
              {mode === "choice" ? "Welcome!" : "Change Your Password"}
            </DialogTitle>
          </div>
          <DialogDescription className="text-gray-600">
            {mode === "choice" 
              ? "This is your first login. Would you like to change your default password for better security?"
              : "Enter your current password and choose a new one."
            }
          </DialogDescription>
        </DialogHeader>

        {mode === "choice" ? (
          <div className="space-y-4 py-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Key className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Security Recommendation</p>
                  <p className="text-sm text-amber-700 mt-1">
                    For your account security, we recommend changing your default password to something only you know.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleKeepPassword}
                disabled={loading}
                className="w-full sm:w-auto"
                data-testid="keep-password-button"
              >
                Keep Default Password
              </Button>
              <Button
                onClick={() => setMode("change")}
                disabled={loading}
                className="w-full sm:w-auto bg-[#E40000] hover:bg-[#B30000]"
                data-testid="change-password-button"
              >
                Change Password
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={handleChangePassword} className="space-y-4 py-4">
            {error && (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm" data-testid="password-error">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="current-password">Current Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="current-password"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pl-10 pr-10"
                  data-testid="current-password-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-password">New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                  className="pl-10 pr-10"
                  data-testid="new-password-input"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="pl-10"
                  data-testid="confirm-password-input"
                  required
                />
              </div>
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setMode("choice");
                  setError("");
                  setCurrentPassword("");
                  setNewPassword("");
                  setConfirmPassword("");
                }}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                Back
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="w-full sm:w-auto bg-[#E40000] hover:bg-[#B30000]"
                data-testid="submit-password-change"
              >
                {loading ? "Changing..." : "Change Password"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PasswordChangeDialog;
