export type WorkspaceItemType = 'note' | 'task' | 'checklist' | 'record';
export type WorkspaceItemStatus = 'open' | 'in_progress' | 'completed' | 'archived';
export type WorkspaceItemPriority = 'low' | 'medium' | 'high';

export interface WorkspaceItem {
  id: string;
  type: WorkspaceItemType;
  title: string;
  description: string;
  status: WorkspaceItemStatus;
  priority: WorkspaceItemPriority;
  assignee?: string;
  dueDate?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceConfig {
  category: string;
  description: string;
  defaultItemType: WorkspaceItemType;
  relatedRoutes: { label: string; path: string }[];
  features: string[];
}
