import { Link } from 'react-router-dom';
import { useProjects } from '../hooks/useProjects';

export function GenerationsPage() {
  const { projects, loading } = useProjects();

  // Filter projects that have been generated or are generating
  const generatingProjects = projects.filter(p => p.status === 'generating');
  const completedProjects = projects.filter(p => p.status === 'completed');
  const errorProjects = projects.filter(p => p.status === 'error');
  const pendingProjects = projects.filter(p => p.status === 'pending');

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 rounded-full bg-slate-700/50 flex items-center justify-center">
            <svg className="w-5 h-5 text-slate-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Generations</h1>
        <p className="text-slate-400 mt-1">View and manage your story generations</p>
      </div>

      {/* In Progress Section */}
      {generatingProjects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-amber-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            In Progress ({generatingProjects.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {generatingProjects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-800/50 border border-amber-500/30 rounded-xl p-5 hover:border-amber-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg text-white">{project.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">
                    Generating
                  </span>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">
                  {project.seedIdea.substring(0, 100)}...
                </p>
                <div className="flex gap-2">
                  <Link
                    to={`/generate/${project.id}?runId=${project.runId}`}
                    className="flex-1 px-3 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-500 transition-colors text-center"
                  >
                    Open Generation
                  </Link>
                  <a
                    href={`/generate/${project.id}?runId=${project.runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Completed Section */}
      {completedProjects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-green-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Completed ({completedProjects.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {completedProjects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-800/50 border border-green-500/30 rounded-xl p-5 hover:border-green-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg text-white">{project.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">
                    Completed
                  </span>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">
                  {project.seedIdea.substring(0, 100)}...
                </p>
                <div className="flex gap-2">
                  <Link
                    to={`/generate/${project.id}?runId=${project.runId}`}
                    className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-500 transition-colors text-center"
                  >
                    View Result
                  </Link>
                  <a
                    href={`/generate/${project.id}?runId=${project.runId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-2 border border-slate-600 rounded-lg text-sm hover:bg-slate-700 transition-colors"
                    title="Open in new tab"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Section */}
      {errorProjects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-red-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Failed ({errorProjects.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {errorProjects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-800/50 border border-red-500/30 rounded-xl p-5 hover:border-red-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg text-white">{project.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                    Error
                  </span>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">
                  {project.seedIdea.substring(0, 100)}...
                </p>
                <Link
                  to={`/generate/${project.id}`}
                  className="block w-full px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-500 transition-colors text-center"
                >
                  Retry Generation
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready to Generate Section */}
      {pendingProjects.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-400 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Ready to Generate ({pendingProjects.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pendingProjects.map((project) => (
              <div
                key={project.id}
                className="bg-slate-800/50 border border-slate-700 rounded-xl p-5 hover:border-primary-500/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg text-white">{project.name}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">
                    Pending
                  </span>
                </div>
                <p className="text-sm text-slate-400 line-clamp-2 mb-4">
                  {project.seedIdea.substring(0, 100)}...
                </p>
                <Link
                  to={`/generate/${project.id}`}
                  className="block w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500 transition-colors text-center"
                >
                  Start Generation
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {projects.length === 0 && (
        <div className="bg-slate-800/30 border-2 border-dashed border-slate-700 rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h3 className="font-medium text-slate-400 text-lg">No generations yet</h3>
          <p className="text-sm text-slate-500 mt-1 mb-4">Create a project from the Dashboard to start generating stories</p>
          <Link
            to="/"
            className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-500 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      )}
    </div>
  );
}
