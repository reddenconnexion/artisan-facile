/**
 * Utility to send notifications via ntfy.sh
 */

export const sendNotification = async (userId, message, title = 'Artisan Facile') => {
    if (!userId) return;

    const topic = `artisan-facile-${userId}`;

    try {
        await fetch(`https://ntfy.sh/${topic}`, {
            method: 'POST',
            body: message,
            headers: {
                'Title': title,
                'Priority': 'high',
                'Tags': 'tada,money_with_wings'
            }
        });
        console.log('Notification sent to topic:', topic);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
};

export const getNotificationTopic = (userId) => {
    if (!userId) return '';
    return `artisan-facile-${userId}`;
};

/**
 * Sends a pipeline completion notification summarizing what was auto-created.
 * @param {string} userId
 * @param {Array} actionsTaken - Array of { type, label, link } objects from voicePipelineExecutor
 */
export const sendPipelineNotification = async (userId, actionsTaken) => {
    if (!userId || !actionsTaken || actionsTaken.length === 0) return;

    const summary = actionsTaken.map(a => `• ${a.label}`).join('\n');
    const title = 'Pipeline vocal — Actions effectuées';

    await sendNotification(userId, summary, title);
};
