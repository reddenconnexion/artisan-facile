import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { ChevronLeft, ChevronRight, Plus, Clock, MapPin, User, Trash2, Edit2, Calendar, Route as RouteIcon, Package } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useRealtimeSubscription } from '../hooks/useRealtimeSubscription';
import RealtimeStatusBadge from '../components/RealtimeStatusBadge';
import ChantierMaterialModal from '../components/ChantierMaterialModal';
import { Button } from '../components/ui';
import { toast } from 'sonner';

const Agenda = () => {
    const { user } = useAuth();
    const confirm = useConfirm();
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    const [newEvent, setNewEvent] = useState({ title: '', time: '', client_name: '', client_id: null, address: '', details: '', date: '', quote_id: null });
    // Devis du client sélectionné, proposés pour association au RDV/chantier.
    const [clientQuotes, setClientQuotes] = useState([]);
    // RDV dont on consulte la liste de matériel à charger.
    const [materialEvent, setMaterialEvent] = useState(null);

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

    const { status: realtimeStatus } = useRealtimeSubscription(
        user ? 'events_list_subscription' : null,
        { table: 'events' },
        () => fetchEvents()
    );

    // Handle Voice Data, Direct Prefill, or Simple Date Focus
    useEffect(() => {
        if (location.state?.voiceData) {
            const { title, time, clientName, location: loc, dateISO } = location.state.voiceData;

            if (dateISO) {
                const newDate = new Date(dateISO);
                setSelectedDate(newDate);
                setCurrentDate(newDate); // Switch view to that month
            }

            setNewEvent(prev => {
                const update = { ...prev };
                if (title) update.title = title;
                if (time) update.time = time;
                if (loc) update.address = loc; // Map location to address
                if (dateISO) update.date = dateISO.split('T')[0]; // Set date for input
                return update;
            });

            // If clientName is present, try to find the client
            if (clientName) {
                supabase.from('clients').select('id, name, address, postal_code, city').ilike('name', `%${clientName}%`).limit(1)
                    .then(({ data }) => {
                        if (data && data.length > 0) {
                            const c = data[0];
                            const fullAddress = [c.address, c.postal_code, c.city].filter(Boolean).join(', ');
                            setNewEvent(prev => ({ ...prev, client_name: c.name, client_id: c.id, ...(fullAddress && !prev.address ? { address: fullAddress } : {}) }));
                            toast.success(`Client ${c.name} associé`);
                        } else {
                            // If not found, just use the spoken name
                            setNewEvent(prev => ({ ...prev, client_name: clientName }));
                            toast.warning(`Client "${clientName}" non trouvé dans la base, mais ajouté au RDV`);
                        }
                    });
            }

            setShowModal(true);
            // Clear state to prevent reopening on refresh
            window.history.replaceState({}, document.title);
        } else if (location.state?.prefill) {
            // Handle direct prefill (e.g. from ClientForm)
            const { client_id, client_name, address, title } = location.state.prefill;
            setNewEvent(prev => ({
                ...prev,
                client_id: client_id,
                client_name: client_name,
                address: address || '',
                title: title || prev.title || '',
                date: format(new Date(), 'yyyy-MM-dd'), // Default to today
                time: '09:00' // Default time
            }));
            setShowModal(true);
            window.history.replaceState({}, document.title);
        } else if (location.state?.focusDate) {
            // Just jump to date (e.g. from Dashboard)
            const newDate = new Date(location.state.focusDate);
            setSelectedDate(newDate);
            setCurrentDate(newDate);
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Note : la permission notification est demandée depuis Profile > Notifications Push,
    // pas silencieusement ici (Chrome bloque les sites qui demandent sans interaction).

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

    // Charge les devis du client sélectionné pour les proposer à l'association.
    // Un chantier programmé découle souvent d'un devis : le rattacher permet de
    // retrouver la liste du matériel la veille et le matin de l'intervention.
    useEffect(() => {
        if (!showModal || !newEvent.client_id) {
            setClientQuotes([]);
            return;
        }
        let active = true;
        supabase
            .from('quotes')
            .select('id, title, date, status, type')
            .eq('client_id', newEvent.client_id)
            .neq('type', 'invoice')
            .order('date', { ascending: false })
            .then(({ data }) => { if (active) setClientQuotes(data || []); });
        return () => { active = false; };
    }, [showModal, newEvent.client_id]);

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
        if (!newEvent.title || !newEvent.time || !newEvent.date) {
            toast.error('Veuillez remplir le titre, la date et l\'heure');
            return;
        }

        try {
            const eventData = {
                ...newEvent,
                // Use the date from the input, ensuring it's treated as the correct day
                date: new Date(newEvent.date).toISOString(),
                quote_id: newEvent.quote_id || null,
                user_id: user.id
            };
            // Remove the date string property before sending if needed, but spread handles it. 
            // Actually we need to make sure we don't send 'date' string if schema expects timestamp, 
            // but supabase handles ISO string fine for timestamp columns usually.
            // However, we are sending 'date' property which IS the column name.
            // The issue is newEvent.date is "YYYY-MM-DD", but we want ISO timestamp.
            // We just overwrote it above with `date: new Date(newEvent.date).toISOString()`.

            if (editingEvent) {
                const { error } = await supabase
                    .from('events')
                    .update(eventData)
                    .eq('id', editingEvent.id);

                if (error) throw error;

                setEvents(events.map(ev =>
                    ev.id === editingEvent.id
                        ? { ...ev, ...newEvent, date: new Date(newEvent.date) }
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

            setNewEvent({ title: '', time: '', client_name: '', client_id: null, address: '', details: '', date: '', quote_id: null });
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
            client_id: event.client_id || null,
            address: event.address || '',
            details: event.details || '',
            quote_id: event.quote_id || null,
            date: format(event.date, 'yyyy-MM-dd')
        });
        setShowModal(true);
    };

    const handleDeleteClick = async (eventId) => {
        const ok = await confirm({ title: 'Supprimer ce rendez-vous', message: 'Cette action est irréversible.', confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
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
    };

    const openNewEventModal = () => {
        setEditingEvent(null);
        setNewEvent({
            title: '',
            time: '',
            client_name: '',
            client_id: null,
            address: '',
            details: '',
            quote_id: null,
            date: format(selectedDate, 'yyyy-MM-dd')
        });
        setShowModal(true);
    };

    const selectedDateEvents = events.filter(event => isSameDay(event.date, selectedDate));

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    return (
        <div className="flex flex-col h-full space-y-6">
            <div className="flex items-center justify-between">
                <h1 className="ios-title flex items-center gap-2">
                    Agenda
                    <RealtimeStatusBadge status={realtimeStatus} className="ml-1" />
                </h1>
                <Button onClick={openNewEventModal}>
                    <Plus className="w-5 h-5" />
                    Nouveau RDV
                </Button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 h-full">
                {/* Calendrier */}
                <div className="flex-1 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                            {format(currentDate, 'MMMM yyyy', { locale: fr })}
                        </h3>
                        <div className="flex space-x-2">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                                <ChevronLeft className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </button>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                                <ChevronRight className="w-5 h-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => (
                            <div key={day} className="text-center text-sm font-medium text-gray-500 dark:text-gray-400 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day) => {
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
                                        ${!isCurrentMonth ? 'text-gray-300' : 'text-gray-900 dark:text-white'}
                                        ${isSelected ? 'bg-ios text-white' : 'hover:bg-gray-50 dark:hover:bg-gray-800'}
                                        ${isTodayDate && !isSelected ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 font-bold' : ''}
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
                <div className="w-full lg:w-96 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
                            {format(selectedDate, 'EEEE d MMMM', { locale: fr })}
                        </h3>
                        {selectedDateEvents.some(e => e.address) && (
                            <button
                                onClick={async () => {
                                    let startAddress = '';
                                    try {
                                        const { data } = await supabase
                                            .from('profiles')
                                            .select('address, postal_code, city')
                                            .eq('id', user.id)
                                            .single();
                                        if (data) {
                                            startAddress = [data.address, data.postal_code, data.city].filter(Boolean).join(', ');
                                        }
                                    } catch {
                                        // pas d'adresse de départ par défaut, l'utilisateur saisira
                                    }
                                    const stops = [
                                        startAddress,
                                        ...selectedDateEvents.filter(e => e.address).map(e => e.address),
                                    ];
                                    navigate('/app/route-planner', { state: { stops } });
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg hover:bg-blue-100"
                                title="Planifier l'itinéraire de la journée"
                            >
                                <RouteIcon className="w-3.5 h-3.5" />
                                Planifier la tournée
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4">
                        {selectedDateEvents.length > 0 ? (
                            selectedDateEvents.map(event => (
                                <div key={event.id} className="p-4 rounded-lg border border-gray-100 dark:border-gray-800 hover:border-blue-200 hover:bg-blue-50 transition-colors group relative">
                                    <div className="flex justify-between items-start mb-2">
                                        <h4 className="font-medium text-gray-900 dark:text-white">{event.title}</h4>
                                        <span className="text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded group-hover:bg-white">
                                            {event.time}
                                        </span>
                                    </div>
                                    <div className="space-y-2 mt-2">
                                        {event.client_name && (
                                            <div className="flex items-start text-sm text-gray-600 dark:text-gray-400">
                                                <User className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                                                <span className="font-medium">{event.client_name}</span>
                                            </div>
                                        )}
                                        {event.address && (
                                            <div className="flex items-start text-sm text-gray-500 dark:text-gray-400">
                                                <MapPin className="w-4 h-4 mr-2 mt-0.5 shrink-0" />
                                                <span>{event.address}</span>
                                            </div>
                                        )}
                                        {event.details && (
                                            <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded text-sm text-gray-600 dark:text-gray-400 italic whitespace-pre-wrap border border-gray-100 dark:border-gray-800 mt-2">
                                                {event.details}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex justify-end space-x-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                                        {(event.quote_id || event.client_id) && (
                                            <button
                                                onClick={() => setMaterialEvent(event)}
                                                className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg"
                                                title="Matériel à charger"
                                            >
                                                <Package className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => addToGoogleCalendar(event)}
                                            className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                            title="Ajouter à Google Agenda"
                                        >
                                            <Calendar className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleEditClick(event)}
                                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                                            title="Modifier"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteClick(event.id)}
                                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                            title="Supprimer"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : events.length === 0 ? (
                            /* Aucun événement en base — premier usage */
                            <div className="text-center py-8 px-2">
                                <div className="bg-violet-50 rounded-full h-14 w-14 flex items-center justify-center mx-auto mb-4">
                                    <Calendar className="w-7 h-7 text-violet-400" />
                                </div>
                                <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">Planifiez vos interventions</p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
                                    Cliquez sur un jour du calendrier ou ajoutez directement votre premier rendez-vous.
                                </p>
                                <button
                                    onClick={() => {
                                        setNewEvent(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
                                        setShowModal(true);
                                    }}
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700 transition-colors"
                                >
                                    <Plus className="w-4 h-4" />
                                    Ajouter un rendez-vous
                                </button>
                            </div>
                        ) : (
                            /* Jour sélectionné sans événement */
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <Clock className="w-10 h-10 mx-auto mb-3 text-gray-200" />
                                <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">Aucun rendez-vous ce jour</p>
                                <button
                                    onClick={() => {
                                        setNewEvent(prev => ({ ...prev, date: format(selectedDate, 'yyyy-MM-dd') }));
                                        setShowModal(true);
                                    }}
                                    className="text-sm text-violet-600 hover:text-violet-700 font-medium hover:underline"
                                >
                                    + Ajouter un rendez-vous
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Modal Ajout/Edit RDV */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50 sm:p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-t-2xl sm:rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            {editingEvent ? 'Modifier le Rendez-vous' : 'Nouveau Rendez-vous'}
                        </h3>
                        <form onSubmit={handleAddEvent} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Titre</label>
                                <input
                                    type="text"
                                    required
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    value={newEvent.title}
                                    onChange={e => setNewEvent({ ...newEvent, title: e.target.value })}
                                    placeholder="Ex: Chantier M. Dupont"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date</label>
                                <input
                                    type="date"
                                    required
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    value={newEvent.date}
                                    onChange={e => setNewEvent({ ...newEvent, date: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Heure</label>
                                <input
                                    type="time"
                                    required
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    value={newEvent.time}
                                    onChange={e => setNewEvent({ ...newEvent, time: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client (Optionnel)</label>
                                <input
                                    type="text"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    value={newEvent.client_name}
                                    onChange={e => setNewEvent({ ...newEvent, client_name: e.target.value })}
                                    onBlur={async () => {
                                        if (newEvent.client_name) {
                                            const { data } = await supabase.from('clients').select('id, name, address, postal_code, city').ilike('name', newEvent.client_name).limit(1);
                                            if (data && data.length > 0) {
                                                const c = data[0];
                                                const fullAddress = [c.address, c.postal_code, c.city].filter(Boolean).join(', ');
                                                setNewEvent(prev => ({ ...prev, client_name: c.name, client_id: c.id, ...(fullAddress && !prev.address ? { address: fullAddress } : {}) }));
                                                toast.success('Client identifié : ' + c.name);
                                            } else {
                                                setNewEvent(prev => ({ ...prev, client_id: null }));
                                            }
                                        } else {
                                            setNewEvent(prev => ({ ...prev, client_id: null }));
                                        }
                                    }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lieu (Optionnel)</label>
                                <input
                                    type="text"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    value={newEvent.address}
                                    onChange={e => setNewEvent({ ...newEvent, address: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Détails (Optionnel)</label>
                                <textarea
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                    rows="3"
                                    value={newEvent.details}
                                    onChange={e => setNewEvent({ ...newEvent, details: e.target.value })}
                                    placeholder="Notes sur l'intervention..."
                                />
                            </div>
                            {newEvent.client_id && clientQuotes.length > 0 && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Devis associé (Optionnel)
                                    </label>
                                    <select
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        value={newEvent.quote_id || ''}
                                        onChange={e => setNewEvent({ ...newEvent, quote_id: e.target.value ? Number(e.target.value) : null })}
                                    >
                                        <option value="">Aucun devis</option>
                                        {clientQuotes.map(q => (
                                            <option key={q.id} value={q.id}>
                                                {(q.title || `Devis #${q.id}`)}{q.date ? ` · ${format(parseISO(q.date), 'dd/MM/yyyy')}` : ''}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        La liste du matériel sera accessible depuis le tableau de bord, la veille et le matin du chantier.
                                    </p>
                                </div>
                            )}
                            <div className="flex justify-end space-x-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => { setShowModal(false); setEditingEvent(null); }}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 dark:border-gray-700"
                                >
                                    Annuler
                                </button>
                                <Button type="submit">
                                    {editingEvent ? 'Enregistrer' : 'Ajouter'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {materialEvent && (
                <ChantierMaterialModal event={materialEvent} onClose={() => setMaterialEvent(null)} />
            )}
        </div>
    );
};

export default Agenda;
