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
