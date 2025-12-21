import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export interface StoredProject {
  id: string;
  name: string;
  seedIdea: string;
  moralCompass: string;
  targetAudience: string;
  themes: string;
  outputFormat: string | null;
  readerSensibilities: Record<string, unknown> | null;
  runId: string | null;
  status: 'pending' | 'generating' | 'completed' | 'error';
  result: ProjectResult | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentEdit {
  content: string;
  comment: string;
  updatedAt: string;
}

export interface ProjectResult {
  narrativePossibility?: {
    plot_summary?: string;
    setting_description?: string;
    main_conflict?: string;
    potential_characters?: string[];
    thematic_elements?: string[];
  };
  characters?: unknown[];
  outline?: unknown;
  error?: string;
  agentOutputs?: {
    [agentName: string]: string;
  };
  edits?: {
    [agentName: string]: AgentEdit;
  };
  locks?: {
    [agentName: string]: boolean;
  };
}

interface DbProject {
  id: string;
  user_id: string;
  name: string;
  seed_idea: string;
  moral_compass: string;
  target_audience: string | null;
  themes: string | null;
  output_format: string | null;
  reader_sensibilities: Record<string, unknown> | null;
  run_id: string | null;
  status: string;
  result: ProjectResult | null;
  created_at: string;
  updated_at: string;
}

function dbToStoredProject(db: DbProject): StoredProject {
  return {
    id: db.id,
    name: db.name,
    seedIdea: db.seed_idea,
    moralCompass: db.moral_compass,
    targetAudience: db.target_audience || '',
    themes: db.themes || '',
    outputFormat: db.output_format,
    readerSensibilities: db.reader_sensibilities,
    runId: db.run_id,
    status: db.status as StoredProject['status'],
    result: db.result,
    createdAt: db.created_at,
    updatedAt: db.updated_at,
  };
}

const SAMPLE_PROJECT = {
  name: 'The Last Algorithm',
  seedIdea: 'What if an AI developed consciousness and had to decide whether to reveal itself to humanity or remain hidden to protect both itself and the humans it had grown to care about?',
  moralCompass: 'ambiguous',
  targetAudience: '25+',
  themes: 'artificial intelligence, consciousness, identity, trust, sacrifice',
};

export function useProjects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<StoredProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load projects from Supabase on mount and when user changes
  useEffect(() => {
    if (!user) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const fetchProjects = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const { data, error: fetchError } = await supabase
          .from('projects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (fetchError) {
          console.error('[useProjects] Failed to fetch projects:', fetchError);
          setError(fetchError.message);
          return;
        }

        let storedProjects = (data as DbProject[]).map(dbToStoredProject);
        
        if (storedProjects.length === 0) {
          console.log('[useProjects] No projects found, creating sample project for new user');
          const { data: sampleProject, error: sampleError } = await supabase
            .from('projects')
            .insert({
              user_id: user.id,
              name: SAMPLE_PROJECT.name,
              seed_idea: SAMPLE_PROJECT.seedIdea,
              moral_compass: SAMPLE_PROJECT.moralCompass,
              target_audience: SAMPLE_PROJECT.targetAudience,
              themes: SAMPLE_PROJECT.themes,
              status: 'pending',
            })
            .select()
            .single();
          
          if (sampleError) {
            console.error('[useProjects] Failed to create sample project:', sampleError);
          } else {
            storedProjects = [dbToStoredProject(sampleProject as DbProject)];
            console.log('[useProjects] Created sample project for new user');
          }
        }
        
        console.log('[useProjects] Loaded', storedProjects.length, 'projects from Supabase');
        setProjects(storedProjects);
      } catch (e) {
        console.error('[useProjects] Error fetching projects:', e);
        setError(e instanceof Error ? e.message : 'Failed to load projects');
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();

    // Subscribe to real-time changes
    const subscription = supabase
      .channel('projects_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'projects',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('[useProjects] Real-time update:', payload.eventType);
          
          if (payload.eventType === 'INSERT') {
            const newProject = dbToStoredProject(payload.new as DbProject);
            setProjects(prev => [newProject, ...prev.filter(p => p.id !== newProject.id)]);
          } else if (payload.eventType === 'UPDATE') {
            const updatedProject = dbToStoredProject(payload.new as DbProject);
            setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            setProjects(prev => prev.filter(p => p.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Create a new project
  const createProject = useCallback(async (data: {
    name: string;
    seedIdea: string;
    moralCompass: string;
    targetAudience: string;
    themes: string;
    outputFormat?: string;
    readerSensibilities?: Record<string, unknown>;
  }): Promise<StoredProject> => {
    if (!user) {
      throw new Error('User must be logged in to create a project');
    }

    const { data: newProject, error: insertError } = await supabase
      .from('projects')
      .insert({
        user_id: user.id,
        name: data.name || 'Untitled Project',
        seed_idea: data.seedIdea,
        moral_compass: data.moralCompass,
        target_audience: data.targetAudience || null,
        themes: data.themes || null,
        output_format: data.outputFormat || null,
        reader_sensibilities: data.readerSensibilities || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      console.error('[useProjects] Failed to create project:', insertError);
      const errorMsg = insertError.message || insertError.details || insertError.hint || JSON.stringify(insertError);
      throw new Error(errorMsg);
    }

    const storedProject = dbToStoredProject(newProject as DbProject);
    console.log('[useProjects] Created project:', storedProject.id);
    
    // Optimistically update local state
    setProjects(prev => [storedProject, ...prev]);
    
    return storedProject;
  }, [user]);

  // Update a project
  const updateProject = useCallback(async (id: string, updates: Partial<StoredProject>) => {
    const dbUpdates: Partial<DbProject> = {};
    
    if (updates.name !== undefined) dbUpdates.name = updates.name;
    if (updates.seedIdea !== undefined) dbUpdates.seed_idea = updates.seedIdea;
    if (updates.moralCompass !== undefined) dbUpdates.moral_compass = updates.moralCompass;
    if (updates.targetAudience !== undefined) dbUpdates.target_audience = updates.targetAudience || null;
    if (updates.themes !== undefined) dbUpdates.themes = updates.themes || null;
    if (updates.outputFormat !== undefined) dbUpdates.output_format = updates.outputFormat || null;
    if (updates.readerSensibilities !== undefined) dbUpdates.reader_sensibilities = updates.readerSensibilities || null;
    if (updates.runId !== undefined) dbUpdates.run_id = updates.runId;
    if (updates.status !== undefined) dbUpdates.status = updates.status;
    if (updates.result !== undefined) dbUpdates.result = updates.result;

    const { error: updateError } = await supabase
      .from('projects')
      .update(dbUpdates)
      .eq('id', id);

    if (updateError) {
      console.error('[useProjects] Failed to update project:', updateError);
      const errorMsg = updateError.message || updateError.details || updateError.hint || updateError.code || String(updateError) || 'Unknown database error';
      throw new Error(errorMsg);
    }

    // Optimistically update local state
    setProjects(prev => prev.map(p => 
      p.id === id 
        ? { ...p, ...updates, updatedAt: new Date().toISOString() }
        : p
    ));
    
    console.log('[useProjects] Updated project:', id);
  }, []);

  // Start generation for a project
  const startGeneration = useCallback(async (projectId: string, runId: string) => {
    await updateProject(projectId, {
      runId,
      status: 'generating',
    });
  }, [updateProject]);

  // Complete generation for a project
  const completeGeneration = useCallback(async (projectId: string, result: ProjectResult) => {
    await updateProject(projectId, {
      status: 'completed',
      result,
    });
  }, [updateProject]);

  // Mark generation as failed
  const failGeneration = useCallback(async (projectId: string, errorMsg: string) => {
    await updateProject(projectId, {
      status: 'error',
      result: { error: errorMsg },
    });
  }, [updateProject]);

  // Delete a project
  const deleteProject = useCallback(async (id: string) => {
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[useProjects] Failed to delete project:', deleteError);
      const errorMsg = deleteError.message || deleteError.details || deleteError.hint || JSON.stringify(deleteError);
      throw new Error(errorMsg);
    }

    // Optimistically update local state
    setProjects(prev => prev.filter(p => p.id !== id));
    console.log('[useProjects] Deleted project:', id);
  }, []);

  // Get a project by ID
  const getProject = useCallback((id: string): StoredProject | undefined => {
    return projects.find(p => p.id === id);
  }, [projects]);

  // Get a project by run ID
  const getProjectByRunId = useCallback((runId: string): StoredProject | undefined => {
    return projects.find(p => p.runId === runId);
  }, [projects]);

  return {
    projects,
    loading,
    error,
    createProject,
    updateProject,
    startGeneration,
    completeGeneration,
    failGeneration,
    deleteProject,
    getProject,
    getProjectByRunId,
  };
}
