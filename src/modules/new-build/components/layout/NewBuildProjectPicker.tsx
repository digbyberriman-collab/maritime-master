import { useNewBuildProject } from '@/modules/new-build/contexts/NewBuildProjectContext';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Ship } from 'lucide-react';

export function NewBuildProjectPicker() {
  const { projects, currentProject, setCurrentProject, loading } = useNewBuildProject();

  if (loading || projects.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Ship className="w-4 h-4" />
        {loading ? 'Loading projects…' : 'No new-build projects yet'}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Ship className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm text-muted-foreground">Project:</span>
      <Select
        value={currentProject?.id}
        onValueChange={(id) => {
          const p = projects.find((x) => x.id === id);
          if (p) setCurrentProject(p);
        }}
      >
        <SelectTrigger className="w-[240px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
