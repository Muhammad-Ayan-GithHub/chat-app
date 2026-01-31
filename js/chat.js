import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

let currentUser = null;
let currentConversation = null;
let realtimeSubscription = null;

// DOM elements
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const backButton = document.getElementById('backButton');
const conversationHeader = document.getElementById('conversationHeader');
const typingIndicator = document.getElementById('typingIndicator');
const participantsList = document.getElementById('participantsList');

// Initialize chat
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Get conversation ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const conversationId = urlParams.get('conversation');
        
        if (!conversationId) {
            window.location.href = 'inbox.html';
            return;
        }

        // Load conversation
        await loadConversation(conversationId);

        // Set up real-time subscription
        setupRealtime(conversationId);

        // Set up event listeners
        setupEventListeners();

        // Scroll to bottom
        scrollToBottom();
    } catch (error) {
        console.error('Error initializing chat:', error);
        window.location.href = 'login.html';
    }
});

async function loadConversation(conversationId) {
    try {
        // Get conversation details
        const { data: conversation, error } = await supabase
            .from('conversations')
            .select(`
                *,
                conversation_participants(
                    profiles(*)
                ),
                messages(
                    *,
                    profiles!messages_sender_id_fkey(*)
                )
            `)
            .eq('id', conversationId)
            .single();

        if (error) throw error;

        currentConversation = conversation;
        
        // Display conversation header
        displayConversationHeader();
        
        // Display messages
        displayMessages(conversation.messages);
        
        // Display participants
        displayParticipants();
        
        // Mark messages as read
        await markMessagesAsRead(conversationId);
    } catch (error) {
        console.error('Error loading conversation:', error);
    }
}

function displayConversationHeader() {
    if (currentConversation.is_group) {
        conversationHeader.innerHTML = `
            <div class="avatar-group">
                <i class="fas fa-users"></i>
            </div>
            <div class="header-info">
                <h3>${currentConversation.group_name || 'Group Chat'}</h3>
                <p>${currentConversation.conversation_participants.length} members</p>
            </div>
        `;
    } else {
        const otherUser = currentConversation.conversation_participants
            .find(p => p.profiles.id !== currentUser.id)?.profiles;
        
        if (otherUser) {
            conversationHeader.innerHTML = `
                <div class="avatar">
                    <img src="${otherUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser.username)}&background=667eea&color=fff`}" 
                         alt="${otherUser.username}">
                    <span class="status ${otherUser.status}"></span>
                </div>
                <div class="header-info">
                    <h3>${otherUser.username}</h3>
                    <p>${otherUser.status === 'online' ? 'Online' : `Last seen ${formatTime(otherUser.last_seen)}`}</p>
                </div>
            `;
        }
    }
}

function displayMessages(messages) {
    messagesContainer.innerHTML = '';
    
    if (messages.length === 0) {
        messagesContainer.innerHTML = `
            <div class="empty-messages">
                <i class="fas fa-comment-slash"></i>
                <p>No messages yet</p>
                <p>Start the conversation!</p>
            </div>
        `;
        return;
    }

    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    let lastDate = null;
    
    messages.forEach(message => {
        const messageDate = new Date(message.created_at).toDateString();
        
        // Add date separator if needed
        if (lastDate !== messageDate) {
            const dateSeparator = document.createElement('div');
            dateSeparator.className = 'date-separator';
            dateSeparator.textContent = formatDate(message.created_at);
            messagesContainer.appendChild(dateSeparator);
            lastDate = messageDate;
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender_id === currentUser.id ? 'sent' : 'received'}`;
        
        messageElement.innerHTML = `
            <div class="message-content">
                ${message.content}
                <div class="message-time">
                    ${formatMessageTime(message.created_at)}
                    ${message.sender_id === currentUser.id && message.read_by?.length > 0 ? 
                        '<i class="fas fa-check-double read-indicator"></i>' : ''}
                </div>
            </div>
            ${message.sender_id !== currentUser.id ? `
                <div class="message-sender">
                    <img src="${message.profiles.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.profiles.username)}&background=667eea&color=fff`}" 
                         alt="${message.profiles.username}">
                </div>
            ` : ''}
        `;

        messagesContainer.appendChild(messageElement);
    });

    scrollToBottom();
}

function displayParticipants() {
    if (!currentConversation.is_group) return;

    participantsList.innerHTML = '';
    currentConversation.conversation_participants.forEach(participant => {
        const participantElement = document.createElement('div');
        participantElement.className = 'participant';
        participantElement.innerHTML = `
            <img src="${participant.profiles.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(participant.profiles.username)}&background=667eea&color=fff`}" 
                 alt="${participant.profiles.username}">
            <div>
                <h4>${participant.profiles.username}</h4>
                <p>${participant.profiles.status}</p>
            </div>
        `;
        participantsList.appendChild(participantElement);
    });
}

function setupRealtime(conversationId) {
    // Subscribe to new messages
    realtimeSubscription = supabase
        .channel(`conversation-${conversationId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
        }, async (payload) => {
            // Add new message
            const { data: profile } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', payload.new.sender_id)
                .single();

            const newMessage = {
                ...payload.new,
                profiles: profile
            };

            addMessageToDisplay(newMessage);
            
            // Mark as read if sent to current user
            if (payload.new.sender_id !== currentUser.id) {
                await markMessageAsRead(payload.new.id);
            }
            
            // Scroll to bottom
            scrollToBottom();
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `conversation_id=eq.${conversationId}`
        }, (payload) => {
            // Update message read status
            updateMessageReadStatus(payload.new.id, payload.new.read_by);
        })
        .subscribe();
}

