import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, supabase, formatApiError } from "@/App";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LogOut, Users, ChevronDown, ChevronUp, Plus, Trash2,
  Calendar as CalendarIcon, MessageSquare, Edit2, Check, X,
  MoreVertical, Clock, List, FileText, FileSpreadsheet,
  ChevronLeft, ChevronRight, Download, GripVertical
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, parseISO, isValid } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import PasswordChangeDialog from "@/components/PasswordChangeDialog";

// ── Red circular loading screen ───────────────────────────────────────────────
const LoadingScreen = () => {
  const [pct, setPct] = useState(0);
  const r = 42;
  const circumference = 2 * Math.PI * r; // 263.9

  useEffect(() => {
    setPct(0);
    const duration = 1800;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(100, Math.round(((now - start) / duration) * 100));
      setPct(p);
      if (p < 100) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);

  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center" data-testid="dashboard-loading">
      <div className="relative w-40 h-40">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
          <circle
            cx="50" cy="50" r={r}
            fill="none"
            stroke="#E40000"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.05s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-[#E40000] font-['Outfit']">{pct}%</span>
        </div>
      </div>
      <p className="mt-6 text-sm text-gray-400 uppercase tracking-widest font-medium">Loading your dashboard</p>
      <div className="mt-4 flex items-center gap-2 opacity-40">
        <div className="w-6 h-6 bg-[#E40000] rounded flex items-center justify-center">
          <span className="text-white font-bold text-xs font-['Outfit']">A</span>
        </div>
        <span className="text-xs font-bold text-gray-500 tracking-widest uppercase font-['Outfit']">Airtel</span>
      </div>
    </div>
  );
};

// ── Dashboard Page ────────────────────────────────────────────────────────────
const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [editingWeekTitle, setEditingWeekTitle] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addTaskDialog, setAddTaskDialog] = useState({ open: false, weekId: null });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(null);
  const [commentDialog, setCommentDialog] = useState({ open: false, weekId: null, taskId: null, task: null });
  const [newComment, setNewComment] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayTasksDialog, setDayTasksDialog] = useState({ open: false, date: null, tasks: [] });
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverTask, setDragOverTask] = useState(null);

  // ── Fetch data ───────────────────────────────────────────────────────────────
  const fetchWeeks = useCallback(async () => {
    try {
      const { data: weeksData, error } = await supabase
        .from('weeks').select('*').order('week_number');
      if (error) throw error;

      for (const week of weeksData) {
        const { data: tasks } = await supabase
          .from('tasks').select('*').eq('week_id', week.id).order('position');
        for (const task of tasks || []) {
          const { data: comments } = await supabase
            .from('comments').select('*').eq('task_id', task.id).order('created_at');
          task.comments = comments || [];
        }
        week.tasks = tasks || [];
      }

      setWeeks(weeksData);
      const expanded = {};
      weeksData.forEach(w => { expanded[w.id] = true; });
      setExpandedWeeks(expanded);
    } catch (error) {
      toast.error(formatApiError(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchWeeks(); }, [fetchWeeks]);

  // ── Drag & Drop ──────────────────────────────────────────────────────────────
  const handleDragStart = (e, task, weekId) => {
    setDraggedTask({ task, weekId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    e.currentTarget.style.opacity = "0.5";
  };
  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
    setDraggedTask(null); setDragOverTask(null);
  };
  const handleDragOver = (e, task, weekId) => {
    e.preventDefault();
    if (draggedTask && draggedTask.weekId === weekId && draggedTask.task.id !== task.id)
      setDragOverTask({ task, weekId });
  };
  const handleDragLeave = (e) => { e.preventDefault(); };
  const handleDrop = async (e, targetTask, weekId) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.weekId !== weekId) return;
    const week = weeks.find(w => w.id === weekId);
    if (!week) return;
    const oldIdx = week.tasks.findIndex(t => t.id === draggedTask.task.id);
    const newIdx = week.tasks.findIndex(t => t.id === targetTask.id);
    if (oldIdx === newIdx) return;
    const newTasks = [...week.tasks];
    const [moved] = newTasks.splice(oldIdx, 1);
    newTasks.splice(newIdx, 0, moved);
    setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, tasks: newTasks } : w));
    setDraggedTask(null); setDragOverTask(null);
    setSaving(true);
    try {
      for (let i = 0; i < newTasks.length; i++)
        await supabase.from('tasks').update({ position: i }).eq('id', newTasks[i].id);
      toast.success("Tasks reordered");
    } catch { toast.error("Failed to save task order"); fetchWeeks(); }
    finally { setSaving(false); }
  };

  // ── Progress ─────────────────────────────────────────────────────────────────
  const calculateOverallProgress = () => {
    let total = 0, done = 0;
    weeks.forEach(w => { total += w.tasks?.length || 0; done += w.tasks?.filter(t => t.completed).length || 0; });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };
  const calculateWeekProgress = (week) => {
    const tasks = week.tasks || [];
    const done = tasks.filter(t => t.completed).length;
    return tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;
  };
  const toggleWeek = (weekId) => setExpandedWeeks(prev => ({ ...prev, [weekId]: !prev[weekId] }));

  // ── CRUD ─────────────────────────────────────────────────────────────────────
  const updateWeekTitle = async (weekId, title) => {
    setSaving(true);
    try {
      await supabase.from('weeks').update({ title, updated_at: new Date().toISOString() }).eq('id', weekId);
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, title } : w));
      setEditingWeekTitle(null);
      toast.success("Week title updated");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const toggleTaskCompletion = async (weekId, taskId, completed) => {
    setSaving(true);
    try {
      await supabase.from('tasks').update({ completed: !completed, updated_at: new Date().toISOString() }).eq('id', taskId);
      setWeeks(prev => prev.map(w => w.id === weekId
        ? { ...w, tasks: w.tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t) } : w));
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const updateTask = async (weekId, taskId, data) => {
    setSaving(true);
    try {
      await supabase.from('tasks').update({ ...data, updated_at: new Date().toISOString() }).eq('id', taskId);
      setWeeks(prev => prev.map(w => w.id === weekId
        ? { ...w, tasks: w.tasks.map(t => t.id === taskId ? { ...t, ...data } : t) } : w));
      setEditingTaskId(null);
      toast.success("Task updated");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    setSaving(true);
    try {
      const { data: existing } = await supabase.from('tasks').select('position')
        .eq('week_id', addTaskDialog.weekId).order('position', { ascending: false }).limit(1);
      const maxPos = existing?.[0]?.position || 0;
      const taskId = `task-${Date.now()}`;
      const newTask = {
        id: taskId, week_id: addTaskDialog.weekId, title: newTaskTitle,
        completed: false, due_date: newTaskDueDate ? format(newTaskDueDate, "yyyy-MM-dd") : null,
        position: maxPos + 1, created_by: user?.id
      };
      await supabase.from('tasks').insert(newTask);
      setWeeks(prev => prev.map(w => w.id === addTaskDialog.weekId
        ? { ...w, tasks: [...(w.tasks || []), { ...newTask, comments: [] }] } : w));
      setAddTaskDialog({ open: false, weekId: null });
      setNewTaskTitle(""); setNewTaskDueDate(null);
      toast.success("Task added");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const deleteTask = async (weekId, taskId) => {
    setSaving(true);
    try {
      await supabase.from('comments').delete().eq('task_id', taskId);
      await supabase.from('tasks').delete().eq('id', taskId);
      setWeeks(prev => prev.map(w => w.id === weekId
        ? { ...w, tasks: w.tasks.filter(t => t.id !== taskId) } : w));
      toast.success("Task deleted");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    setSaving(true);
    try {
      const nc = { id: `comment-${Date.now()}`, task_id: commentDialog.taskId, text: newComment, created_by: user?.id, created_by_name: user?.name };
      await supabase.from('comments').insert(nc);
      setWeeks(prev => prev.map(w => w.id === commentDialog.weekId
        ? { ...w, tasks: w.tasks.map(t => t.id === commentDialog.taskId ? { ...t, comments: [...(t.comments || []), nc] } : t) } : w));
      setCommentDialog(prev => ({ ...prev, task: { ...prev.task, comments: [...(prev.task?.comments || []), nc] } }));
      setNewComment("");
      toast.success("Comment added");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  const deleteComment = async (commentId) => {
    setSaving(true);
    try {
      await supabase.from('comments').delete().eq('id', commentId);
      setWeeks(prev => prev.map(w => w.id === commentDialog.weekId
        ? { ...w, tasks: w.tasks.map(t => t.id === commentDialog.taskId ? { ...t, comments: (t.comments || []).filter(c => c.id !== commentId) } : t) } : w));
      setCommentDialog(prev => ({ ...prev, task: { ...prev.task, comments: (prev.task?.comments || []).filter(c => c.id !== commentId) } }));
      toast.success("Comment deleted");
    } catch (e) { toast.error(formatApiError(e)); }
    finally { setSaving(false); }
  };

  // ── Calendar ─────────────────────────────────────────────────────────────────
  const getTasksWithDueDates = () => {
    const map = {};
    weeks.forEach(week => {
      (week.tasks || []).forEach(task => {
        if (task.due_date) {
          if (!map[task.due_date]) map[task.due_date] = [];
          map[task.due_date].push({ ...task, weekId: week.id, weekTitle: week.title });
        }
      });
    });
    return map;
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pw = doc.internal.pageSize.getWidth();
    doc.setFontSize(20); doc.setTextColor(228, 0, 0);
    doc.text("Airtel 8-Week PPO Execution Plan", pw / 2, 20, { align: "center" });
    doc.setFontSize(12); doc.setTextColor(100);
    doc.text(`Progress Report - ${format(new Date(), "MMMM d, yyyy")}`, pw / 2, 30, { align: "center" });
    const op = calculateOverallProgress();
    const tt = weeks.reduce((s, w) => s + (w.tasks?.length || 0), 0);
    const ct = weeks.reduce((s, w) => s + (w.tasks?.filter(t => t.completed).length || 0), 0);
    doc.setFontSize(14); doc.setTextColor(0);
    doc.text(`Overall Progress: ${op}% (${ct}/${tt} tasks completed)`, 14, 45);
    let y = 55;
    weeks.forEach(week => {
      if (y > 250) { doc.addPage(); y = 20; }
      const wp = calculateWeekProgress(week);
      const wc = week.tasks?.filter(t => t.completed).length || 0;
      const wt = week.tasks?.length || 0;
      doc.setFontSize(12); doc.setTextColor(228, 0, 0);
      doc.text(`Week ${week.week_number}: ${week.title}`, 14, y);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`${wp}% complete (${wc}/${wt})`, 14, y + 6);
      y += 12;
      const rows = (week.tasks || []).map(t => [t.completed ? "✓" : "○", t.title, t.due_date ? format(parseISO(t.due_date), "MMM d, yyyy") : "-", t.completed ? "Done" : "Pending"]);
      if (rows.length > 0) {
        autoTable(doc, { startY: y, head: [["", "Task", "Due Date", "Status"]], body: rows, theme: "striped", headStyles: { fillColor: [228, 0, 0] }, columnStyles: { 0: { cellWidth: 10 }, 1: { cellWidth: 100 }, 2: { cellWidth: 35 }, 3: { cellWidth: 25 } }, margin: { left: 14, right: 14 } });
        y = doc.lastAutoTable.finalY + 15;
      } else y += 10;
    });
    const pages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150);
      doc.text(`Page ${i} of ${pages}`, pw - 20, doc.internal.pageSize.getHeight() - 10);
      doc.text("Airtel SCM Digital Transformation", 14, doc.internal.pageSize.getHeight() - 10);
    }
    doc.save(`Airtel_PPO_Progress_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF exported successfully");
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();
    const summary = [
      ["Airtel 8-Week PPO Execution Plan"],
      [`Report Date: ${format(new Date(), "MMMM d, yyyy")}`], [],
      ["Overall Progress", `${calculateOverallProgress()}%`],
      ["Total Tasks", weeks.reduce((s, w) => s + (w.tasks?.length || 0), 0)],
      ["Completed Tasks", weeks.reduce((s, w) => s + (w.tasks?.filter(t => t.completed).length || 0), 0)], [],
      ["Week", "Title", "Progress", "Completed", "Total"],
      ...weeks.map(w => [`Week ${w.week_number}`, w.title, `${calculateWeekProgress(w)}%`, w.tasks?.filter(t => t.completed).length || 0, w.tasks?.length || 0])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    const allTasks = [["Week", "Task Title", "Due Date", "Status", "Comments"]];
    weeks.forEach(w => (w.tasks || []).forEach(t => allTasks.push([`Week ${w.week_number}: ${w.title}`, t.title, t.due_date ? format(parseISO(t.due_date), "yyyy-MM-dd") : "", t.completed ? "Completed" : "Pending", (t.comments || []).length])));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(allTasks), "All Tasks");
    weeks.forEach(w => {
      const data = [[`Week ${w.week_number}: ${w.title}`], [`Progress: ${calculateWeekProgress(w)}%`], [], ["Task", "Due Date", "Status", "Comments"],
        ...(w.tasks || []).map(t => [t.title, t.due_date ? format(parseISO(t.due_date), "yyyy-MM-dd") : "", t.completed ? "Completed" : "Pending", (t.comments || []).map(c => c.text).join("; ")])];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), `Week ${w.week_number}`);
    });
    saveAs(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `Airtel_PPO_Progress_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel exported successfully");
  };

  // ── Derived ──────────────────────────────────────────────────────────────────
  const overallProgress = calculateOverallProgress();
  const totalTasks = weeks.reduce((s, w) => s + (w.tasks?.length || 0), 0);
  const completedTasks = weeks.reduce((s, w) => s + (w.tasks?.filter(t => t.completed).length || 0), 0);
  const monthStart = startOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: endOfMonth(currentMonth) });
  const tasksMap = getTasksWithDueDates();
  const paddingDays = Array(monthStart.getDay()).fill(null);

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50" data-testid="dashboard-page">
      <PasswordChangeDialog />

      {/* Red circular loading overlay */}
      {loading && <LoadingScreen />}

      {/* Header — always rendered */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E40000] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg font-['Outfit']">A</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 font-['Outfit'] tracking-tight">AIRTEL</h1>
                <p className="text-xs text-gray-500 uppercase tracking-wider">SCM Digital Transformation</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {saving && (
                <div className="flex items-center gap-2 text-gray-500 text-sm" data-testid="save-indicator">
                  <div className="w-4 h-4 border-2 border-[#E40000] border-t-transparent rounded-full animate-spin" />
                  Saving...
                </div>
              )}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
              {user?.role === "admin" && (
                <Button variant="outline" size="sm" onClick={() => navigate("/users")} className="border-gray-300 hover:bg-gray-50" data-testid="user-management-link">
                  <Users className="w-4 h-4 mr-2" />Users
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={logout} className="text-gray-600 hover:text-gray-900 hover:bg-gray-100" data-testid="logout-button">
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content — only after loading */}
      {!loading && (
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {/* Title */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest mb-2">
              <CalendarIcon className="w-4 h-4" />8-Week PPO Execution Plan
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 font-['Outfit'] tracking-tight">Track Your Internship Progress</h2>
                <p className="text-gray-600 mt-2">Click any task or week title to edit · All changes auto-saved</p>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-gray-300" data-testid="export-dropdown">
                    <Download className="w-4 h-4 mr-2" />Export<ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToPDF} data-testid="export-pdf"><FileText className="w-4 h-4 mr-2 text-red-600" />Export as PDF</DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToExcel} data-testid="export-excel"><FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />Export as Excel</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Overall Progress Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-8" data-testid="overall-progress-card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 font-['Outfit']">Overall Progress</h3>
              <span className="text-3xl font-bold text-[#E40000] font-['Outfit']" data-testid="overall-progress-percentage">{overallProgress}%</span>
            </div>
            <Progress value={overallProgress} className="h-3 bg-gray-100" data-testid="overall-progress-bar" />
            <p className="text-sm text-gray-500 mt-3" data-testid="tasks-completed-count">{completedTasks} of {totalTasks} tasks completed</p>
          </div>

          {/* View Toggle */}
          <div className="flex items-center justify-between mb-6">
            <Tabs value={viewMode} onValueChange={setViewMode} className="w-auto">
              <TabsList className="bg-gray-100">
                <TabsTrigger value="list" className="data-[state=active]:bg-white" data-testid="list-view-tab"><List className="w-4 h-4 mr-2" />List View</TabsTrigger>
                <TabsTrigger value="calendar" className="data-[state=active]:bg-white" data-testid="calendar-view-tab"><CalendarIcon className="w-4 h-4 mr-2" />Calendar View</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* List View */}
          {viewMode === "list" && (
            <div className="space-y-4">
              {weeks.map((week) => {
                const weekProgress = calculateWeekProgress(week);
                const isExpanded = expandedWeeks[week.id];
                const completedCount = week.tasks?.filter(t => t.completed).length || 0;
                const totalCount = week.tasks?.length || 0;
                return (
                  <div key={week.id} className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden week-card" data-testid={`week-${week.week_number}-card`}>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors" onClick={() => toggleWeek(week.id)} data-testid={`week-${week.week_number}-header`}>
                      <div className="flex items-center gap-4 flex-1">
                        <div className="flex items-center justify-center w-12 h-12 bg-[#E40000] text-white font-bold rounded-lg font-['Outfit']">W{week.week_number}</div>
                        <div className="flex-1">
                          {editingWeekTitle === week.id ? (
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <Input defaultValue={week.title} className="h-8 font-semibold text-lg" autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter") updateWeekTitle(week.id, e.target.value); else if (e.key === "Escape") setEditingWeekTitle(null); }}
                                onBlur={(e) => updateWeekTitle(week.id, e.target.value)}
                                data-testid={`week-${week.week_number}-title-input`} />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-semibold text-gray-900 font-['Outfit']">{week.title}</h3>
                              <button onClick={(e) => { e.stopPropagation(); setEditingWeekTitle(week.id); }} className="text-gray-400 hover:text-[#E40000] transition-colors" data-testid={`week-${week.week_number}-edit-title`}>
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-1">
                            <div className="w-32"><Progress value={weekProgress} className="h-2 bg-gray-100" data-testid={`week-${week.week_number}-progress`} /></div>
                            <span className="text-sm text-gray-500">{completedCount}/{totalCount} tasks</span>
                            <span className="text-sm font-medium text-[#E40000]">{weekProgress}%</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4" data-testid={`week-${week.week_number}-tasks`}>
                        <div className="space-y-2">
                          {week.tasks?.map((task) => (
                            <DraggableTaskItem key={task.id} task={task} weekId={week.id} weekNumber={week.week_number}
                              editingTaskId={editingTaskId} setEditingTaskId={setEditingTaskId}
                              toggleTaskCompletion={toggleTaskCompletion} updateTask={updateTask} deleteTask={deleteTask}
                              openCommentDialog={(t) => setCommentDialog({ open: true, weekId: week.id, taskId: t.id, task: t })}
                              onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave} onDrop={handleDrop}
                              isDragOver={dragOverTask?.task?.id === task.id && dragOverTask?.weekId === week.id}
                              isDragging={draggedTask?.task?.id === task.id} />
                          ))}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => setAddTaskDialog({ open: true, weekId: week.id })} className="mt-4 text-[#E40000] hover:text-[#B30000] hover:bg-red-50" data-testid={`week-${week.week_number}-add-task`}>
                          <Plus className="w-4 h-4 mr-2" />Add Task
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Calendar View */}
          {viewMode === "calendar" && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6" data-testid="calendar-view">
              <div className="flex items-center justify-between mb-6">
                <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} data-testid="calendar-prev-month"><ChevronLeft className="w-5 h-5" /></Button>
                <h3 className="text-xl font-semibold text-gray-900 font-['Outfit']">{format(currentMonth, "MMMM yyyy")}</h3>
                <Button variant="ghost" size="sm" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} data-testid="calendar-next-month"><ChevronRight className="w-5 h-5" /></Button>
              </div>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                  <div key={d} className="text-center text-sm font-medium text-gray-500 py-2">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {paddingDays.map((_, i) => <div key={`p-${i}`} className="h-24 bg-gray-50 rounded-lg" />)}
                {calendarDays.map(day => {
                  const key = format(day, "yyyy-MM-dd");
                  const dayTasks = tasksMap[key] || [];
                  const isToday = isSameDay(day, new Date());
                  return (
                    <div key={key} className={`h-24 border rounded-lg p-1 cursor-pointer transition-all hover:border-[#E40000] ${isToday ? "bg-red-50 border-[#E40000]" : "bg-white border-gray-200"}`}
                      onClick={() => { if (dayTasks.length > 0) setDayTasksDialog({ open: true, date: day, tasks: dayTasks }); }}
                      data-testid={`calendar-day-${key}`}>
                      <div className={`text-sm font-medium mb-1 ${isToday ? "text-[#E40000]" : "text-gray-700"}`}>{format(day, "d")}</div>
                      <div className="space-y-0.5 overflow-hidden">
                        {dayTasks.slice(0, 2).map(t => (
                          <div key={t.id} className={`text-xs px-1 py-0.5 rounded truncate ${t.completed ? "bg-green-100 text-green-700 line-through" : "bg-red-100 text-red-700"}`}>{t.title}</div>
                        ))}
                        {dayTasks.length > 2 && <div className="text-xs text-gray-500 px-1">+{dayTasks.length - 2} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-6 mt-6 pt-4 border-t border-gray-200">
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-100" /><span className="text-sm text-gray-600">Pending</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-green-100" /><span className="text-sm text-gray-600">Completed</span></div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 rounded bg-red-50 border border-[#E40000]" /><span className="text-sm text-gray-600">Today</span></div>
              </div>
            </div>
          )}

          <div className="mt-8 text-center text-sm text-gray-500">All changes saved automatically · Click any title or task to edit</div>
        </main>
      )}

      {/* ── Add Task Dialog ── */}
      <Dialog open={addTaskDialog.open} onOpenChange={(open) => setAddTaskDialog({ open, weekId: null })}>
        <DialogContent className="sm:max-w-md" data-testid="add-task-dialog">
          <DialogHeader><DialogTitle className="font-['Outfit']">Add New Task</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Task Title</label>
              <Input value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="Enter task title..." className="mt-1" data-testid="new-task-title-input" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Due Date (Optional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full mt-1 justify-start text-left font-normal" data-testid="new-task-due-date-trigger">
                    <CalendarIcon className="mr-2 h-4 w-4" />{newTaskDueDate ? format(newTaskDueDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={newTaskDueDate} onSelect={setNewTaskDueDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddTaskDialog({ open: false, weekId: null }); setNewTaskTitle(""); setNewTaskDueDate(null); }}>Cancel</Button>
            <Button onClick={addTask} disabled={!newTaskTitle.trim() || saving} className="bg-[#E40000] hover:bg-[#B30000]" data-testid="add-task-submit">Add Task</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Comments Dialog ── */}
      <Dialog open={commentDialog.open} onOpenChange={(open) => !open && setCommentDialog({ open: false, weekId: null, taskId: null, task: null })}>
        <DialogContent className="sm:max-w-lg" data-testid="comments-dialog">
          <DialogHeader><DialogTitle className="font-['Outfit']">Task Comments</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg"><p className="font-medium text-gray-900">{commentDialog.task?.title}</p></div>
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {commentDialog.task?.comments?.length === 0 && <p className="text-gray-500 text-sm text-center py-4">No comments yet</p>}
              {commentDialog.task?.comments?.map((c) => (
                <div key={c.id} className="bg-gray-50 p-3 rounded-r-lg" data-testid={`comment-${c.id}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-900">{c.text}</p>
                      <p className="text-xs text-gray-500 mt-1">{c.created_by_name} · {new Date(c.created_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => deleteComment(c.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Textarea value={newComment} onChange={(e) => setNewComment(e.target.value)} placeholder="Add a comment..." className="flex-1 resize-none" rows={2} data-testid="new-comment-input" />
              <Button onClick={addComment} disabled={!newComment.trim() || saving} className="bg-[#E40000] hover:bg-[#B30000]" data-testid="add-comment-submit"><MessageSquare className="w-4 h-4" /></Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Day Tasks Dialog ── */}
      <Dialog open={dayTasksDialog.open} onOpenChange={(open) => !open && setDayTasksDialog({ open: false, date: null, tasks: [] })}>
        <DialogContent className="sm:max-w-lg" data-testid="day-tasks-dialog">
          <DialogHeader><DialogTitle className="font-['Outfit']">Tasks for {dayTasksDialog.date && format(dayTasksDialog.date, "MMMM d, yyyy")}</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {dayTasksDialog.tasks.map(task => (
              <div key={task.id} className={`p-3 rounded-lg border ${task.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"}`}>
                <div className="flex items-start gap-3">
                  <Checkbox checked={task.completed}
                    onCheckedChange={() => { toggleTaskCompletion(task.weekId, task.id, task.completed); setDayTasksDialog(prev => ({ ...prev, tasks: prev.tasks.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t) })); }}
                    className="mt-1 data-[state=checked]:bg-[#E40000] data-[state=checked]:border-[#E40000]" />
                  <div className="flex-1">
                    <p className={`font-medium ${task.completed ? "line-through text-gray-500" : "text-gray-900"}`}>{task.title}</p>
                    <p className="text-xs text-gray-500 mt-1">Week {task.weekNumber}: {task.weekTitle}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── Draggable Task Item ───────────────────────────────────────────────────────
const DraggableTaskItem = ({ task, weekId, weekNumber, editingTaskId, setEditingTaskId, toggleTaskCompletion, updateTask, deleteTask, openCommentDialog, onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop, isDragOver, isDragging }) => {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDueDate, setEditDueDate] = useState(task.due_date ? new Date(task.due_date) : null);
  const isEditing = editingTaskId === task.id;

  return (
    <div draggable={!isEditing} onDragStart={(e) => onDragStart(e, task, weekId)} onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, task, weekId)} onDragLeave={onDragLeave} onDrop={(e) => onDrop(e, task, weekId)}
      className={`task-item flex items-start gap-2 p-3 rounded-lg border transition-all ${task.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"} ${isDragOver ? "border-[#E40000] border-2 bg-red-50" : ""} ${isDragging ? "opacity-50" : ""}`}
      data-testid={`task-${task.id}`}>
      <div className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors mt-0.5"><GripVertical className="w-4 h-4 text-gray-400" /></div>
      <Checkbox checked={task.completed} onCheckedChange={() => toggleTaskCompletion(weekId, task.id, task.completed)} className="mt-1 data-[state=checked]:bg-[#E40000] data-[state=checked]:border-[#E40000]" data-testid={`task-${task.id}-checkbox`} />
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-8" autoFocus data-testid={`task-${task.id}-title-input`} />
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs"><CalendarIcon className="w-3 h-3 mr-1" />{editDueDate ? format(editDueDate, "MMM d") : "Due date"}</Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editDueDate} onSelect={setEditDueDate} initialFocus />
                </PopoverContent>
              </Popover>
              <Button size="sm" onClick={() => updateTask(weekId, task.id, { title: editTitle, due_date: editDueDate ? format(editDueDate, "yyyy-MM-dd") : null })} className="bg-[#E40000] hover:bg-[#B30000] h-7 px-2" data-testid={`task-${task.id}-save`}><Check className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingTaskId(null); setEditTitle(task.title); setEditDueDate(task.due_date ? new Date(task.due_date) : null); }} className="h-7 px-2" data-testid={`task-${task.id}-cancel`}><X className="w-4 h-4" /></Button>
            </div>
          </div>
        ) : (
          <div>
            <p className={`text-sm ${task.completed ? "line-through text-gray-500" : "text-gray-900"} cursor-pointer hover:text-[#E40000] transition-colors`} onClick={() => setEditingTaskId(task.id)} data-testid={`task-${task.id}-title`}>{task.title}</p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              {task.due_date && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(task.due_date).toLocaleDateString()}</span>}
              {task.comments?.length > 0 && <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{task.comments.length}</span>}
            </div>
          </div>
        )}
      </div>
      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`task-${task.id}-menu`}><MoreVertical className="w-4 h-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingTaskId(task.id)}><Edit2 className="w-4 h-4 mr-2" />Edit</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCommentDialog(task)}><MessageSquare className="w-4 h-4 mr-2" />Comments</DropdownMenuItem>
            <DropdownMenuItem onClick={() => deleteTask(weekId, task.id)} className="text-red-600 focus:text-red-600"><Trash2 className="w-4 h-4 mr-2" />Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default DashboardPage;
