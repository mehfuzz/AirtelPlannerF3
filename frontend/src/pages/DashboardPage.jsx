import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth, API, formatApiError } from "@/App";
import axios from "axios";
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

const DashboardPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [weeks, setWeeks] = useState([]);
  const [expandedWeeks, setExpandedWeeks] = useState({});
  const [editingWeekTitle, setEditingWeekTitle] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [addTaskDialog, setAddTaskDialog] = useState({ open: false, weekId: null });
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDueDate, setNewTaskDueDate] = useState(null);
  const [commentDialog, setCommentDialog] = useState({ open: false, weekId: null, taskId: null, task: null });
  const [newComment, setNewComment] = useState("");
  const [viewMode, setViewMode] = useState("list"); // "list" or "calendar"
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [dayTasksDialog, setDayTasksDialog] = useState({ open: false, date: null, tasks: [] });
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverTask, setDragOverTask] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch weeks data
  const fetchWeeks = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/weeks`);
      setWeeks(response.data);
      // Expand all weeks by default
      const expanded = {};
      response.data.forEach(week => {
        expanded[week.id] = true;
      });
      setExpandedWeeks(expanded);
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeeks();
  }, [fetchWeeks]);

  // HTML5 Drag and Drop handlers
  const handleDragStart = (e, task, weekId) => {
    setDraggedTask({ task, weekId });
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", task.id);
    // Add visual feedback
    e.currentTarget.style.opacity = "0.5";
  };

  const handleDragEnd = (e) => {
    e.currentTarget.style.opacity = "1";
    setDraggedTask(null);
    setDragOverTask(null);
  };

  const handleDragOver = (e, task, weekId) => {
    e.preventDefault();
    if (draggedTask && draggedTask.weekId === weekId && draggedTask.task.id !== task.id) {
      setDragOverTask({ task, weekId });
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetTask, weekId) => {
    e.preventDefault();
    
    if (!draggedTask || draggedTask.weekId !== weekId) return;
    
    const week = weeks.find(w => w.id === weekId);
    if (!week) return;
    
    const oldIndex = week.tasks.findIndex(t => t.id === draggedTask.task.id);
    const newIndex = week.tasks.findIndex(t => t.id === targetTask.id);
    
    if (oldIndex === newIndex) return;
    
    // Reorder tasks
    const newTasks = [...week.tasks];
    const [movedTask] = newTasks.splice(oldIndex, 1);
    newTasks.splice(newIndex, 0, movedTask);
    
    // Update local state immediately
    setWeeks(prev => prev.map(w => 
      w.id === weekId ? { ...w, tasks: newTasks } : w
    ));
    
    setDraggedTask(null);
    setDragOverTask(null);
    
    // Save to backend
    setSaving(true);
    try {
      await axios.put(`${API}/weeks/${weekId}/tasks/reorder`, {
        task_ids: newTasks.map(t => t.id)
      });
      toast.success("Tasks reordered");
    } catch (error) {
      toast.error("Failed to save task order");
      // Revert on error
      fetchWeeks();
    } finally {
      setSaving(false);
    }
  };

  // Calculate overall progress
  const calculateOverallProgress = () => {
    let totalTasks = 0;
    let completedTasks = 0;
    weeks.forEach(week => {
      totalTasks += week.tasks?.length || 0;
      completedTasks += week.tasks?.filter(t => t.completed).length || 0;
    });
    return totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  };

  // Calculate week progress
  const calculateWeekProgress = (week) => {
    const tasks = week.tasks || [];
    const completed = tasks.filter(t => t.completed).length;
    return tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
  };

  // Toggle week expansion
  const toggleWeek = (weekId) => {
    setExpandedWeeks(prev => ({ ...prev, [weekId]: !prev[weekId] }));
  };

  // Update week title
  const updateWeekTitle = async (weekId, title) => {
    setSaving(true);
    try {
      await axios.put(`${API}/weeks/${weekId}`, { title });
      setWeeks(prev => prev.map(w => w.id === weekId ? { ...w, title } : w));
      setEditingWeekTitle(null);
      toast.success("Week title updated");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Toggle task completion
  const toggleTaskCompletion = async (weekId, taskId, completed) => {
    setSaving(true);
    try {
      await axios.put(`${API}/weeks/${weekId}/tasks/${taskId}`, { completed: !completed });
      setWeeks(prev => prev.map(w => {
        if (w.id === weekId) {
          return {
            ...w,
            tasks: w.tasks.map(t => t.id === taskId ? { ...t, completed: !completed } : t)
          };
        }
        return w;
      }));
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Update task
  const updateTask = async (weekId, taskId, data) => {
    setSaving(true);
    try {
      await axios.put(`${API}/weeks/${weekId}/tasks/${taskId}`, data);
      setWeeks(prev => prev.map(w => {
        if (w.id === weekId) {
          return {
            ...w,
            tasks: w.tasks.map(t => t.id === taskId ? { ...t, ...data } : t)
          };
        }
        return w;
      }));
      setEditingTaskId(null);
      toast.success("Task updated");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Add task
  const addTask = async () => {
    if (!newTaskTitle.trim()) return;
    
    setSaving(true);
    try {
      const response = await axios.post(`${API}/weeks/${addTaskDialog.weekId}/tasks`, {
        title: newTaskTitle,
        due_date: newTaskDueDate ? format(newTaskDueDate, "yyyy-MM-dd") : null
      });
      
      setWeeks(prev => prev.map(w => {
        if (w.id === addTaskDialog.weekId) {
          return { ...w, tasks: [...(w.tasks || []), response.data] };
        }
        return w;
      }));
      
      setAddTaskDialog({ open: false, weekId: null });
      setNewTaskTitle("");
      setNewTaskDueDate(null);
      toast.success("Task added");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Delete task
  const deleteTask = async (weekId, taskId) => {
    setSaving(true);
    try {
      await axios.delete(`${API}/weeks/${weekId}/tasks/${taskId}`);
      setWeeks(prev => prev.map(w => {
        if (w.id === weekId) {
          return { ...w, tasks: w.tasks.filter(t => t.id !== taskId) };
        }
        return w;
      }));
      toast.success("Task deleted");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Add comment
  const addComment = async () => {
    if (!newComment.trim()) return;
    
    setSaving(true);
    try {
      const response = await axios.post(
        `${API}/weeks/${commentDialog.weekId}/tasks/${commentDialog.taskId}/comments`,
        { text: newComment }
      );
      
      setWeeks(prev => prev.map(w => {
        if (w.id === commentDialog.weekId) {
          return {
            ...w,
            tasks: w.tasks.map(t => {
              if (t.id === commentDialog.taskId) {
                return { ...t, comments: [...(t.comments || []), response.data] };
              }
              return t;
            })
          };
        }
        return w;
      }));
      
      // Update the task in the dialog
      const updatedTask = weeks.find(w => w.id === commentDialog.weekId)
        ?.tasks.find(t => t.id === commentDialog.taskId);
      if (updatedTask) {
        setCommentDialog(prev => ({
          ...prev,
          task: { ...updatedTask, comments: [...(updatedTask.comments || []), response.data] }
        }));
      }
      
      setNewComment("");
      toast.success("Comment added");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Delete comment
  const deleteComment = async (commentId) => {
    setSaving(true);
    try {
      await axios.delete(
        `${API}/weeks/${commentDialog.weekId}/tasks/${commentDialog.taskId}/comments/${commentId}`
      );
      
      setWeeks(prev => prev.map(w => {
        if (w.id === commentDialog.weekId) {
          return {
            ...w,
            tasks: w.tasks.map(t => {
              if (t.id === commentDialog.taskId) {
                return { ...t, comments: (t.comments || []).filter(c => c.id !== commentId) };
              }
              return t;
            })
          };
        }
        return w;
      }));
      
      // Update dialog
      setCommentDialog(prev => ({
        ...prev,
        task: { ...prev.task, comments: (prev.task?.comments || []).filter(c => c.id !== commentId) }
      }));
      
      toast.success("Comment deleted");
    } catch (error) {
      toast.error(formatApiError(error.response?.data?.detail));
    } finally {
      setSaving(false);
    }
  };

  // Get tasks for a specific date
  const getTasksForDate = (date) => {
    const tasks = [];
    weeks.forEach(week => {
      (week.tasks || []).forEach(task => {
        if (task.due_date) {
          const taskDate = parseISO(task.due_date);
          if (isValid(taskDate) && isSameDay(taskDate, date)) {
            tasks.push({ ...task, weekId: week.id, weekTitle: week.title, weekNumber: week.week_number });
          }
        }
      });
    });
    return tasks;
  };

  // Get all tasks with due dates for calendar
  const getTasksWithDueDates = () => {
    const tasksMap = {};
    weeks.forEach(week => {
      (week.tasks || []).forEach(task => {
        if (task.due_date) {
          const dateKey = task.due_date;
          if (!tasksMap[dateKey]) {
            tasksMap[dateKey] = [];
          }
          tasksMap[dateKey].push({ ...task, weekId: week.id, weekTitle: week.title });
        }
      });
    });
    return tasksMap;
  };

  // Export to PDF
  const exportToPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Title
    doc.setFontSize(20);
    doc.setTextColor(228, 0, 0);
    doc.text("Airtel 8-Week PPO Execution Plan", pageWidth / 2, 20, { align: "center" });
    
    // Subtitle
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Progress Report - ${format(new Date(), "MMMM d, yyyy")}`, pageWidth / 2, 30, { align: "center" });
    
    // Overall Progress
    const overallProgress = calculateOverallProgress();
    const totalTasks = weeks.reduce((sum, w) => sum + (w.tasks?.length || 0), 0);
    const completedTasks = weeks.reduce((sum, w) => sum + (w.tasks?.filter(t => t.completed).length || 0), 0);
    
    doc.setFontSize(14);
    doc.setTextColor(0);
    doc.text(`Overall Progress: ${overallProgress}% (${completedTasks}/${totalTasks} tasks completed)`, 14, 45);
    
    let yPos = 55;
    
    // Week by week breakdown
    weeks.forEach((week, index) => {
      if (yPos > 250) {
        doc.addPage();
        yPos = 20;
      }
      
      const weekProgress = calculateWeekProgress(week);
      const weekCompleted = week.tasks?.filter(t => t.completed).length || 0;
      const weekTotal = week.tasks?.length || 0;
      
      doc.setFontSize(12);
      doc.setTextColor(228, 0, 0);
      doc.text(`Week ${week.week_number}: ${week.title}`, 14, yPos);
      
      doc.setFontSize(10);
      doc.setTextColor(100);
      doc.text(`${weekProgress}% complete (${weekCompleted}/${weekTotal})`, 14, yPos + 6);
      
      yPos += 12;
      
      // Task table
      const taskData = (week.tasks || []).map(task => [
        task.completed ? "✓" : "○",
        task.title,
        task.due_date ? format(parseISO(task.due_date), "MMM d, yyyy") : "-",
        task.completed ? "Done" : "Pending"
      ]);
      
      if (taskData.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [["", "Task", "Due Date", "Status"]],
          body: taskData,
          theme: "striped",
          headStyles: { fillColor: [228, 0, 0] },
          columnStyles: {
            0: { cellWidth: 10 },
            1: { cellWidth: 100 },
            2: { cellWidth: 35 },
            3: { cellWidth: 25 }
          },
          margin: { left: 14, right: 14 }
        });
        
        yPos = doc.lastAutoTable.finalY + 15;
      } else {
        yPos += 10;
      }
    });
    
    // Footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 20, doc.internal.pageSize.getHeight() - 10);
      doc.text("Airtel SCM Digital Transformation", 14, doc.internal.pageSize.getHeight() - 10);
    }
    
    doc.save(`Airtel_PPO_Progress_${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("PDF exported successfully");
  };

  // Export to Excel
  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();
    
    // Summary sheet
    const summaryData = [
      ["Airtel 8-Week PPO Execution Plan"],
      [`Report Date: ${format(new Date(), "MMMM d, yyyy")}`],
      [],
      ["Overall Progress", `${calculateOverallProgress()}%`],
      ["Total Tasks", weeks.reduce((sum, w) => sum + (w.tasks?.length || 0), 0)],
      ["Completed Tasks", weeks.reduce((sum, w) => sum + (w.tasks?.filter(t => t.completed).length || 0), 0)],
      [],
      ["Week", "Title", "Progress", "Completed", "Total"]
    ];
    
    weeks.forEach(week => {
      const weekCompleted = week.tasks?.filter(t => t.completed).length || 0;
      const weekTotal = week.tasks?.length || 0;
      summaryData.push([
        `Week ${week.week_number}`,
        week.title,
        `${calculateWeekProgress(week)}%`,
        weekCompleted,
        weekTotal
      ]);
    });
    
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    
    // All tasks sheet
    const tasksData = [
      ["Week", "Task Title", "Due Date", "Status", "Comments"]
    ];
    
    weeks.forEach(week => {
      (week.tasks || []).forEach(task => {
        tasksData.push([
          `Week ${week.week_number}: ${week.title}`,
          task.title,
          task.due_date ? format(parseISO(task.due_date), "yyyy-MM-dd") : "",
          task.completed ? "Completed" : "Pending",
          (task.comments || []).length
        ]);
      });
    });
    
    const tasksSheet = XLSX.utils.aoa_to_sheet(tasksData);
    XLSX.utils.book_append_sheet(workbook, tasksSheet, "All Tasks");
    
    // Individual week sheets
    weeks.forEach(week => {
      const weekData = [
        [`Week ${week.week_number}: ${week.title}`],
        [`Progress: ${calculateWeekProgress(week)}%`],
        [],
        ["Task", "Due Date", "Status", "Comments"]
      ];
      
      (week.tasks || []).forEach(task => {
        weekData.push([
          task.title,
          task.due_date ? format(parseISO(task.due_date), "yyyy-MM-dd") : "",
          task.completed ? "Completed" : "Pending",
          (task.comments || []).map(c => c.text).join("; ")
        ]);
      });
      
      const weekSheet = XLSX.utils.aoa_to_sheet(weekData);
      XLSX.utils.book_append_sheet(workbook, weekSheet, `Week ${week.week_number}`);
    });
    
    // Generate and save
    const excelBuffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    saveAs(blob, `Airtel_PPO_Progress_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("Excel exported successfully");
  };

  const overallProgress = calculateOverallProgress();
  const totalTasks = weeks.reduce((sum, w) => sum + (w.tasks?.length || 0), 0);
  const completedTasks = weeks.reduce((sum, w) => sum + (w.tasks?.filter(t => t.completed).length || 0), 0);

  // Calendar view helpers
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const tasksMap = getTasksWithDueDates();

  // Pad start of month to align with week
  const startDay = monthStart.getDay();
  const paddingDays = Array(startDay).fill(null);

  return (
    <div className="min-h-screen bg-gray-50" data-testid="dashboard-page">
      {/* Password Change Dialog for First Login */}
      <PasswordChangeDialog />
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-xl border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#E40000] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg font-['Outfit']">A</span>
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 font-['Outfit'] tracking-tight">
                  AIRTEL
                </h1>
                <p className="text-xs text-gray-500 uppercase tracking-wider">SCM Digital Transformation</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Save indicator */}
              {saving && (
                <div className="flex items-center gap-2 text-gray-500 text-sm" data-testid="save-indicator">
                  <div className="w-4 h-4 border-2 border-[#E40000] border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </div>
              )}
              
              {/* User info */}
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>

              {/* Admin link */}
              {user?.role === "admin" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/users")}
                  className="border-gray-300 hover:bg-gray-50"
                  data-testid="user-management-link"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Users
                </Button>
              )}

              {/* Logout */}
              <Button
                variant="ghost"
                size="sm"
                onClick={logout}
                className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                data-testid="logout-button"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Loading Skeleton */}
        {loading && (
          <div className="animate-pulse" data-testid="dashboard-loading">
            {/* Title skeleton */}
            <div className="mb-8">
              <div className="h-3 w-40 bg-gray-200 rounded mb-3"></div>
              <div className="h-9 w-96 bg-gray-200 rounded mb-2"></div>
              <div className="h-4 w-64 bg-gray-100 rounded"></div>
            </div>

            {/* Progress card skeleton */}
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="h-5 w-36 bg-gray-200 rounded"></div>
                <div className="h-9 w-16 bg-gray-200 rounded"></div>
              </div>
              <div className="h-3 w-full bg-gray-100 rounded-full mb-3"></div>
              <div className="h-4 w-40 bg-gray-100 rounded"></div>
            </div>

            {/* Tabs skeleton */}
            <div className="flex mb-6">
              <div className="h-9 w-48 bg-gray-100 rounded-lg"></div>
            </div>

            {/* Week card skeletons */}
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg shadow-sm mb-4 overflow-hidden">
                <div className="flex items-center gap-4 p-4">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg flex-shrink-0"></div>
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 rounded w-56 mb-2"></div>
                    <div className="flex items-center gap-4">
                      <div className="h-2 w-32 bg-gray-100 rounded-full"></div>
                      <div className="h-4 w-20 bg-gray-100 rounded"></div>
                    </div>
                  </div>
                  <div className="w-5 h-5 bg-gray-100 rounded"></div>
                </div>
                {i <= 2 && (
                  <div className="border-t border-gray-100 p-4 space-y-2">
                    {[1, 2, 3].map(j => (
                      <div key={j} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100">
                        <div className="w-4 h-4 bg-gray-100 rounded flex-shrink-0"></div>
                        <div className="w-4 h-4 bg-gray-100 rounded flex-shrink-0"></div>
                        <div className="h-4 rounded bg-gray-100" style={{ width: `${55 + j * 12}%` }}></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Actual content — hidden until loaded */}
        {!loading && (
          <>
        {/* Title Section */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs text-gray-500 uppercase tracking-widest mb-2">
            <CalendarIcon className="w-4 h-4" />
            8-Week PPO Execution Plan
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 font-['Outfit'] tracking-tight">
                Track Your Internship Progress
              </h2>
              <p className="text-gray-600 mt-2">
                Click any task or week title to edit · All changes auto-saved
              </p>
            </div>
            
            {/* Export Buttons */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="border-gray-300" data-testid="export-dropdown">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                    <ChevronDown className="w-4 h-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={exportToPDF} data-testid="export-pdf">
                    <FileText className="w-4 h-4 mr-2 text-red-600" />
                    Export as PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={exportToExcel} data-testid="export-excel">
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-green-600" />
                    Export as Excel
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Overall Progress Card */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 mb-8" data-testid="overall-progress-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 font-['Outfit']">Overall Progress</h3>
            <span className="text-3xl font-bold text-[#E40000] font-['Outfit']" data-testid="overall-progress-percentage">
              {overallProgress}%
            </span>
          </div>
          <Progress value={overallProgress} className="h-3 bg-gray-100" data-testid="overall-progress-bar" />
          <p className="text-sm text-gray-500 mt-3" data-testid="tasks-completed-count">
            {completedTasks} of {totalTasks} tasks completed
          </p>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between mb-6">
          <Tabs value={viewMode} onValueChange={setViewMode} className="w-auto">
            <TabsList className="bg-gray-100">
              <TabsTrigger value="list" className="data-[state=active]:bg-white" data-testid="list-view-tab">
                <List className="w-4 h-4 mr-2" />
                List View
              </TabsTrigger>
              <TabsTrigger value="calendar" className="data-[state=active]:bg-white" data-testid="calendar-view-tab">
                <CalendarIcon className="w-4 h-4 mr-2" />
                Calendar View
              </TabsTrigger>
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
                <div
                  key={week.id}
                  className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden week-card"
                  data-testid={`week-${week.week_number}-card`}
                >
                  {/* Week Header */}
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleWeek(week.id)}
                    data-testid={`week-${week.week_number}-header`}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex items-center justify-center w-12 h-12 bg-[#E40000] text-white font-bold rounded-lg font-['Outfit']">
                        W{week.week_number}
                      </div>
                      <div className="flex-1">
                        {editingWeekTitle === week.id ? (
                          <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                            <Input
                              defaultValue={week.title}
                              className="h-8 font-semibold text-lg"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  updateWeekTitle(week.id, e.target.value);
                                } else if (e.key === "Escape") {
                                  setEditingWeekTitle(null);
                                }
                              }}
                              onBlur={(e) => updateWeekTitle(week.id, e.target.value)}
                              data-testid={`week-${week.week_number}-title-input`}
                            />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-gray-900 font-['Outfit']">
                              {week.title}
                            </h3>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingWeekTitle(week.id);
                              }}
                              className="text-gray-400 hover:text-[#E40000] transition-colors"
                              data-testid={`week-${week.week_number}-edit-title`}
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex items-center gap-4 mt-1">
                          <div className="w-32">
                            <Progress value={weekProgress} className="h-2 bg-gray-100" data-testid={`week-${week.week_number}-progress`} />
                          </div>
                          <span className="text-sm text-gray-500">
                            {completedCount}/{totalCount} tasks
                          </span>
                          <span className="text-sm font-medium text-[#E40000]">
                            {weekProgress}%
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Tasks List */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 p-4 animate-fade-in" data-testid={`week-${week.week_number}-tasks`}>
                      <div className="space-y-2">
                        {week.tasks?.map((task) => (
                          <DraggableTaskItem
                            key={task.id}
                            task={task}
                            weekId={week.id}
                            weekNumber={week.week_number}
                            editingTaskId={editingTaskId}
                            setEditingTaskId={setEditingTaskId}
                            toggleTaskCompletion={toggleTaskCompletion}
                            updateTask={updateTask}
                            deleteTask={deleteTask}
                            openCommentDialog={(task) => setCommentDialog({ open: true, weekId: week.id, taskId: task.id, task })}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            isDragOver={dragOverTask?.task?.id === task.id && dragOverTask?.weekId === week.id}
                            isDragging={draggedTask?.task?.id === task.id}
                          />
                        ))}
                      </div>

                      {/* Add Task Button */}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAddTaskDialog({ open: true, weekId: week.id })}
                        className="mt-4 text-[#E40000] hover:text-[#B30000] hover:bg-red-50"
                        data-testid={`week-${week.week_number}-add-task`}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Task
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
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-6">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                data-testid="calendar-prev-month"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <h3 className="text-xl font-semibold text-gray-900 font-['Outfit']">
                {format(currentMonth, "MMMM yyyy")}
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                data-testid="calendar-next-month"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1">
              {/* Padding days */}
              {paddingDays.map((_, index) => (
                <div key={`pad-${index}`} className="h-24 bg-gray-50 rounded-lg"></div>
              ))}
              
              {/* Calendar days */}
              {calendarDays.map(day => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayTasks = tasksMap[dateKey] || [];
                const isToday = isSameDay(day, new Date());
                
                return (
                  <div
                    key={dateKey}
                    className={`h-24 border rounded-lg p-1 cursor-pointer transition-all hover:border-[#E40000] ${
                      isToday ? "bg-red-50 border-[#E40000]" : "bg-white border-gray-200"
                    }`}
                    onClick={() => {
                      if (dayTasks.length > 0) {
                        setDayTasksDialog({ open: true, date: day, tasks: dayTasks });
                      }
                    }}
                    data-testid={`calendar-day-${dateKey}`}
                  >
                    <div className={`text-sm font-medium mb-1 ${isToday ? "text-[#E40000]" : "text-gray-700"}`}>
                      {format(day, "d")}
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {dayTasks.slice(0, 2).map(task => (
                        <div
                          key={task.id}
                          className={`text-xs px-1 py-0.5 rounded truncate ${
                            task.completed ? "bg-green-100 text-green-700 line-through" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {task.title}
                        </div>
                      ))}
                      {dayTasks.length > 2 && (
                        <div className="text-xs text-gray-500 px-1">
                          +{dayTasks.length - 2} more
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-6 pt-4 border-t border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-100"></div>
                <span className="text-sm text-gray-600">Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-green-100"></div>
                <span className="text-sm text-gray-600">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-red-50 border border-[#E40000]"></div>
                <span className="text-sm text-gray-600">Today</span>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          All changes saved automatically · Click any title or task to edit
        </div>
          </>
        )}
      </main>

      {/* Add Task Dialog */}
      <Dialog open={addTaskDialog.open} onOpenChange={(open) => setAddTaskDialog({ open, weekId: null })}>
        <DialogContent className="sm:max-w-md" data-testid="add-task-dialog">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">Add New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Task Title</label>
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Enter task title..."
                className="mt-1"
                data-testid="new-task-title-input"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Due Date (Optional)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full mt-1 justify-start text-left font-normal"
                    data-testid="new-task-due-date-trigger"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newTaskDueDate ? format(newTaskDueDate, "PPP") : "Select date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={newTaskDueDate}
                    onSelect={setNewTaskDueDate}
                    initialFocus
                    data-testid="new-task-calendar"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAddTaskDialog({ open: false, weekId: null });
                setNewTaskTitle("");
                setNewTaskDueDate(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={addTask}
              disabled={!newTaskTitle.trim() || saving}
              className="bg-[#E40000] hover:bg-[#B30000]"
              data-testid="add-task-submit"
            >
              Add Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comments Dialog */}
      <Dialog open={commentDialog.open} onOpenChange={(open) => !open && setCommentDialog({ open: false, weekId: null, taskId: null, task: null })}>
        <DialogContent className="sm:max-w-lg" data-testid="comments-dialog">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">Task Comments</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-900">{commentDialog.task?.title}</p>
            </div>

            {/* Comments List */}
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {commentDialog.task?.comments?.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">No comments yet</p>
              )}
              {commentDialog.task?.comments?.map((comment) => (
                <div key={comment.id} className="comment-item bg-gray-50 p-3 rounded-r-lg" data-testid={`comment-${comment.id}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-gray-900">{comment.text}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {comment.created_by_name} · {new Date(comment.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteComment(comment.id)}
                      className="text-gray-400 hover:text-red-500 transition-colors"
                      data-testid={`delete-comment-${comment.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Comment */}
            <div className="flex gap-2">
              <Textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add a comment..."
                className="flex-1 resize-none"
                rows={2}
                data-testid="new-comment-input"
              />
              <Button
                onClick={addComment}
                disabled={!newComment.trim() || saving}
                className="bg-[#E40000] hover:bg-[#B30000]"
                data-testid="add-comment-submit"
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Tasks Dialog */}
      <Dialog open={dayTasksDialog.open} onOpenChange={(open) => !open && setDayTasksDialog({ open: false, date: null, tasks: [] })}>
        <DialogContent className="sm:max-w-lg" data-testid="day-tasks-dialog">
          <DialogHeader>
            <DialogTitle className="font-['Outfit']">
              Tasks for {dayTasksDialog.date && format(dayTasksDialog.date, "MMMM d, yyyy")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {dayTasksDialog.tasks.map(task => (
              <div
                key={task.id}
                className={`p-3 rounded-lg border ${
                  task.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => {
                      toggleTaskCompletion(task.weekId, task.id, task.completed);
                      // Update dialog state
                      setDayTasksDialog(prev => ({
                        ...prev,
                        tasks: prev.tasks.map(t => 
                          t.id === task.id ? { ...t, completed: !t.completed } : t
                        )
                      }));
                    }}
                    className="mt-1 data-[state=checked]:bg-[#E40000] data-[state=checked]:border-[#E40000]"
                  />
                  <div className="flex-1">
                    <p className={`font-medium ${task.completed ? "line-through text-gray-500" : "text-gray-900"}`}>
                      {task.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Week {task.weekNumber}: {task.weekTitle}
                    </p>
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

// Draggable Task Item with HTML5 Drag and Drop
const DraggableTaskItem = ({ 
  task, weekId, weekNumber, editingTaskId, setEditingTaskId, 
  toggleTaskCompletion, updateTask, deleteTask, openCommentDialog,
  onDragStart, onDragEnd, onDragOver, onDragLeave, onDrop,
  isDragOver, isDragging
}) => {
  const [editTitle, setEditTitle] = useState(task.title);
  const [editDueDate, setEditDueDate] = useState(task.due_date ? new Date(task.due_date) : null);
  const isEditing = editingTaskId === task.id;

  return (
    <div
      draggable={!isEditing}
      onDragStart={(e) => onDragStart(e, task, weekId)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => onDragOver(e, task, weekId)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, task, weekId)}
      className={`task-item flex items-start gap-2 p-3 rounded-lg border transition-all ${
        task.completed ? "bg-green-50 border-green-200" : "bg-white border-gray-200"
      } ${isDragOver ? "border-[#E40000] border-2 bg-red-50" : ""} ${isDragging ? "opacity-50" : ""}`}
      data-testid={`task-${task.id}`}
    >
      {/* Drag Handle */}
      <div
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-gray-100 rounded transition-colors mt-0.5"
        data-testid={`task-${task.id}-drag-handle`}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </div>

      <Checkbox
        checked={task.completed}
        onCheckedChange={() => toggleTaskCompletion(weekId, task.id, task.completed)}
        className="mt-1 task-checkbox data-[state=checked]:bg-[#E40000] data-[state=checked]:border-[#E40000]"
        data-testid={`task-${task.id}-checkbox`}
      />
      
      <div className="flex-1 min-w-0">
        {isEditing ? (
          <div className="space-y-2" onClick={e => e.stopPropagation()}>
            <Input
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-8"
              autoFocus
              data-testid={`task-${task.id}-title-input`}
            />
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="text-xs" data-testid={`task-${task.id}-due-date-trigger`}>
                    <CalendarIcon className="w-3 h-3 mr-1" />
                    {editDueDate ? format(editDueDate, "MMM d") : "Due date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDueDate}
                    onSelect={setEditDueDate}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                onClick={() => {
                  updateTask(weekId, task.id, {
                    title: editTitle,
                    due_date: editDueDate ? format(editDueDate, "yyyy-MM-dd") : null
                  });
                }}
                className="bg-[#E40000] hover:bg-[#B30000] h-7 px-2"
                data-testid={`task-${task.id}-save`}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingTaskId(null);
                  setEditTitle(task.title);
                  setEditDueDate(task.due_date ? new Date(task.due_date) : null);
                }}
                className="h-7 px-2"
                data-testid={`task-${task.id}-cancel`}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <p
              className={`text-sm ${task.completed ? "line-through text-gray-500" : "text-gray-900"} cursor-pointer hover:text-[#E40000] transition-colors`}
              onClick={() => setEditingTaskId(task.id)}
              data-testid={`task-${task.id}-title`}
            >
              {task.title}
            </p>
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
              {task.due_date && (
                <span className="flex items-center gap-1" data-testid={`task-${task.id}-due-date`}>
                  <Clock className="w-3 h-3" />
                  {new Date(task.due_date).toLocaleDateString()}
                </span>
              )}
              {task.comments?.length > 0 && (
                <span className="flex items-center gap-1" data-testid={`task-${task.id}-comments-count`}>
                  <MessageSquare className="w-3 h-3" />
                  {task.comments.length}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {!isEditing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid={`task-${task.id}-menu`}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditingTaskId(task.id)} data-testid={`task-${task.id}-edit`}>
              <Edit2 className="w-4 h-4 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => openCommentDialog(task)} data-testid={`task-${task.id}-comments`}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Comments
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => deleteTask(weekId, task.id)}
              className="text-red-600 focus:text-red-600"
              data-testid={`task-${task.id}-delete`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export default DashboardPage;
