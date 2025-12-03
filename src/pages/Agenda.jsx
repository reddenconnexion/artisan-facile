import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
    format,
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    isSameMonth,
    isSameDay,
    addMonths,
    subMonths,
    isToday,
    parseISO
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, User, Trash2, Edit2, Calendar } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const Agenda = () => {
    const { user } = useAuth();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [newEvent, setNewEvent] = useState({ title: '', time: '', client_name: '', address: '' });

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const location = useLocation();

    useEffect(() => {
        if (user) {
            fetchEvents();
        }
    }, [user, currentDate]);

    // Handle Voice Data
    useEffect(() => {
        if (location.state?.voiceData) {
            const { title, time } = location.state.voiceData;
            setNewEvent(prev => ({ ...prev, title: title || '', time: time || '' }));
            setShowModal(true);
            // Clear state to prevent reopening on refresh (optional, but good practice)
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Request notification permission
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    // Check for upcoming events every minute
    useEffect(() => {
        const checkReminders = () => {
            const now = new Date();
            events.forEach(event => {
                const eventDate = new Date(event.date);
                const [hours, minutes] = event.time.split(':');
                eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

                const timeDiff = eventDate.getTime() - now.getTime();
                const minutesDiff = Math.floor(timeDiff / 1000 / 60);

                // Notify 15 minutes before
                if (minutesDiff === 15) {
                    if (Notification.permission === 'granted') {
                        new Notification('Rappel de rendez-vous', {
                            body: `${event.title} commence dans 15 minutes.`,
                            icon: '/vite.svg' // Optional: add an icon
                        });
                    } else {
                        toast.info(`Rappel : ${event.title} dans 15 minutes`);
                    }
                }
            });
        };

        const interval = setInterval(checkReminders, 60000); // Check every minute
        return () => clearInterval(interval);
    }, [events]);

    const addToGoogleCalendar = (event) => {
        const eventDate = new Date(event.date);
        const [hours, minutes] = event.time.split(':');
        eventDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);

        const startTime = eventDate.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const endTime = new Date(eventDate.getTime() + 60 * 60 * 1000).toISOString().replace(/-|:|\.\d\d\d/g, ""); // Assume 1 hour duration

        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(event.title)}&dates=${startTime}/${endTime}&details=${encodeURIComponent('Rendez-vous client')}&location=${encodeURIComponent(event.address || '')}`;
        window.open(url, '_blank');
    };

    const fetchEvents = async () => {
        try {
            const { data, error } = await supabase
                .from('events')
                .select('*');

            if (error) throw error;

            // Convert strings to Date objects for local usage
            const formattedEvents = data.map(event => ({
                ...event,
                date: new Date(event.date)
            }));
            setEvents(formattedEvents || []);
        } catch (error) {
            toast.error('Erreur lors du chargement de l\'agenda');
            console.error('Error fetching events:', error);
        } finally {
            setLoading(false);
        }
    };

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));

    const handleDateClick = (day) => {
        setSelectedDate(day);
    };

    const handleAddEvent = async (e) => {
        e.preventDefault();
        if (!newEvent.title || !newEvent.time) {
            toast.error('Veuillez remplir le titre et l\'heure');
            return;
        }

        try {
            const eventData = {
                ...newEvent,
                date: selectedDate.toISOString(),
                user_id: user.id
            };

            if (editingEvent) {
                const { error } = await supabase
                    .from('events')
                    .update(eventData)
                    .eq('id', editingEvent.id);

                if (error) throw error;

                setEvents(events.map(ev =>
                    ev.id === editingEvent.id
                        ? { ...ev, ...newEvent, date: selectedDate }
                        : ev
                ));
                toast.success('Rendez-vous modifié avec succès');
            } else {
                const { data, error } = await supabase
                    .from('events')
                    .insert([eventData])
                    .select();

                if (error) throw error;

                if (data) {
                    const createdEvent = { ...data[0], date: new Date(data[0].date) };
                    setEvents([...events, createdEvent]);
                }
                toast.success('Rendez-vous ajouté avec succès');
            }

            setShowModal(false);
            setEditingEvent(null);
            setNewEvent({ title: '', time: '', client_name: '', address: '' });
        } catch (error) {
            toast.error('Erreur lors de la sauvegarde du rendez-vous');
            console.error('Error saving event:', error);
        }
    };

    const handleEditClick = (event) => {
        setEditingEvent(event);
        setNewEvent({
            title: event.title,
            time: event.time,
            client_name: event.client_name || '',
            address: event.address || ''
        });
        setShowModal(true);
    };

    const handleDeleteClick = async (eventId) => {
        if (window.confirm('Êtes-vous sûr de vouloir supprimer ce rendez-vous ?')) {
            try {
                const { error } = await supabase
                    .from('events')
                    .delete()
                    .eq('id', eventId);

                if (error) throw error;

                setEvents(events.filter(ev => ev.id !== eventId));
                toast.success('Rendez-vous supprimé');
            } catch (error) {
                toast.error('Erreur lors de la suppression');
                console.error('Error deleting event:', error);
            }
        }
    };

    const openNewEventModal = () => {
        setEditingEvent(null);
        setNewEvent({ title: '', time: '', client_name: '', address: '' });
        setShowModal(true);
    };

    const selectedDateEvents = events.filter(event => isSameDay(event.date, selectedDate));

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Agenda</h2>
                <button
                    onClick={openNewEventModal}
                    className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                    <Plus className="w-5 h-5 mr-2" />
                    Nouveau RDV
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Calendrier */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: fr })}
                        </h3>
                        <div className="flex space-x-2">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full">
                                <ChevronLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full">
                                <ChevronRight className="w-5 h-5 text-gray-600" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                            <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, dayIdx) => {
                            const isSelected = isSameDay(day, selectedDate);
                            const isCurrentMonth = isSameMonth(day, monthStart);
                            const hasEvents = events.some(event => isSameDay(event.date, day));
                            const isTodayDate = isToday(day);

                            return (
                                <button
                                    key={day.toString()}
                                    onClick={() => handleDateClick(day)}
                                    className={`
                                        h-14 flex flex-col items-center justify-center rounded-lg relative transition-colors
                                        ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-900'}
                                        ${isSelected ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}
                                        ${isTodayDate && !isSelected ? 'bg-blue-50 text-blue-600 font-bold' : ''}
                                    `}
                                >
                                    <span className="text-sm">{format(day, 'd')}</span>
                                    {hasEvents && (
                                        <div className={`w-1.5 h-1.5 rounded-full mt-1 ${isSelected ? 'bg-white' : 'bg-blue-500'}`} />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Liste des RDV du jour */}
                <div className="w-full lg:w-96 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 capitalize">
                        {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                    </h3>

                    <div className="flex-1 overflow-y-auto space-y-4">
                        {selectedDateEvents.length > 0 ? (
                            selectedDateEvents.map(event => (
                                <div key={event.id} className="p-4 rounded-lg border border-gray-100 hover:border-blue-200 hover:bg-blue-50 transition-colors group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-medium text-gray-900">{event.title}</h4>
                                        <span className="text-sm font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded group-hover:bg-white">
                                            {event.time}
                                        </span>
                                    </div>
                                    <div className="space-y-1">
                                        {event.client_name && (
                                            <div className="flex items-center text-sm text-gray-500">
                                                <User className="w-4 h-4 mr-2" />
                                                {event.client_name}
                                            </div>
                                        )}
                                        {event.address && (
                                            <div className="flex items-center text-sm text-gray-500">
                                                <MapPin className="w-4 h-4 mr-2" />
                                                {event.address}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => addToGoogleCalendar(event)}
                                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg"
                                            title="Ajouter à Google Agenda"
                                        >
                                            <Calendar className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleEditClick(event)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                                            title="Modifier"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(event.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                                            title="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                                <p>Aucun rendez-vous prévu</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Ajout/Edit RDV */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 mb-4">
                            {editingEvent ? 'Modifier le Rendez-vous' : 'Nouveau Rendez-vous'}
                        </h3>
                        <form onSubmit={handleAddEvent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                                <input
                                    type="text"
                                    required
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                    placeholder="Ex: Chantier M. Dupont"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Heure</label>
                                <input
                                    type="time"
                                    required
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={newEvent.time}
                                    onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client (Optionnel)</label>
                                <input
                                    type="text"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={newEvent.client_name}
                                    onChange={e => setNewEvent({ ...newEvent, client_name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Lieu (Optionnel)</label>
                                <input
                                    type="text"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                    value={newEvent.address}
                                    onChange={e => setNewEvent({ ...newEvent, address: e.target.value })}
                                />
                            </div>
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setEditingEvent(null); }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Annuler
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                                >
                                    {editingEvent ? 'Enregistrer' : 'Ajouter'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Agenda;
