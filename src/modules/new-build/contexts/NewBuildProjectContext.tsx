import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

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

export const useProject = () => useContext(ProjectContext);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const { data } = await supabase.from("projects").select("*").order("name");
      if (data && data.length > 0) {
        setProjects(data);
        const saved = localStorage.getItem("currentProjectId");
        const found = data.find((p) => p.id === saved);
        setCurrentProject(found || data[0]);
      }
      setLoading(false);
    };
    fetchProjects();
  }, []);

  const handleSetProject = (project: Project) => {
    setCurrentProject(project);
    localStorage.setItem("currentProjectId", project.id);
  };

  return (
    <ProjectContext.Provider
      value={{ projects, currentProject, setCurrentProject: handleSetProject, loading }}
    >
      {children}
    </ProjectContext.Provider>
  );
}