function setupEventListeners() {
    // Send message
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Back button
    backButton.addEventListener('click', () => {
        window.location.href = 'inbox.html';
    });

    // Typing indicator
    let typingTimeout;
    messageInput.addEventListener('input', () => {
        // Clear existing timeout
        if (typingTimeout) clearTimeout(typingTimeout);
        
        // Show typing indicator
        // Note: In a real app, you would send a typing event to the server
        
        // Set timeout to hide typing indicator
        typingTimeout = setTimeout(() => {
            // Hide typing indicator
        }, 1000);
    });

    // Handle image paste
    messageInput.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.indexOf('image') !== -1) {
                e.preventDefault();
                const file = item.getAsFile();
                await uploadAndSendImage(file);
                break;
            }
        }
    });

    // Handle file input
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    const attachButton = document.getElementById('attachButton');
    attachButton?.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            await uploadAndSendImage(file);
            fileInput.value = '';
        }
    });
}

async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentConversation) return;

    try {
        // Send message
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: currentConversation.id,
                sender_id: currentUser.id,
                content: content
            })
            .select()
            .single();

        if (error) throw error;

        // Clear input
        messageInput.value = '';
        
        // Add message to display immediately
        const newMessage = {
            ...message,
            profiles: await supabase
                .from('profiles')
                .select('*')
                .eq('id', currentUser.id)
                .single()
                .then(({ data }) => data)
        };

        addMessageToDisplay(newMessage);
        scrollToBottom();

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    }
}

async function uploadAndSendImage(file) {
    if (!file || !file.type.startsWith('image/')) return;

    try {
        // Create a placeholder message
        const placeholderMessage = document.createElement('div');
        placeholderMessage.className = 'message sent uploading';
        placeholderMessage.innerHTML = `
            <div class="message-content">
                <div class="image-placeholder">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>Uploading image...</p>
                </div>
            </div>
        `;
        messagesContainer.appendChild(placeholderMessage);
        scrollToBottom();

        // Upload image to Supabase Storage
        const fileName = `${Date.now()}-${file.name}`;
        const filePath = `chat-images/${currentConversation.id}/${fileName}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('chat-images')
            .upload(filePath, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
            .from('chat-images')
            .getPublicUrl(filePath);

        // Remove placeholder
        placeholderMessage.remove();

        // Send message with image
        const { data: message, error } = await supabase
            .from('messages')
            .insert({
                conversation_id: currentConversation.id,
                sender_id: currentUser.id,
                content: `![Image](${publicUrl})`
            })
            .select()
            .single();

        if (error) throw error;

    } catch (error) {
        console.error('Error uploading image:', error);
        alert('Failed to upload image. Please try again.');
    }
}

function addMessageToDisplay(message) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${message.sender_id === currentUser.id ? 'sent' : 'received'}`;
    
    messageElement.innerHTML = `
        <div class="message-content">
            ${message.content}
            <div class="message-time">
                ${formatMessageTime(message.created_at)}
                ${message.sender_id === currentUser.id && message.read_by?.length > 0 ? 
                    '<i class="fas fa-check-double read-indicator"></i>' : ''}
            </div>
        </div>
        ${message.sender_id !== currentUser.id ? `
            <div class="message-sender">
                <img src="${message.profiles.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(message.profiles.username)}&background=667eea&color=fff`}" 
                     alt="${message.profiles.username}">
            </div>
        ` : ''}
    `;

    messagesContainer.appendChild(messageElement);
}

async function markMessagesAsRead(conversationId) {
    try {
        const { data: unreadMessages, error } = await supabase
            .from('messages')
            .select('id, read_by')
            .eq('conversation_id', conversationId)
            .neq('sender_id', currentUser.id)
            .is('read_by', null);

        if (error) throw error;

        for (const message of unreadMessages) {
            await markMessageAsRead(message.id);
        }
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

async function markMessageAsRead(messageId) {
    try {
        const { data: message, error: fetchError } = await supabase
            .from('messages')
            .select('read_by')
            .eq('id', messageId)
            .single();

        if (fetchError) throw fetchError;

        const readBy = message.read_by || [];
        if (!readBy.includes(currentUser.id)) {
            readBy.push(currentUser.id);
            
            await supabase
                .from('messages')
                .update({ read_by: readBy })
                .eq('id', messageId);
        }
    } catch (error) {
        console.error('Error marking message as read:', error);
    }
}

function updateMessageReadStatus(messageId, readBy) {
    const messageElement = document.querySelector(`.message [data-message-id="${messageId}"]`);
    if (messageElement && readBy?.length > 0) {
        messageElement.querySelector('.read-indicator')?.classList.add('read');
    }
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

function formatMessageTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatTime(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) {
        return diffMins === 0 ? 'Just now' : `${diffMins}m ago`;
    } else if (diffHours < 24) {
        return `${diffHours}h ago`;
    } else if (diffDays < 7) {
        return `${diffDays}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}
