import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useDevTodos, type CreateDevTodoInput } from '@/modules/dashboard/hooks/useDevTodos';
import { supabase } from '@/integrations/supabase/client';
import { ListTodo, Plus, X, Trash2, ChevronDown, ChevronUp, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRIORITY_CONFIG: Record<number, { label: string; color: string }> = {
  1: { label: 'Priority 1', color: 'bg-destructive text-destructive-foreground' },
  2: { label: 'Priority 2', color: 'bg-orange-500 text-white' },
  3: { label: 'Priority 3', color: 'bg-yellow-500 text-black' },
  4: { label: 'Priority 4', color: 'bg-muted text-muted-foreground' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  upcoming: { label: 'Upcoming', color: 'bg-muted text-muted-foreground' },
  in_progress: { label: 'In Progress', color: 'bg-primary text-primary-foreground' },
  done: { label: 'Done', color: 'bg-success text-white' },
  cancelled: { label: 'Cancelled', color: 'bg-destructive/50 text-destructive-foreground' },
};

const DevTodoWidget: React.FC = () => {
  const { todos, loading, createTodo, updateTodo, deleteTodo } = useDevTodos();
  const [showDialog, setShowDialog] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [form, setForm] = useState<CreateDevTodoInput>({ title: '', priority: 3 });
  const [uploading, setUploading] = useState(false);
  const [imageFiles, setImageFiles] = useState<string[]>([]);

  const filteredTodos = todos.filter((t) => {
    if (statusFilter === 'active') return t.status !== 'done' && t.status !== 'cancelled';
    if (statusFilter === 'all') return true;
    return t.status === statusFilter;
  });

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop();
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('dev-todo-images').upload(path, file);
      if (!error) {
        const { data } = supabase.storage.from('dev-todo-images').getPublicUrl(path);
        urls.push(data.publicUrl);
      }
    }
    setImageFiles((prev) => [...prev, ...urls]);
    setUploading(false);
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    await createTodo.mutateAsync({ ...form, image_urls: imageFiles });
    setForm({ title: '', priority: 3 });
    setImageFiles([]);
    setShowDialog(false);
  };

  const handleStatusChange = (id: string, status: string) => {
    updateTodo.mutate({ id, status });
  };

  return (
    <>
      <Card className="shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ListTodo className="w-5 h-5" />
              Development To Do
            </CardTitle>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-7 w-[100px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="upcoming">Upcoming</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setShowDialog(true)}>
                <Plus className="w-3 h-3" />
                Add
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Planned features and improvements for this application.</p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="text-center py-6 text-muted-foreground text-sm">Loading...</div>
          ) : filteredTodos.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <ListTodo className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No to-do items</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredTodos.map((todo) => {
                const pc = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG[3];
                const sc = STATUS_CONFIG[todo.status] || STATUS_CONFIG['upcoming'];
                const isExpanded = expandedId === todo.id;

                return (
                  <div
                    key={todo.id}
                    className={cn(
                      'border rounded-lg p-3 transition-all cursor-pointer hover:border-primary/40',
                      todo.status === 'done' && 'opacity-60'
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : todo.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <button
                          className={cn(
                            'mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-colors',
                            todo.status === 'done'
                              ? 'bg-success border-success'
                              : 'border-muted-foreground/40 hover:border-primary'
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStatusChange(todo.id, todo.status === 'done' ? 'upcoming' : 'done');
                          }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium', todo.status === 'done' && 'line-through')}>
                            {todo.title}
                          </p>
                          {todo.description && !isExpanded && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">{todo.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <Badge className={cn('text-[10px] px-1.5 py-0', pc.color)}>{pc.label}</Badge>
                        {isExpanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
                        {todo.description && (
                          <p className="text-xs text-muted-foreground">{todo.description}</p>
                        )}
                        {todo.image_urls && todo.image_urls.length > 0 && (
                          <div className="flex gap-2 flex-wrap">
                            {todo.image_urls.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt="Attachment"
                                className="rounded-md border max-w-[300px] max-h-[200px] object-contain"
                              />
                            ))}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <Select
                            value={todo.status}
                            onValueChange={(val) => handleStatusChange(todo.id, val)}
                          >
                            <SelectTrigger className="h-6 w-[120px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="upcoming">Upcoming</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="done">Done</SelectItem>
                              <SelectItem value="cancelled">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs text-destructive hover:text-destructive"
                            onClick={() => deleteTodo.mutate(todo.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="w-5 h-5" />
              New To-Do Item
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Bug description or feature request..."
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description || ''}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Detailed description..."
                rows={3}
              />
            </div>
            <div>
              <Label>Priority</Label>
              <Select
                value={String(form.priority)}
                onValueChange={(val) => setForm((f) => ({ ...f, priority: parseInt(val) }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Priority 1 - Critical</SelectItem>
                  <SelectItem value="2">Priority 2 - High</SelectItem>
                  <SelectItem value="3">Priority 3 - Medium</SelectItem>
                  <SelectItem value="4">Priority 4 - Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Attachments</Label>
              <div className="flex flex-wrap gap-2 mt-1">
                {imageFiles.map((url, i) => (
                  <div key={i} className="relative group">
                    <img src={url} alt="" className="w-20 h-20 object-cover rounded border" />
                    <button
                      className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition"
                      onClick={() => setImageFiles((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <label className="w-20 h-20 border-2 border-dashed rounded flex items-center justify-center cursor-pointer hover:border-primary transition text-muted-foreground">
                  <ImagePlus className="w-5 h-5" />
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
                </label>
              </div>
              {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.title.trim() || createTodo.isPending}>
              {createTodo.isPending ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DevTodoWidget;
