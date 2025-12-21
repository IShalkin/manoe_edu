import { useState } from 'react';
import { RELATIONSHIP_TYPE_OPTIONS, RelationshipType } from '../types';

interface CharacterData {
  name: string;
  archetype?: string;
  role?: string;
}

interface RelationshipData {
  source: string;
  target: string;
  type: RelationshipType;
  description?: string;
  dynamics?: string;
}

interface CharacterRelationshipMapProps {
  characters: CharacterData[];
  relationships: RelationshipData[];
  onClose?: () => void;
}

export function CharacterRelationshipMap({ characters, relationships, onClose }: CharacterRelationshipMapProps) {
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null);
  const [hoveredRelationship, setHoveredRelationship] = useState<RelationshipData | null>(null);

  const getRelationshipColor = (type: RelationshipType): string => {
    const option = RELATIONSHIP_TYPE_OPTIONS.find(opt => opt.value === type);
    return option?.color || '#6b7280';
  };

  const getCharacterRelationships = (characterName: string): RelationshipData[] => {
    return relationships.filter(
      rel => rel.source === characterName || rel.target === characterName
    );
  };

  const getRelatedCharacters = (characterName: string): Set<string> => {
    const related = new Set<string>();
    relationships.forEach(rel => {
      if (rel.source === characterName) related.add(rel.target);
      if (rel.target === characterName) related.add(rel.source);
    });
    return related;
  };

  if (characters.length === 0) {
    return (
      <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-slate-200">Character Relationships</h3>
          {onClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <p className="text-slate-500 text-sm">No characters available yet. Generate characters first.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-xl p-6 border border-slate-700">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-200">Character Relationships</h3>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {RELATIONSHIP_TYPE_OPTIONS.map(opt => (
          <div key={opt.value} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: opt.color }} />
            <span className="text-slate-400">{opt.label}</span>
          </div>
        ))}
      </div>

      {/* Character Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        {characters.map((char) => {
          const isSelected = selectedCharacter === char.name;
          const isRelated = selectedCharacter ? getRelatedCharacters(selectedCharacter).has(char.name) : false;
          const charRelationships = getCharacterRelationships(char.name);
          
          return (
            <button
              key={char.name}
              onClick={() => setSelectedCharacter(isSelected ? null : char.name)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/20 ring-2 ring-blue-500/50'
                  : isRelated
                  ? 'border-blue-400/50 bg-blue-500/10'
                  : 'border-slate-600 hover:border-slate-500 bg-slate-900/30'
              }`}
            >
              <div className="font-medium text-sm truncate">{char.name}</div>
              {char.archetype && (
                <div className="text-xs text-slate-500 truncate">{char.archetype}</div>
              )}
              {char.role && (
                <div className="text-xs text-slate-400 truncate">{char.role}</div>
              )}
              {charRelationships.length > 0 && (
                <div className="flex gap-1 mt-2">
                  {charRelationships.slice(0, 4).map((rel, idx) => (
                    <div
                      key={idx}
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getRelationshipColor(rel.type) }}
                      title={`${rel.type}: ${rel.source === char.name ? rel.target : rel.source}`}
                    />
                  ))}
                  {charRelationships.length > 4 && (
                    <span className="text-xs text-slate-500">+{charRelationships.length - 4}</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected Character Relationships */}
      {selectedCharacter && (
        <div className="border-t border-slate-700 pt-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            {selectedCharacter}'s Relationships
          </h4>
          <div className="space-y-2">
            {getCharacterRelationships(selectedCharacter).length === 0 ? (
              <p className="text-sm text-slate-500">No relationships defined for this character.</p>
            ) : (
              getCharacterRelationships(selectedCharacter).map((rel, idx) => {
                const otherCharacter = rel.source === selectedCharacter ? rel.target : rel.source;
                const isHovered = hoveredRelationship === rel;
                
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredRelationship(rel)}
                    onMouseLeave={() => setHoveredRelationship(null)}
                    className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                      isHovered ? 'bg-slate-700/50' : 'bg-slate-900/30'
                    }`}
                  >
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getRelationshipColor(rel.type) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200">{otherCharacter}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-300 capitalize">
                          {rel.type}
                        </span>
                      </div>
                      {rel.description && (
                        <p className="text-xs text-slate-400 mt-1 truncate">{rel.description}</p>
                      )}
                      {rel.dynamics && isHovered && (
                        <p className="text-xs text-slate-500 mt-1">{rel.dynamics}</p>
                      )}
                    </div>
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Relationship Matrix Summary */}
      {relationships.length > 0 && !selectedCharacter && (
        <div className="border-t border-slate-700 pt-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            Relationship Summary ({relationships.length} connections)
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {RELATIONSHIP_TYPE_OPTIONS.map(opt => {
              const count = relationships.filter(r => r.type === opt.value).length;
              if (count === 0) return null;
              return (
                <div key={opt.value} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: opt.color }} />
                    <span className="text-slate-400">{opt.label}</span>
                  </div>
                  <span className="text-slate-300">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default CharacterRelationshipMap;
