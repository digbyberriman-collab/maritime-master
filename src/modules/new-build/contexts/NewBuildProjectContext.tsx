import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const STORAGE_KEY = "nb.currentProjectId";

interface Project {
  id: string;
  name: string;
  description: string | null;
}

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  setCurrentProject: (project: Project) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextType>({
  projects: [],
  currentProject: null,
  setCurrentProject: () => {},
  loading: true,
});

export const useNewBuildProject = () => useContext(ProjectContext);
// Back-compat alias so the ported pages that still import `useProject` keep working.
export const useProject = useNewBuildProject;

export function NewBuildProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data, error } = await supabase.from("nb_projects" as any).select("*").order("name");
      if (error) {
        // Tables may not be provisioned yet — fall back to empty list quietly.
        setLoading(false);
        return;
      }
      if (data && data.length > 0) {
        setProjects(data as Project[]);
        const saved = localStorage.getItem(STORAGE_KEY);
        const found = data.find((p) => p.id === saved);
        setCurrentProject((found as Project) || (data[0] as Project));
      }
      setLoading(false);
    };
    fetchProjects();
  }, []);

  const handleSetProject = (project: Project) => {
    setCurrentProject(project);
    localStorage.setItem(STORAGE_KEY, project.id);
  };

  return (
    <ProjectContext.Provider
      value={{ projects, currentProject, setCurrentProject: handleSetProject, loading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
