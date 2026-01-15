
import React, { useState, useEffect } from 'react';
import { Camera, Trash2, Upload, X, Loader2, Maximize2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, FolderPlus, Folder, ChevronDown, CheckSquare, Square, ArrowRightLeft, Move, Info, FolderInput, Image as ImageIcon } from 'lucide-react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import Cropper from 'react-easy-crop';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const ProjectPhotos = ({ clientId }) => {
    const { user } = useAuth();
    const [photos, setPhotos] = useState([]);
    const [projects, setProjects] = useState([]);
    const [selectedProjectId, setSelectedProjectId] = useState('all'); // 'all', 'uncategorized', or UUID
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [creatingProject, setCreatingProject] = useState(false);
    const [newProjectName, setNewProjectName] = useState('');
    const [activeTab, setActiveTab] = useState('before'); // 'before', 'during', 'after'
    const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(null);

    // Comparison Mode State
    const [showComparisonModal, setShowComparisonModal] = useState(false);
    const [splitBefore, setSplitBefore] = useState(null);
    const [splitBefore, setSplitBefore] = useState(null);
    const [splitAfter, setSplitAfter] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(null); // LIVE PREVIEW STATE

    // Crop State
    const [cropBefore, setCropBefore] = useState({ x: 0, y: 0 });
    const [zoomBefore, setZoomBefore] = useState(1);
    const [croppedAreaPixelsBefore, setCroppedAreaPixelsBefore] = useState(null);

    const [cropAfter, setCropAfter] = useState({ x: 0, y: 0 });
    const [zoomAfter, setZoomAfter] = useState(1);
    const [croppedAreaPixelsAfter, setCroppedAreaPixelsAfter] = useState(null);

    const [croppedAreaPixelsAfter, setCroppedAreaPixelsAfter] = useState(null);

    // Debounce for preview generation
    useEffect(() => {
        const timer = setTimeout(() => {
            if (splitBefore && splitAfter && croppedAreaPixelsBefore && croppedAreaPixelsAfter) {
                generatePreview();
            }
        }, 500); // 500ms debounce
        return () => clearTimeout(timer);
    }, [splitBefore, splitAfter, croppedAreaPixelsBefore, croppedAreaPixelsAfter]);

    const canvasRef = React.useRef(null);

    // Bulk Actions State
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedPhotos, setSelectedPhotos] = useState(new Set());


    const handleGenerateComparison = async () => {
        if (!splitBefore || !splitAfter || !canvasRef.current) return;

        try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            // Load images
            const loadImg = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous"; // Important for canvas export
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            const [imgBefore, imgAfter] = await Promise.all([
                loadImg(splitBefore.photo_url),
                loadImg(splitAfter.photo_url)
            ]);

            // Set canvas size (e.g., 1200x800 for high quality output)
            const targetWidth = 1200;
            const targetHeight = 800; // Aspect ratio can be adjusted
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Fill background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Draw Header
            ctx.fillStyle = '#111827';
            ctx.font = 'bold 36px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('AVANT / APRÈS', targetWidth / 2, 50);

            // Draw Images
            // Draw Images
            // Calculate dimensions to fit side-by-side with padding
            const padding = 20;
            const imgWidth = (targetWidth - (padding * 3)) / 2;
            const imgHeight = targetHeight - 100 - padding; // Space for header

            const drawImageWithCrop = (img, cropData, xPos) => {
                if (cropData) {
                    ctx.drawImage(
                        img,
                        cropData.x,
                        cropData.y,
                        cropData.width,
                        cropData.height,
                        xPos,
                        80,
                        imgWidth,
                        imgHeight
                    );
                } else {
                    // Fallback to center crop if no crop data
                    const aspectRatio = imgWidth / imgHeight;
                    const imgRatio = img.width / img.height;
                    let sx, sy, sw, sh;

                    if (imgRatio > aspectRatio) {
                        sh = img.height;
                        sw = img.height * aspectRatio;
                        sy = 0;
                        sx = (img.width - sw) / 2;
                    } else {
                        sw = img.width;
                        sh = img.width / aspectRatio;
                        sx = 0;
                        sy = (img.height - sh) / 2;
                    }
                    ctx.drawImage(img, sx, sy, sw, sh, xPos, 80, imgWidth, imgHeight);
                }
            };

            drawImageWithCrop(imgBefore, croppedAreaPixelsBefore, padding);
            drawImageWithCrop(imgAfter, croppedAreaPixelsAfter, padding + imgWidth + padding);

            // Draw Labels
            const labelHeight = 40;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';

            // Before Label removed


            // After Label
            // Removed redundant label logic as requested by user
            // Original code drew an overlay again


            // Add Logo/Footer if needed
            ctx.fillStyle = '#6B7280';
            ctx.font = '14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText('Généré par Artisan Facile', targetWidth - padding, targetHeight - 10);

            // Trigger Download
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const link = document.createElement('a');
            link.download = `comparatif - chantier - ${Date.now()}.jpg`;
            link.href = dataUrl;
            link.click();

            // Save to Gallery
            canvas.toBlob(async (blob) => {
                if (!blob) return;

                const fileName = `${user.id}/${clientId}/comparison_${Date.now()}.jpg`;

                // 1. Upload to Storage
                const { error: uploadError } = await supabase.storage
                    .from('project-photos')
                    .upload(fileName, blob, { contentType: 'image/jpeg' });

                if (uploadError) {
                    console.error('Error saving comparison:', uploadError);
                    toast.error("Erreur lors de la sauvegarde dans la galerie");
                    return;
                }

                // 2. Get Public URL
                const { data: { publicUrl } } = supabase.storage
                    .from('project-photos')
                    .getPublicUrl(fileName);

                // Determine target project
                let targetProjectId = null;
                if (selectedProjectId !== 'all' && selectedProjectId !== 'uncategorized') {
                    targetProjectId = selectedProjectId;
                } else if (splitBefore?.project_id && splitBefore.project_id === splitAfter?.project_id) {
                    // If both photos are from the same project, put the result there
                    targetProjectId = splitBefore.project_id;
                }

                const targetCategory = activeTab === 'before' ? 'after' : activeTab;

                // 3. Save to Database
                const { error: dbError } = await supabase
                    .from('project_photos')
                    .insert([{
                        user_id: user.id,
                        client_id: clientId,
                        photo_url: publicUrl,
                        category: targetCategory,
                        project_id: targetProjectId,
                        description: 'Montage Avant / Après'
                    }]);

                if (dbError) {
                    console.error('Error saving comparison to DB:', dbError);
                    toast.error("Erreur lors de l'enregistrement");
                } else {
                    toast.success("Montage sauvegardé dans la galerie !");
                    setActiveTab(targetCategory); // Switch to the tab where the photo was saved
                    fetchPhotos(); // Refresh list
                }

            }, 'image/jpeg', 0.9);

            setShowComparisonModal(false);

        } catch (error) {
            console.error('Error generating comparison:', error);
            toast.error("Erreur lors de la génération de l'image. Vérifiez votre connexion.");
        }
    };

    const generatePreview = async () => {
        if (!splitBefore || !splitAfter || !canvasRef.current) return;

        try {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');

            // Load images (cached if possible)
            const loadImg = (src) => new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = "Anonymous";
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = src;
            });

            const [imgBefore, imgAfter] = await Promise.all([
                loadImg(splitBefore.photo_url),
                loadImg(splitAfter.photo_url)
            ]);

            // Preview size (smaller than full export for performance, but same aspect)
            // Export is 1200x800. Let's use 600x400 for preview
            const scale = 0.5;
            const targetWidth = 1200 * scale;
            const targetHeight = 800 * scale;

            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Fill background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetWidth, targetHeight);

            // Draw Header
            ctx.fillStyle = '#111827';
            ctx.font = `bold ${36 * scale}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('AVANT / APRÈS', targetWidth / 2, 50 * scale);

            // Draw Images
            const padding = 20 * scale;
            const imgWidth = (1200 - 60) / 2 * scale; // Original logic scaled
            const imgHeight = (800 - 120) * scale; // Approx height

            const drawImageWithCrop = (img, cropData, xPos) => {
                if (cropData) {
                    ctx.drawImage(
                        img,
                        cropData.x,
                        cropData.y,
                        cropData.width,
                        cropData.height,
                        xPos,
                        80 * scale,
                        imgWidth,
                        imgHeight
                    );
                }
            };

            drawImageWithCrop(imgBefore, croppedAreaPixelsBefore, padding);
            drawImageWithCrop(imgAfter, croppedAreaPixelsAfter, padding + imgWidth + padding);

            // Add Logo/Footer
            ctx.fillStyle = '#6B7280';
            ctx.font = `${14 * scale}px sans-serif`;
            ctx.textAlign = 'right';
            ctx.fillText('Artisan Facile', targetWidth - padding, targetHeight - (10 * scale));

            setPreviewUrl(canvas.toDataURL('image/jpeg', 0.8));

        } catch (error) {
            console.error('Error generating preview:', error);
        }
    };

    // Swipe handling
    const [touchStart, setTouchStart] = useState(null);
    const [touchEnd, setTouchEnd] = useState(null);

    // Move Modal State
    const [showMoveModal, setShowMoveModal] = useState(false);
    const [photosToMove, setPhotosToMove] = useState(new Set());
    const [moveTargetId, setMoveTargetId] = useState('');
    const [newMoveProjectName, setNewMoveProjectName] = useState('');
    const [isCreatingInMove, setIsCreatingInMove] = useState(false);

    // Minimum swipe distance (in px)
    const minSwipeDistance = 50;

    useEffect(() => {
        if (clientId && user) {
            Promise.all([fetchPhotos(), fetchProjects()]);

            // Realtime subscriptions
            const photosSubscription = supabase
                .channel('project_photos_subscription')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'project_photos', filter: `client_id=eq.${clientId}` },
                    (payload) => {
                        fetchPhotos();
                    }
                )
                .subscribe();

            const projectsSubscription = supabase
                .channel('projects_subscription')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'projects', filter: `client_id=eq.${clientId}` },
                    (payload) => {
                        fetchProjects();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(photosSubscription);
                supabase.removeChannel(projectsSubscription);
            };
        }
    }, [clientId, user]);

    const fetchProjects = async () => {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            setProjects(data || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
            // Silent fail allowed for projects as table might not exist yet if migration pending
        }
    };

    const createProject = async (e) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        try {
            const { data, error } = await supabase
                .from('projects')
                .insert([{
                    name: newProjectName.trim(),
                    client_id: clientId,
                    user_id: user.id
                }])
                .select()
                .single();

            if (error) throw error;

            setProjects([...projects, data]);
            setSelectedProjectId(data.id);
            setNewProjectName('');
            setCreatingProject(false);
            toast.success("Chantier créé !");
        } catch (error) {
            console.error('Error creating project:', error);
            toast.error("Erreur lors de la création du chantier");
        }
    };

    const fetchPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from('project_photos')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPhotos(data || []);
        } catch (error) {
            console.error('Error fetching photos:', error);
            toast.error('Erreur lors du chargement des photos');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event) => {
        try {
            const files = Array.from(event.target.files);
            if (files.length === 0) return;

            setUploading(true);
            let successCount = 0;

            // Process uploads in parallel
            const uploadPromises = files.map(async (file) => {
                try {
                    // 1. Upload to Storage
                    const fileExt = file.name.split('.').pop();
                    const fileName = `${user.id}/${clientId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

                    const { error: uploadError } = await supabase.storage
                        .from('project-photos')
                        .upload(fileName, file);

                    if (uploadError) throw uploadError;

                    // 2. Get Public URL
                    const { data: { publicUrl } } = supabase.storage
                        .from('project-photos')
                        .getPublicUrl(fileName);

                    // 3. Save to Database
                    const { data: photoData, error: dbError } = await supabase
                        .from('project_photos')
                        .insert([
                            {
                                user_id: user.id,
                                client_id: clientId,
                                photo_url: publicUrl,
                                category: activeTab,
                                project_id: selectedProjectId === 'all' || selectedProjectId === 'uncategorized' ? null : selectedProjectId,
                                description: ''
                            }
                        ])
                        .select()
                        .single();

                    if (dbError) throw dbError;

                    return photoData;
                } catch (err) {
                    console.error('Error uploading file:', file.name, err);
                    return null;
                }
            });

            const results = await Promise.all(uploadPromises);
            const newPhotos = results.filter(p => p !== null);

            if (newPhotos.length > 0) {
                setPhotos(prev => [...newPhotos, ...prev]);
                toast.success(`${newPhotos.length} photo(s) ajoutée(s) avec succès`);
            } else {
                toast.error("Aucune photo n'a pu être importée");
            }

        } catch (error) {
            console.error('Error in batch upload:', error);
            toast.error("Erreur lors de l'envoi des photos");
        } finally {
            setUploading(false);
            // Reset input
            event.target.value = '';
        }
    };

    const handleDelete = async (photoId, photoUrl) => {
        if (!window.confirm('Voulez-vous vraiment supprimer cette photo ?')) return;

        try {
            // 1. Delete from Database
            const { error: dbError } = await supabase
                .from('project_photos')
                .delete()
                .eq('id', photoId);

            if (dbError) throw dbError;

            // 2. Delete from Storage (Optional but good practice)
            // Extract path from URL
            const path = photoUrl.split('/project-photos/')[1];
            if (path) {
                await supabase.storage.from('project-photos').remove([path]);
            }

            setPhotos(prev => prev.filter(p => p.id !== photoId));

            // Close modal if deleted photo was open
            if (selectedPhotoIndex !== null) {
                setSelectedPhotoIndex(null);
            }

            toast.success('Photo supprimée');
        } catch (error) {
            console.error('Error deleting photo:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    // Bulk Action Handlers
    const toggleSelection = (photoId) => {
        setSelectedPhotos(prev => {
            const newSet = new Set(prev);
            if (newSet.has(photoId)) {
                newSet.delete(photoId);
            } else {
                newSet.add(photoId);
            }
            return newSet;
        });
    };

    const openMoveModal = (photoId = null) => {
        if (photoId) {
            setPhotosToMove(new Set([photoId]));
        } else {
            // Bulk mode
            if (selectedPhotos.size === 0) return;
            setPhotosToMove(selectedPhotos);
        }
        setMoveTargetId('');
        setIsCreatingInMove(false);
        setNewMoveProjectName('');
        setShowMoveModal(true);
    };

    const handleConfirmMove = async () => {
        if (photosToMove.size === 0) return;

        let targetId = moveTargetId;

        try {
            // Create project on the fly if needed
            if (isCreatingInMove) {
                if (!newMoveProjectName.trim()) {
                    toast.error("Veuillez donner un nom au dossier");
                    return;
                }
                const { data: newProject, error: createError } = await supabase
                    .from('projects')
                    .insert([{
                        name: newMoveProjectName.trim(),
                        client_id: clientId,
                        user_id: user.id
                    }])
                    .select()
                    .single();

                if (createError) throw createError;

                targetId = newProject.id;

                // Update local projects list
                setProjects(prev => [...prev, newProject]);
                toast.success(`Dossier "${newProject.name}" créé`);
            } else {
                if (!targetId) {
                    toast.error("Veuillez choisir un dossier");
                    return;
                }
            }
            // Strategy: COPY + DELETE (Workaround for missing UPDATE RLS policy)
            // 1. Prepare new rows with updated project_id
            const photosToCopy = photos.filter(p => photosToMove.has(p.id));
            const newRows = photosToCopy.map(p => ({
                user_id: user.id, // Explicitly use current user ID to satisfy RLS
                client_id: p.client_id,
                photo_url: p.photo_url,
                category: p.category,
                description: p.description,
                created_at: p.created_at, // Preserve timestamp
                project_id: targetId === 'uncategorized' ? null : parseInt(targetId)
            }));

            // 2. Insert new rows
            const { data: insertedData, error: insertError } = await supabase
                .from('project_photos')
                .insert(newRows)
                .select();

            if (insertError) {
                console.error("Move (Copy) Error:", insertError);
                throw new Error("Erreur Copie: " + insertError.message);
            }

            // 3. Delete old rows
            if (insertedData && insertedData.length > 0) {
                const { error: deleteError } = await supabase
                    .from('project_photos')
                    .delete()
                    .in('id', Array.from(photosToMove));

                if (deleteError) {
                    // Start of an inconsistent state (new copied, old not deleted) - rare
                    console.error("Move (Delete old) Error:", deleteError);
                    toast.error("Attention: Copie réussie mais suppression des originaux échouée.");
                } else {
                    toast.success(`${insertedData.length} photo(s) déplacée(s) vers ${targetName}`, { id: 'move-toast' });
                }
            } else {
                toast.error("Erreur lors de la copie des photos.", { id: 'move-toast' });
            }

            // Force refresh is essential here as IDs have changed
            await fetchPhotos();

            // Reset UI
            setPhotosToMove(new Set());
            setSelectedPhotos(new Set());
            setSelectionMode(false);
            setShowMoveModal(false);

        } catch (error) {
            console.error('Error moving photos:', error);
            const msg = error.message || "Erreur inconnue";
            toast.error(msg, { duration: 5000 });
        }
    };

    const handleBulkDelete = async () => {
        if (selectedPhotos.size === 0) return;
        if (!window.confirm(`Voulez - vous vraiment supprimer ces ${selectedPhotos.size} photos ? `)) return;

        try {
            // Delete from DB
            const { error: dbError } = await supabase
                .from('project_photos')
                .delete()
                .in('id', Array.from(selectedPhotos));

            if (dbError) throw dbError;

            // Update local state
            setPhotos(prev => prev.filter(p => !selectedPhotos.has(p.id)));

            toast.success(`${selectedPhotos.size} photo(s) supprimée(s)`);
            setSelectedPhotos(new Set());
            setSelectionMode(false);
        } catch (error) {
            console.error('Error batch deleting:', error);
            toast.error("Erreur lors de la suppression groupée");
        }
    };

    const filteredPhotos = photos.filter(p => {
        const matchesCategory = p.category === activeTab;
        const matchesProject = selectedProjectId === 'all'
            ? true
            : selectedProjectId === 'uncategorized'
                ? p.project_id === null
                : String(p.project_id) === String(selectedProjectId);
        return matchesCategory && matchesProject;
    });

    // Navigation handlers
    const handleNext = (e) => {
        e?.stopPropagation();
        if (selectedPhotoIndex === null) return;
        if (selectedPhotoIndex < filteredPhotos.length - 1) {
            setSelectedPhotoIndex(selectedPhotoIndex + 1);
        } else {
            // Loop back to start
            setSelectedPhotoIndex(0);
        }
    };

    const handlePrev = (e) => {
        e?.stopPropagation();
        if (selectedPhotoIndex === null) return;
        if (selectedPhotoIndex > 0) {
            setSelectedPhotoIndex(selectedPhotoIndex - 1);
        } else {
            // Loop to end
            setSelectedPhotoIndex(filteredPhotos.length - 1);
        }
    };

    // Swipe handlers
    const onTouchStart = (e) => {
        setTouchEnd(null); // Reset touch end
        setTouchStart(e.targetTouches[0].clientX);
    };

    const onTouchMove = (e) => {
        setTouchEnd(e.targetTouches[0].clientX);
    };

    const onTouchEnd = () => {
        if (!touchStart || !touchEnd) return;

        const distance = touchStart - touchEnd;
        const isLeftSwipe = distance > minSwipeDistance;
        const isRightSwipe = distance < -minSwipeDistance;

        if (isLeftSwipe) {
            handleNext();
        }
        if (isRightSwipe) {
            handlePrev();
        }
    };

    // Keyboard navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (selectedPhotoIndex === null) return;

            if (e.key === 'ArrowRight') handleNext();
            if (e.key === 'ArrowLeft') handlePrev();
            if (e.key === 'Escape') setSelectedPhotoIndex(null);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedPhotoIndex, filteredPhotos.length]);

    const tabs = [
        { id: 'before', label: 'Avant' },
        { id: 'during', label: 'Pendant' },
        { id: 'after', label: 'Après' }
    ];

    // Calculate photo counts per project
    const projectCounts = photos.reduce((acc, p) => {
        const key = p.project_id ? String(p.project_id) : 'uncategorized';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
    const totalPhotos = photos.length;

    if (loading) return <div className="text-center py-4 text-gray-500">Chargement des photos...</div>;

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-6 mt-6 transition-colors">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Photos du chantier
            </h3>

            {/* Project Selector */}
            <div className="mb-6 bg-gray-50 dark:bg-gray-950 p-4 rounded-lg border border-gray-100 dark:border-gray-800">
                <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Folder className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Chantier :</span>

                        {!creatingProject ? (
                            <div className="relative flex-1 sm:flex-none flex items-center gap-2 min-w-0">
                                <select
                                    value={selectedProjectId}
                                    onChange={(e) => setSelectedProjectId(e.target.value)}
                                    className="block flex-1 w-auto min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-sm text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                >
                                    <option value="all">Toutes les photos ({totalPhotos})</option>
                                    <option value="uncategorized">Non classé ({projectCounts['uncategorized'] || 0})</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.name} ({projectCounts[String(p.id)] || 0})</option>
                                    ))}
                                </select>
                                {selectedProjectId !== 'all' && selectedProjectId !== 'uncategorized' && (
                                    <button
                                        onClick={async () => {
                                            if (!window.confirm("Voulez-vous vraiment supprimer ce dossier ? Les photos seront marquées comme 'Non classé'.")) return;
                                            try {
                                                const { error } = await supabase
                                                    .from('projects')
                                                    .delete()
                                                    .match({ id: parseInt(selectedProjectId) });

                                                if (error) throw error;

                                                toast.success("Dossier supprimé");
                                                setSelectedProjectId('all');
                                                fetchProjects();
                                            } catch (err) {
                                                console.error("Error deleting project:", err);
                                                toast.error("Impossible de supprimer le dossier");
                                            }
                                        }}
                                        className="p-2 text-red-500 hover:bg-red-50 rounded-md text-xs font-medium flex-shrink-0"
                                        title="Supprimer ce dossier"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <form onSubmit={createProject} className="flex gap-2 flex-1 sm:flex-none">
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Nom du chantier..."
                                    value={newProjectName}
                                    onChange={(e) => setNewProjectName(e.target.value)}
                                    className="block w-full sm:w-48 px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                />
                                <button
                                    type="submit"
                                    className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 whitespace-nowrap"
                                >
                                    OK
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreatingProject(false)}
                                    className="px-3 py-2 bg-white border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-50"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </form>
                        )}
                    </div>

                    {!creatingProject && (
                        <button
                            onClick={() => setCreatingProject(true)}
                            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium px-3 py-2 hover:bg-blue-50 rounded-lg transition-colors ml-auto sm:ml-0"
                        >
                            <FolderPlus className="w-4 h-4" />
                            Nouveau chantier
                        </button>
                    )}
                </div>
            </div>

            {/* Bulk Actions Bar */}
            {
                selectionMode && (
                    <div className="mb-6 bg-blue-50 p-4 rounded-lg border border-blue-100 flex flex-col sm:flex-row gap-4 items-center justify-between animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-center gap-3">
                            <span className="font-bold text-blue-900 bg-blue-100 px-3 py-1 rounded-full text-sm">
                                {selectedPhotos.size} photo{selectedPhotos.size > 1 ? 's' : ''} sélectionnée{selectedPhotos.size > 1 ? 's' : ''}
                            </span>
                            <button
                                onClick={() => {
                                    if (selectedPhotos.size === filteredPhotos.length) {
                                        setSelectedPhotos(new Set());
                                    } else {
                                        setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)));
                                    }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 underline"
                            >
                                {selectedPhotos.size === filteredPhotos.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                            </button>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                            <button
                                onClick={() => openMoveModal()}
                                disabled={selectedPhotos.size === 0}
                                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <FolderInput className="w-4 h-4" />
                                Déplacer vers...
                            </button>

                            <div className="w-px h-8 bg-blue-200 mx-2 hidden sm:block"></div>

                            <button
                                onClick={handleBulkDelete}
                                disabled={selectedPhotos.size === 0}
                                className="px-4 py-2 bg-white border border-red-200 text-red-600 text-sm font-medium rounded-md hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Trash2 className="w-4 h-4" />
                                Supprimer
                            </button>
                        </div>
                    </div>
                )
            }

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                            ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
                            : 'border-transparent text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-700'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* View/Selection Toggles */}
            <div className="flex justify-between items-center mb-4">
                <button
                    onClick={() => {
                        setSelectionMode(!selectionMode);
                        setSelectedPhotos(new Set());
                    }}
                    className={`text-sm font-medium flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${selectionMode
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
                >
                    <CheckSquare className="w-4 h-4" />
                    {selectionMode ? 'Terminer la sélection' : 'Sélectionner des photos'}
                </button>
            </div>

            {/* Upload Area */}
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option 1: Select Files */}
                <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading ? 'bg-gray-50 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800 cursor-not-allowed' : 'bg-gray-50 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-600'}`}>
                    {uploading ? (
                        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                    ) : (
                        <div className="flex flex-col items-center">
                            <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Importer des photos</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Depuis la galerie ou dossier</p>
                        </div>
                    )}
                    <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        multiple
                        onChange={handleFileUpload}
                        disabled={uploading}
                    />
                </label>

                {/* Option 2: Camera */}
                <label className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl cursor-pointer transition-all ${uploading ? 'bg-blue-50/30 dark:bg-blue-900/10 border-blue-100 dark:border-blue-900 cursor-not-allowed' : 'bg-blue-50/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-blue-100/50 dark:hover:bg-blue-900/40 hover:border-blue-300 dark:hover:border-blue-700'}`}>
                    {uploading ? (
                        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    ) : (
                        <div className="flex flex-col items-center">
                            <Camera className="w-8 h-8 text-blue-500 mb-2" />
                            <p className="text-sm font-medium text-blue-700">Prendre une photo</p>
                            <p className="text-xs text-blue-400 mt-1">Appareil photo direct</p>
                        </div>
                    )}
                    <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        capture="environment"
                        onChange={handleFileUpload}
                        disabled={uploading}
                    />
                </label>
            </div>

            {/* Photo Grid */}
            {
                filteredPhotos.length === 0 ? (
                    <p className="text-center text-gray-400 py-8 italic">Aucune photo pour cette étape.</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {filteredPhotos.map((photo, index) => (
                            <div
                                key={photo.id}
                                className={`relative group aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-black border transition-all ${selectedPhotos.has(photo.id)
                                    ? 'border-blue-500 ring-2 ring-blue-500 ring-opacity-50'
                                    : 'border-gray-200 dark:border-gray-800'}`}
                                onClick={() => {
                                    if (selectionMode) {
                                        toggleSelection(photo.id);
                                    } else {
                                        setSelectedPhotoIndex(index);
                                    }
                                }}
                            >
                                <img
                                    src={photo.photo_url}
                                    alt={photo.category}
                                    className={`w-full h-full object-cover transition-transform duration-300 ${selectionMode && selectedPhotos.has(photo.id) ? 'scale-90' : 'group-hover:scale-105'}`}
                                />

                                {/* Project Badge */}
                                <div className="absolute top-2 left-2 pointer-events-none">
                                    <div className="bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                        <Folder className="w-3 h-3" />
                                        {photo.project_id
                                            ? (projects.find(p => p.id === photo.project_id)?.name || 'Dossier inconnu')
                                            : 'Non classé'}
                                    </div>
                                </div>

                                {/* Selection Checkbox */}
                                {selectionMode ? (
                                    <div className="absolute top-2 right-2 z-10">
                                        <div className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${selectedPhotos.has(photo.id)
                                            ? 'bg-blue-500 border-blue-500 text-white'
                                            : 'bg-white/80 border-gray-400 hover:border-gray-600'}`}>
                                            {selectedPhotos.has(photo.id) && <CheckSquare className="w-4 h-4" />}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedPhotoIndex(index); }}
                                            className="p-2 bg-white text-gray-900 rounded-full hover:bg-gray-100"
                                            title="Agrandir"
                                        >
                                            <Maximize2 className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); openMoveModal(photo.id); }}
                                            className="p-2 bg-white text-blue-600 rounded-full hover:bg-blue-50"
                                            title="Déplacer dans un dossier"
                                        >
                                            <FolderInput className="w-5 h-5" />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleDelete(photo.id, photo.photo_url); }}
                                            className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50"
                                            title="Supprimer"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Comparison Mode Trigger */}
            <div className="mt-6 border-t border-gray-100 dark:border-gray-800 pt-6">
                <button
                    onClick={() => setShowComparisonModal(true)}
                    className="flex items-center justify-center w-full px-4 py-3 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                >
                    <div className="flex -space-x-2 mr-3">
                        <div className="w-6 h-6 rounded-full bg-gray-300 dark:bg-gray-700 border-2 border-white dark:border-gray-600 flex items-center justify-center text-[10px] font-bold text-gray-600 dark:text-gray-300">AV</div>
                        <div className="w-6 h-6 rounded-full bg-purple-200 dark:bg-purple-800 border-2 border-white dark:border-gray-600 flex items-center justify-center text-[10px] font-bold text-purple-600 dark:text-purple-200">AP</div>
                    </div>
                    Créer un montage Avant / Après
                </button>
            </div>

            {/* Comparison Modal */}
            {
                showComparisonModal && (
                    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto flex flex-col">
                            <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center sticky top-0 bg-white dark:bg-gray-800 z-10 transition-colors">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Générateur Avant / Après</h3>
                                <button onClick={() => setShowComparisonModal(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400">
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                            {/* Modal content continued below... */}
                            <div className="p-6 space-y-8 flex-1">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Before Column */}
                                    <div>
                                        <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                                            <span className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs flex items-center justify-center mr-2">1</span>
                                            Choisir photo AVANT
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                            {photos.filter(p => p.category === 'before').map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setSplitBefore(p);
                                                        setCropBefore({ x: 0, y: 0 });
                                                        setZoomBefore(1);
                                                    }}
                                                    className={`aspect-square rounded border-2 overflow-hidden cursor-pointer ${splitBefore?.id === p.id ? 'border-purple-600 ring-2 ring-purple-100 dark:ring-purple-900' : 'border-transparent'} `}
                                                >
                                                    <img src={p.photo_url} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                            {photos.filter(p => p.category === 'before').length === 0 && (
                                                <div className="col-span-3 text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">Aucune photo "Avant"</div>
                                            )}
                                        </div>
                                        <div className="mt-4 flex flex-col gap-3">
                                            <div className="rounded-xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-700 relative h-80 bg-gray-100 dark:bg-black shadow-inner group">
                                                <Cropper
                                                    image={splitBefore.photo_url}
                                                    crop={cropBefore}
                                                    zoom={zoomBefore}
                                                    aspect={570 / 680}
                                                    onCropChange={setCropBefore}
                                                    onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixelsBefore(croppedAreaPixels)}
                                                    onZoomChange={setZoomBefore}
                                                    objectFit="contain"
                                                    showGrid={true}
                                                    classes={{
                                                        containerClassName: "rounded-xl",
                                                        cropAreaClassName: "!border-2 !border-white !shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
                                                    }}
                                                />
                                            </div>
                                            <div className="flex items-center gap-3 px-2 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                                <ZoomOut className="w-4 h-4 text-gray-500" />
                                                <input
                                                    type="range"
                                                    value={zoomBefore}
                                                    min={1}
                                                    max={3}
                                                    step={0.1}
                                                    aria-labelledby="Zoom"
                                                    onChange={(e) => setZoomBefore(Number(e.target.value))}
                                                    className="flex-1 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-blue-600"
                                                />
                                                <ZoomIn className="w-4 h-4 text-gray-500" />
                                            </div>
                                        </div>
                                        )}
                                    </div>

                                    {/* After Column */}
                                    <div>
                                        <h4 className="font-semibold text-gray-700 dark:text-gray-300 mb-4 flex items-center">
                                            <span className="w-6 h-6 rounded-full bg-purple-200 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 text-xs flex items-center justify-center mr-2">2</span>
                                            Choisir photo APRÈS
                                        </h4>
                                        <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1">
                                            {photos.filter(p => p.category === 'after' || p.category === 'during').map(p => (
                                                <div
                                                    key={p.id}
                                                    onClick={() => {
                                                        setSplitAfter(p);
                                                        setCropAfter({ x: 0, y: 0 });
                                                        setZoomAfter(1);
                                                    }}
                                                    className={`aspect-square rounded border-2 overflow-hidden cursor-pointer ${splitAfter?.id === p.id ? 'border-purple-600 ring-2 ring-purple-100 dark:ring-purple-900' : 'border-transparent'} `}
                                                >
                                                    <img src={p.photo_url} className="w-full h-full object-cover" />
                                                </div>
                                            ))}
                                            {photos.filter(p => p.category === 'after' || p.category === 'during').length === 0 && (
                                                <div className="col-span-3 text-sm text-gray-400 dark:text-gray-500 italic text-center py-4">Aucune photo "Après"</div>
                                            )}
                                        </div>
                                        {splitAfter && (
                                            <div className="mt-4 flex flex-col gap-3">
                                                <div className="rounded-xl overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-700 relative h-80 bg-gray-100 dark:bg-black shadow-inner">
                                                    <Cropper
                                                        image={splitAfter.photo_url}
                                                        crop={cropAfter}
                                                        zoom={zoomAfter}
                                                        aspect={570 / 680}
                                                        onCropChange={setCropAfter}
                                                        onCropComplete={(_, croppedAreaPixels) => setCroppedAreaPixelsAfter(croppedAreaPixels)}
                                                        onZoomChange={setZoomAfter}
                                                        objectFit="contain"
                                                        showGrid={true}
                                                        classes={{
                                                            containerClassName: "rounded-xl",
                                                            cropAreaClassName: "!border-2 !border-white !shadow-[0_0_0_9999px_rgba(0,0,0,0.7)]"
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex items-center gap-3 px-2 bg-gray-50 dark:bg-gray-800/50 p-2 rounded-lg">
                                                    <ZoomOut className="w-4 h-4 text-gray-500" />
                                                    <input
                                                        type="range"
                                                        value={zoomAfter}
                                                        min={1}
                                                        max={3}
                                                        step={0.1}
                                                        aria-labelledby="Zoom"
                                                        onChange={(e) => setZoomAfter(Number(e.target.value))}
                                                        className="flex-1 h-1.5 bg-gray-300 rounded-lg appearance-none cursor-pointer dark:bg-gray-600 accent-purple-600"
                                                    />
                                                    <ZoomIn className="w-4 h-4 text-gray-500" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Live Preview Section */}
                                {(splitBefore && splitAfter) && (
                                    <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 animate-in fade-in slide-in-from-bottom-4">
                                        <h4 className="font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                            <ImageIcon className="w-5 h-5 text-blue-600" />
                                            Aperçu du résultat
                                        </h4>
                                        <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-4 border border-gray-200 dark:border-gray-700 flex justify-center">
                                            {previewUrl ? (
                                                <img
                                                    src={previewUrl}
                                                    alt="Aperçu Avant/Après"
                                                    className="max-w-full max-h-[300px] object-contain rounded shadow-lg bg-white"
                                                />
                                            ) : (
                                                <div className="flex items-center justify-center h-32 text-gray-400 gap-2">
                                                    <Loader2 className="w-5 h-5 animate-spin" />
                                                    Génération de l'aperçu...
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-3 sticky bottom-0">
                                <button
                                    onClick={() => setShowComparisonModal(false)}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleGenerateComparison}
                                    disabled={!splitBefore || !splitAfter}
                                    className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center font-medium shadow-sm transition-all"
                                >
                                    <Upload className="w-4 h-4 mr-2" />
                                    Générer et Télécharger
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Generated Image Preview (Hidden Canvas) */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Move Modal */}
            {showMoveModal && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={() => setShowMoveModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6 dark:border dark:border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <FolderInput className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                                Déplacer {photosToMove.size} photo(s)
                            </h3>
                            <button onClick={() => setShowMoveModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choisir le dossier de destination :</label>

                                {!isCreatingInMove ? (
                                    <select
                                        value={moveTargetId}
                                        onChange={(e) => {
                                            if (e.target.value === 'new_folder_action') {
                                                setIsCreatingInMove(true);
                                                setMoveTargetId('');
                                            } else {
                                                setMoveTargetId(e.target.value);
                                            }
                                        }}
                                        className="block w-full px-3 py-2 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                                    >
                                        <option value="">-- Choisir un dossier --</option>
                                        <option value="new_folder_action" className="font-bold text-blue-600 dark:text-blue-400">+ Nouveau Dossier...</option>
                                        <option disabled>──────────</option>
                                        <option value="uncategorized">Non classé (Général)</option>
                                        {projects.map(p => (
                                            <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <FolderPlus className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                autoFocus
                                                value={newMoveProjectName}
                                                onChange={e => setNewMoveProjectName(e.target.value)}
                                                placeholder="Nom du nouveau dossier..."
                                                className="block w-full pl-9 pr-3 py-2 border border-blue-500 ring-1 ring-blue-500 rounded-lg focus:outline-none"
                                            />
                                        </div>
                                        <button
                                            onClick={() => setIsCreatingInMove(false)}
                                            className="px-3 text-gray-500 hover:bg-gray-100 rounded-lg"
                                            title="Annuler création"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                                <button
                                    onClick={() => setShowMoveModal(false)}
                                    className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    Annuler
                                </button>
                                <button
                                    onClick={handleConfirmMove}
                                    className="px-4 py-2 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm"
                                >
                                    Déplacer
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Fullscreen Modal */}
            {
                selectedPhotoIndex !== null && filteredPhotos[selectedPhotoIndex] && (
                    <div
                        className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
                        onClick={() => setSelectedPhotoIndex(null)}
                    >
                        {/* Close Button */}
                        <button
                            onClick={() => setSelectedPhotoIndex(null)}
                            className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 z-50"
                        >
                            <X className="w-8 h-8" />
                        </button>

                        {/* Previous Button */}
                        <button
                            onClick={handlePrev}
                            className="absolute left-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 hidden md:block z-50"
                        >
                            <ChevronLeft className="w-10 h-10" />
                        </button>

                        {/* Image Container with Swipe Handlers */}
                        <div
                            className="w-full h-full flex items-center justify-center p-4 overflow-hidden"
                            onTouchStart={onTouchStart}
                            onTouchMove={onTouchMove}
                            onTouchEnd={onTouchEnd}
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image area
                        >
                            <TransformWrapper
                                initialScale={1}
                                minScale={0.5}
                                maxScale={4}
                                centerOnInit={true}
                            >
                                {({ zoomIn, zoomOut, resetTransform }) => (
                                    <React.Fragment>
                                        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 z-50 bg-black/50 rounded-full px-4 py-2 backdrop-blur-sm">
                                            <button
                                                onClick={() => zoomOut()}
                                                className="p-1.5 text-white/75 hover:text-white transition-colors"
                                                title="Dézoomer"
                                            >
                                                <ZoomOut className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => resetTransform()}
                                                className="p-1.5 text-white/75 hover:text-white transition-colors"
                                                title="Réinitialiser"
                                            >
                                                <RotateCcw className="w-5 h-5" />
                                            </button>
                                            <button
                                                onClick={() => zoomIn()}
                                                className="p-1.5 text-white/75 hover:text-white transition-colors"
                                                title="Zoomer"
                                            >
                                                <ZoomIn className="w-5 h-5" />
                                            </button>
                                        </div>

                                        <TransformComponent
                                            wrapperClass="!w-full !h-full flex items-center justify-center"
                                            contentClass="!w-full !h-full flex items-center justify-center"
                                        >
                                            <img
                                                src={filteredPhotos[selectedPhotoIndex].photo_url}
                                                alt="Plein écran"
                                                className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl select-none"
                                                draggable="false"
                                            />
                                        </TransformComponent>
                                    </React.Fragment>
                                )}
                            </TransformWrapper>
                        </div>

                        {/* Mobile Action Bar (Move / Delete) */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-6 z-50">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Close fullscreen only if needed or just keep it open?
                                    // Usually easier to close it or handle z-indexes.
                                    // Let's close fullscreen for move to avoid z-index hell with invalid stacking.
                                    setSelectedPhotoIndex(null);
                                    openMoveModal(filteredPhotos[selectedPhotoIndex].id);
                                }}
                                className="bg-white/10 backdrop-blur-md p-3 rounded-full text-white hover:bg-white/20 border border-white/20 shadow-lg"
                                title="Déplacer vers un dossier"
                            >
                                <FolderInput className="w-6 h-6" />
                            </button>
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(filteredPhotos[selectedPhotoIndex].id, filteredPhotos[selectedPhotoIndex].photo_url);
                                }}
                                className="bg-red-500/20 backdrop-blur-md p-3 rounded-full text-red-100 hover:bg-red-500/40 border border-red-500/30 shadow-lg"
                                title="Supprimer la photo"
                            >
                                <Trash2 className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Next Button */}
                        <button
                            onClick={handleNext}
                            className="absolute right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10 hidden md:block z-50"
                        >
                            <ChevronRight className="w-10 h-10" />
                        </button>

                        {/* Counter */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                            {selectedPhotoIndex + 1} / {filteredPhotos.length}
                        </div>
                    </div >
                )
            }
        </div >
    );
};

export default ProjectPhotos;
