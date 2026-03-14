import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import {
  Megaphone, Calendar, Lightbulb, StickyNote, Plus, Trash2, Save,
  ChevronLeft, ChevronRight, Edit, Check, X, Camera, MessageSquare,
  Zap, GripVertical, Clock
} from 'lucide-react';

// Jours de la semaine
const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const SHORT_DAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

// Données par défaut pour un calendrier éditorial type artisan
const DEFAULT_SCHEDULE = [
  { day: 'Mardi', time: '09:00', type: 'conseil', label: 'Post conseil/astuce', color: 'blue' },
  { day: 'Jeudi', time: '13:30', type: 'chantier', label: 'Photo chantier / réalisation', color: 'green' },
  { day: 'Dimanche', time: '08:30', type: 'dossier', label: 'Dossier / Post personnel', color: 'purple' },
];

const DEFAULT_ROTATION = [
  { week: 1, theme: 'Conseil technique', description: 'Astuce pro, erreur à éviter, norme à connaître', color: 'blue' },
  { week: 2, theme: 'Coulisses chantier', description: 'Avant/après, process, matériaux utilisés', color: 'green' },
  { week: 3, theme: 'Dossier du dimanche', description: 'Sujet approfondi, guide, comparatif', color: 'purple' },
  { week: 4, theme: 'Post personnel', description: 'Anecdote, valeurs, parcours, humour métier', color: 'amber' },
];

const IDEA_CATEGORIES = [
  { id: 'conseils', label: 'Conseils techniques', icon: '🔧', color: 'blue' },
  { id: 'histoires', label: 'Histoires & anecdotes', icon: '💬', color: 'amber' },
  { id: 'dossiers', label: 'Dossiers du dimanche', icon: '📚', color: 'purple' },
  { id: 'personnel', label: 'Posts personnels', icon: '🙋', color: 'green' },
];

const NOTE_COLUMNS = [
  { id: 'photos', label: 'Photos à prendre', icon: Camera, color: 'pink' },
  { id: 'phrases', label: 'Phrases entendues', icon: MessageSquare, color: 'amber' },
  { id: 'idees', label: 'Idées de posts', icon: Zap, color: 'blue' },
];

// Persistence key
const STORAGE_KEY = 'marketing_data';

function loadData(userId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
    if (raw) return JSON.parse(raw);
  } catch { }
  return null;
}

function saveData(userId, data) {
  try {
    localStorage.setItem(`${STORAGE_KEY}_${userId}`, JSON.stringify(data));
  } catch { }
}

// Sync to Supabase profile (debounced)
let syncTimeout = null;
async function syncToProfile(userId, data) {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ marketing_data: data })
        .eq('id', userId);
      if (error) console.warn('Sync marketing data failed:', error.message);
    } catch { }
  }, 2000);
}

async function loadFromProfile(userId) {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('marketing_data')
      .eq('id', userId)
      .single();
    if (!error && data?.marketing_data) return data.marketing_data;
  } catch { }
  return null;
}

const Marketing = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('calendar');
  const [loading, setLoading] = useState(true);

  // Calendar state
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [rotation, setRotation] = useState(DEFAULT_ROTATION);
  const [currentWeek, setCurrentWeek] = useState(() => {
    const now = new Date();
    const weekNum = Math.ceil((now.getDate()) / 7);
    return ((weekNum - 1) % 4) + 1;
  });

  // Ideas bank state
  const [ideas, setIdeas] = useState({
    conseils: [],
    histoires: [],
    dossiers: [],
    personnel: [],
  });
  const [newIdea, setNewIdea] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('conseils');

  // Quick notes state
  const [notes, setNotes] = useState({
    photos: [],
    phrases: [],
    idees: [],
  });
  const [newNotes, setNewNotes] = useState({ photos: '', phrases: '', idees: '' });

  // Editing states
  const [editingSlot, setEditingSlot] = useState(null);
  const [editingRotation, setEditingRotation] = useState(null);

  // Load data
  useEffect(() => {
    if (!user) return;

    const init = async () => {
      // Try localStorage first (instant)
      const local = loadData(user.id);
      if (local) {
        applyData(local);
        setLoading(false);
      }

      // Then try Supabase (for sync across devices)
      const remote = await loadFromProfile(user.id);
      if (remote) {
        // Use remote if it's newer
        if (!local || (remote._updated > (local._updated || 0))) {
          applyData(remote);
          saveData(user.id, remote);
        }
      }
      setLoading(false);
    };

    init();
  }, [user]);

  const applyData = (data) => {
    if (data.schedule) setSchedule(data.schedule);
    if (data.rotation) setRotation(data.rotation);
    if (data.ideas) setIdeas(data.ideas);
    if (data.notes) setNotes(data.notes);
  };

  // Save whenever data changes
  const persist = useCallback((newData) => {
    if (!user) return;
    const full = {
      schedule: newData.schedule || schedule,
      rotation: newData.rotation || rotation,
      ideas: newData.ideas || ideas,
      notes: newData.notes || notes,
      _updated: Date.now(),
    };
    saveData(user.id, full);
    syncToProfile(user.id, full);
  }, [user, schedule, rotation, ideas, notes]);

  // === Calendar Functions ===
  const updateSlot = (index, updates) => {
    const newSchedule = [...schedule];
    newSchedule[index] = { ...newSchedule[index], ...updates };
    setSchedule(newSchedule);
    persist({ schedule: newSchedule });
    setEditingSlot(null);
  };

  const addSlot = () => {
    const newSlot = { day: 'Lundi', time: '12:00', type: 'libre', label: 'Nouveau créneau', color: 'gray' };
    const newSchedule = [...schedule, newSlot];
    setSchedule(newSchedule);
    persist({ schedule: newSchedule });
    setEditingSlot(newSchedule.length - 1);
  };

  const removeSlot = (index) => {
    const newSchedule = schedule.filter((_, i) => i !== index);
    setSchedule(newSchedule);
    persist({ schedule: newSchedule });
  };

  const updateRotation = (weekIndex, updates) => {
    const newRotation = [...rotation];
    newRotation[weekIndex] = { ...newRotation[weekIndex], ...updates };
    setRotation(newRotation);
    persist({ rotation: newRotation });
    setEditingRotation(null);
  };

  // === Ideas Bank Functions ===
  const addIdea = () => {
    if (!newIdea.trim()) return;
    const newIdeas = {
      ...ideas,
      [selectedCategory]: [
        ...ideas[selectedCategory],
        { id: Date.now(), text: newIdea.trim(), done: false, created: new Date().toISOString() }
      ]
    };
    setIdeas(newIdeas);
    persist({ ideas: newIdeas });
    setNewIdea('');
  };

  const toggleIdea = (category, id) => {
    const newIdeas = {
      ...ideas,
      [category]: ideas[category].map(i =>
        i.id === id ? { ...i, done: !i.done } : i
      )
    };
    setIdeas(newIdeas);
    persist({ ideas: newIdeas });
  };

  const removeIdea = (category, id) => {
    const newIdeas = {
      ...ideas,
      [category]: ideas[category].filter(i => i.id !== id)
    };
    setIdeas(newIdeas);
    persist({ ideas: newIdeas });
  };

  // === Quick Notes Functions ===
  const addNote = (column) => {
    if (!newNotes[column].trim()) return;
    const newNotesData = {
      ...notes,
      [column]: [
        { id: Date.now(), text: newNotes[column].trim(), created: new Date().toISOString() },
        ...notes[column]
      ]
    };
    setNotes(newNotesData);
    persist({ notes: newNotesData });
    setNewNotes(prev => ({ ...prev, [column]: '' }));
  };

  const removeNote = (column, id) => {
    const newNotesData = {
      ...notes,
      [column]: notes[column].filter(n => n.id !== id)
    };
    setNotes(newNotesData);
    persist({ notes: newNotesData });
  };

  // Color helper
  const colorClasses = {
    blue: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
    pink: 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300',
    gray: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300',
  };

  const borderColors = {
    blue: 'border-blue-300 dark:border-blue-700',
    green: 'border-green-300 dark:border-green-700',
    purple: 'border-purple-300 dark:border-purple-700',
    amber: 'border-amber-300 dark:border-amber-700',
    pink: 'border-pink-300 dark:border-pink-700',
    gray: 'border-gray-300 dark:border-gray-600',
  };

  const dotColors = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    purple: 'bg-purple-500',
    amber: 'bg-amber-500',
    pink: 'bg-pink-500',
    gray: 'bg-gray-400',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Megaphone className="w-6 h-6 text-purple-600" />
          Marketing & Communication
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
        {[
          { id: 'calendar', label: 'Calendrier', icon: Calendar },
          { id: 'ideas', label: 'Banque d\'idees', icon: Lightbulb },
          { id: 'notes', label: 'Notes rapides', icon: StickyNote },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-all ${
              activeTab === tab.id
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'calendar' && (
        <div className="space-y-6">
          {/* Weekly Schedule */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Planning hebdomadaire
              </h2>
              <button
                onClick={addSlot}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Ajouter
              </button>
            </div>

            {/* Week view */}
            <div className="grid grid-cols-7 gap-1 mb-4 hidden md:grid">
              {DAYS.map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-1">
                  {day}
                </div>
              ))}
              {DAYS.map(day => {
                const daySlots = schedule.filter(s => s.day === day);
                return (
                  <div key={`slots-${day}`} className="min-h-[80px] bg-gray-50 dark:bg-gray-800/50 rounded-lg p-1.5 space-y-1">
                    {daySlots.map((slot, idx) => {
                      const slotIndex = schedule.indexOf(slot);
                      return (
                        <div
                          key={idx}
                          onClick={() => setEditingSlot(slotIndex)}
                          className={`text-xs p-1.5 rounded cursor-pointer hover:opacity-80 transition-opacity ${colorClasses[slot.color]}`}
                        >
                          <div className="font-medium">{slot.time}</div>
                          <div className="truncate">{slot.label}</div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {/* Mobile list view */}
            <div className="space-y-2 md:hidden">
              {schedule.map((slot, index) => (
                <div
                  key={index}
                  onClick={() => setEditingSlot(index)}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer ${borderColors[slot.color]} bg-white dark:bg-gray-800`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColors[slot.color]}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{slot.label}</div>
                    <div className="text-xs text-gray-500">{slot.day} - {slot.time}</div>
                  </div>
                  <Edit className="w-4 h-4 text-gray-400" />
                </div>
              ))}
            </div>

            {/* Edit slot modal */}
            {editingSlot !== null && schedule[editingSlot] && (
              <EditSlotModal
                slot={schedule[editingSlot]}
                onSave={(updates) => updateSlot(editingSlot, updates)}
                onDelete={() => { removeSlot(editingSlot); setEditingSlot(null); }}
                onClose={() => setEditingSlot(null)}
              />
            )}
          </div>

          {/* 4-Week Rotation */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-purple-600" />
              Rotation 4 semaines
            </h2>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">Semaine actuelle :</span>
              <div className="flex gap-1">
                {rotation.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentWeek(i + 1)}
                    className={`w-8 h-8 rounded-full text-sm font-bold transition-all ${
                      currentWeek === i + 1
                        ? `${colorClasses[r.color]} ring-2 ring-offset-2 ring-${r.color}-400`
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-500'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
              {rotation.map((week, index) => (
                <div
                  key={index}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    currentWeek === index + 1
                      ? `${borderColors[week.color]} shadow-md`
                      : 'border-gray-100 dark:border-gray-800 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${colorClasses[week.color]}`}>
                      S{index + 1}
                    </span>
                    <button
                      onClick={() => setEditingRotation(index)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-sm">{week.theme}</h3>
                  <p className="text-xs text-gray-500 mt-1">{week.description}</p>
                </div>
              ))}
            </div>

            {/* Edit rotation modal */}
            {editingRotation !== null && (
              <EditRotationModal
                week={rotation[editingRotation]}
                weekIndex={editingRotation}
                onSave={(updates) => updateRotation(editingRotation, updates)}
                onClose={() => setEditingRotation(null)}
              />
            )}
          </div>
        </div>
      )}

      {activeTab === 'ideas' && (
        <div className="space-y-6">
          {/* Add idea */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-amber-500" />
              Ajouter une idee
            </h2>

            <div className="flex flex-wrap gap-2 mb-3">
              {IDEA_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    selectedCategory === cat.id
                      ? colorClasses[cat.color]
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newIdea}
                onChange={(e) => setNewIdea(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addIdea()}
                placeholder="Ex: Comment choisir son disjoncteur différentiel..."
                className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                onClick={addIdea}
                disabled={!newIdea.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Ajouter</span>
              </button>
            </div>
          </div>

          {/* Ideas by category */}
          <div className="grid md:grid-cols-2 gap-4">
            {IDEA_CATEGORIES.map(cat => {
              const catIdeas = ideas[cat.id] || [];
              const pending = catIdeas.filter(i => !i.done);
              const done = catIdeas.filter(i => i.done);

              return (
                <div key={cat.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <h3 className="font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                    <span>{cat.icon}</span>
                    {cat.label}
                    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${colorClasses[cat.color]}`}>
                      {pending.length}
                    </span>
                  </h3>

                  {catIdeas.length === 0 ? (
                    <p className="text-sm text-gray-400 italic py-2">Aucune idee pour le moment</p>
                  ) : (
                    <div className="space-y-1.5">
                      {pending.map(idea => (
                        <div key={idea.id} className="flex items-start gap-2 group">
                          <button
                            onClick={() => toggleIdea(cat.id, idea.id)}
                            className="mt-0.5 w-4 h-4 border-2 border-gray-300 dark:border-gray-600 rounded flex-shrink-0 hover:border-green-500 transition-colors"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{idea.text}</span>
                          <button
                            onClick={() => removeIdea(cat.id, idea.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {done.length > 0 && (
                        <details className="mt-2">
                          <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600">
                            {done.length} utilisee{done.length > 1 ? 's' : ''}
                          </summary>
                          <div className="space-y-1 mt-1">
                            {done.map(idea => (
                              <div key={idea.id} className="flex items-start gap-2 group">
                                <button
                                  onClick={() => toggleIdea(cat.id, idea.id)}
                                  className="mt-0.5 w-4 h-4 bg-green-500 rounded flex-shrink-0 flex items-center justify-center"
                                >
                                  <Check className="w-3 h-3 text-white" />
                                </button>
                                <span className="text-sm text-gray-400 line-through flex-1">{idea.text}</span>
                                <button
                                  onClick={() => removeIdea(cat.id, idea.id)}
                                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'notes' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1 flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-amber-500" />
              Notes au fil de l'eau
            </h2>
            <p className="text-sm text-gray-500 mb-4">Capturez vos idees sur le terrain - photos a prendre, phrases entendues, inspirations</p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {NOTE_COLUMNS.map(col => {
              const colNotes = notes[col.id] || [];
              const Icon = col.icon;

              return (
                <div key={col.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
                  <h3 className={`font-bold text-sm mb-3 flex items-center gap-2 ${
                    col.color === 'pink' ? 'text-pink-600' :
                    col.color === 'amber' ? 'text-amber-600' :
                    'text-blue-600'
                  }`}>
                    <Icon className="w-4 h-4" />
                    {col.label}
                    <span className="ml-auto text-xs bg-gray-100 dark:bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">
                      {colNotes.length}
                    </span>
                  </h3>

                  <div className="flex gap-1.5 mb-3">
                    <input
                      type="text"
                      value={newNotes[col.id]}
                      onChange={(e) => setNewNotes(prev => ({ ...prev, [col.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && addNote(col.id)}
                      placeholder="Ajouter..."
                      className="flex-1 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                      onClick={() => addNote(col.id)}
                      disabled={!newNotes[col.id].trim()}
                      className="p-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-200 disabled:opacity-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {colNotes.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-4 text-center">Rien pour le moment</p>
                    ) : (
                      colNotes.map(note => (
                        <div key={note.id} className="flex items-start gap-2 group bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">{note.text}</span>
                          <button
                            onClick={() => removeNote(col.id, note.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all flex-shrink-0 mt-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// === Sub-Components ===

const EditSlotModal = ({ slot, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState({ ...slot });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-lg font-bold dark:text-white">Modifier le creneau</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Jour</label>
            <select
              value={form.day}
              onChange={(e) => setForm({ ...form, day: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure</label>
            <input
              type="time"
              value={form.time}
              onChange={(e) => setForm({ ...form, time: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Couleur</label>
            <div className="flex gap-2">
              {['blue', 'green', 'purple', 'amber', 'pink', 'gray'].map(c => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    form.color === c ? 'scale-110 border-gray-900 dark:border-white' : 'border-transparent'
                  } ${c === 'blue' ? 'bg-blue-500' : c === 'green' ? 'bg-green-500' : c === 'purple' ? 'bg-purple-500' : c === 'amber' ? 'bg-amber-500' : c === 'pink' ? 'bg-pink-500' : 'bg-gray-400'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-between">
          <button
            onClick={onDelete}
            className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4 inline mr-1" />
            Supprimer
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg"
            >
              Annuler
            </button>
            <button
              onClick={() => onSave(form)}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const EditRotationModal = ({ week, weekIndex, onSave, onClose }) => {
  const [form, setForm] = useState({ ...week });

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 w-full max-w-md rounded-xl shadow-2xl">
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
          <h3 className="text-lg font-bold dark:text-white">Semaine {weekIndex + 1}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Theme</label>
            <input
              type="text"
              value={form.theme}
              onChange={(e) => setForm({ ...form, theme: e.target.value })}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Couleur</label>
            <div className="flex gap-2">
              {['blue', 'green', 'purple', 'amber', 'pink', 'gray'].map(c => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${
                    form.color === c ? 'scale-110 border-gray-900 dark:border-white' : 'border-transparent'
                  } ${c === 'blue' ? 'bg-blue-500' : c === 'green' ? 'bg-green-500' : c === 'purple' ? 'bg-purple-500' : c === 'amber' ? 'bg-amber-500' : c === 'pink' ? 'bg-pink-500' : 'bg-gray-400'}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 rounded-lg"
          >
            Annuler
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
};

export default Marketing;
