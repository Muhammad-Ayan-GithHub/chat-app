import { supabase } from './supabase.js';
import { getCurrentUser, logout } from './auth.js';

let currentUser = null;
let realtimeSubscription = null;

// DOM elements
const conversationsList = document.getElementById('conversationsList');
const newChatBtn = document.getElementById('newChatBtn');
const searchInput = document.getElementById('searchInput');
const logoutBtn = document.getElementById('logoutBtn');
const usernameSpan = document.getElementById('username');

// Initialize inbox
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check authentication
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }

        // Display username
        const profile = await getProfile(currentUser.id);
        usernameSpan.textContent = profile.username;

        // Load conversations
        await loadConversations();

        // Set up real-time subscription for new messages
        setupRealtime();

        // Update user status
        await updateUserStatus('online');

        // Set up event listeners
        setupEventListeners();
    } catch (error) {
        console.error('Error initializing inbox:', error);
        window.location.href = 'login.html';
    }
});

async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    
    if (error) throw error;
    return data;
}

async function loadConversations() {
    try {
        // Get conversations where user is a participant
        const { data: conversations, error } = await supabase
            .from('conversations')
            .select(`
                *,
                conversation_participants!inner(
                    profiles(*)
                ),
                messages(
                    *,
                    profiles!messages_sender_id_fkey(*)
                )
            `)
            .order('last_message_at', { ascending: false });

        if (error) throw error;

        displayConversations(conversations);
    } catch (error) {
        console.error('Error loading conversations:', error);
    }
}

function displayConversations(conversations) {
    conversationsList.innerHTML = '';

    if (conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-comments"></i>
                <p>No conversations yet</p>
                <p>Start a new chat to begin messaging</p>
            </div>
        `;
        return;
    }

    conversations.forEach(conversation => {
        const lastMessage = conversation.messages?.[conversation.messages.length - 1];
        const participants = conversation.conversation_participants
            .filter(p => p.profiles.id !== currentUser.id)
            .map(p => p.profiles);

        const conversationItem = document.createElement('div');
        conversationItem.className = 'conversation-item';
        conversationItem.dataset.conversationId = conversation.id;

        if (conversation.is_group) {
            conversationItem.innerHTML = `
                <div class="avatar-group">
                    <i class="fas fa-users"></i>
                </div>
                <div class="conversation-info">
                    <div class="conversation-header">
                        <h4>${conversation.group_name || 'Group Chat'}</h4>
                        <span class="time">${formatTime(conversation.last_message_at)}</span>
                    </div>
                    <div class="last-message">
                        ${lastMessage ? `${lastMessage.profiles.username}: ${lastMessage.content}` : 'No messages yet'}
                    </div>
                </div>
            `;
        } else {
            const otherUser = participants[0];
            conversationItem.innerHTML = `
                <div class="avatar">
                    <img src="${otherUser.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherUser.username)}&background=667eea&color=fff`}" 
                         alt="${otherUser.username}">
                    <span class="status ${otherUser.status}"></span>
                </div>
                <div class="conversation-info">
                    <div class="conversation-header">
                        <h4>${otherUser.username}</h4>
                        <span class="time">${formatTime(conversation.last_message_at)}</span>
                    </div>
                    <div class="last-message">
                        ${lastMessage ? lastMessage.content : 'No messages yet'}
                    </div>
                </div>
            `;
        }

        conversationItem.addEventListener('click', () => {
            window.location.href = `chat.html?conversation=${conversation.id}`;
        });

        conversationsList.appendChild(conversationItem);
    });
}

function setupRealtime() {
    // Subscribe to new messages
    realtimeSubscription = supabase
        .channel('conversations-channel')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
        }, async (payload) => {
            // Reload conversations when new message arrives
            await loadConversations();
        })
        .subscribe();
}

async function updateUserStatus(status) {
    try {
        await supabase
            .from('profiles')
            .update({ status, last_seen: new Date().toISOString() })
            .eq('id', currentUser.id);
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

function setupEventListeners() {
    // New chat button
    newChatBtn.addEventListener('click', () => {
        showNewChatModal();
    });

    // Search functionality
    searchInput.addEventListener('input', debounce(async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        await searchConversations(searchTerm);
    }, 300));

    // Logout button
    logoutBtn.addEventListener('click', async () => {
        try {
            await updateUserStatus('offline');
            await logout();
            if (realtimeSubscription) {
                supabase.removeChannel(realtimeSubscription);
            }
            window.location.href = 'login.html';
        } catch (error) {
            console.error('Error logging out:', error);
        }
    });

    // Update status on page visibility change
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            updateUserStatus('away');
        } else {
            updateUserStatus('online');
        }
    });

    // Update status before page unload
    window.addEventListener('beforeunload', () => {
        updateUserStatus('offline');
        if (realtimeSubscription) {
            supabase.removeChannel(realtimeSubscription);
        }
    });
}

async function searchConversations(searchTerm) {
    if (!searchTerm.trim()) {
        await loadConversations();
        return;
    }

    // Search in conversations (simplified implementation)
    const conversationItems = document.querySelectorAll('.conversation-item');
    conversationItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

function showNewChatModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>New Chat</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="search-users">
                    <input type="text" id="userSearch" placeholder="Search users...">
                    <div id="usersList" class="users-list"></div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-secondary" id="createGroupBtn">
                        <i class="fas fa-users"></i> Create Group
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Close modal
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Search users
    const userSearch = modal.querySelector('#userSearch');
    userSearch.addEventListener('input', debounce(async (e) => {
        await searchUsers(e.target.value);
    }, 300));

    // Create group button
    modal.querySelector('#createGroupBtn').addEventListener('click', () => {
        createGroupChat();
    });
}

async function searchUsers(searchTerm) {
    if (!searchTerm.trim()) return;

    const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchTerm}%`)
        .neq('id', currentUser.id)
        .limit(10);

    if (error) {
        console.error('Error searching users:', error);
        return;
    }

    const usersList = document.getElementById('usersList');
    usersList.innerHTML = '';

    users.forEach(user => {
        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=667eea&color=fff`}" 
                 alt="${user.username}">
            <span>${user.username}</span>
        `;
        userItem.addEventListener('click', async () => {
            await createDirectChat(user.id);
            document.querySelector('.modal').remove();
        });
        usersList.appendChild(userItem);
    });
}

async function createDirectChat(otherUserId) {
    try {
        // Check if conversation already exists
        const { data: existingConversations, error: checkError } = await supabase
            .from('conversations')
            .select(`
                *,
                conversation_participants!inner(
                    user_id
                )
            `)
            .eq('is_group', false);

        if (checkError) throw checkError;

        const existingConversation = existingConversations.find(conv => {
            const participantIds = conv.conversation_participants.map(p => p.user_id);
            return participantIds.includes(currentUser.id) && participantIds.includes(otherUserId);
        });

        if (existingConversation) {
            window.location.href = `chat.html?conversation=${existingConversation.id}`;
            return;
        }

        // Create new conversation
        const { data: newConversation, error: convError } = await supabase
            .from('conversations')
            .insert({ is_group: false })
            .select()
            .single();

        if (convError) throw convError;

        // Add participants
        await supabase
            .from('conversation_participants')
            .insert([
                { conversation_id: newConversation.id, user_id: currentUser.id },
                { conversation_id: newConversation.id, user_id: otherUserId }
            ]);

        window.location.href = `chat.html?conversation=${newConversation.id}`;
    } catch (error) {
        console.error('Error creating direct chat:', error);
        alert('Failed to create chat. Please try again.');
    }
}

async function createGroupChat() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Create Group Chat</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Group Name</label>
                    <input type="text" id="groupName" placeholder="Enter group name">
                </div>
                <div class="form-group">
                    <label>Search and Add Members</label>
                    <input type="text" id="groupMemberSearch" placeholder="Search users...">
                    <div id="selectedMembers" class="selected-members"></div>
                    <div id="groupUsersList" class="users-list"></div>
                </div>
                <div class="modal-actions">
                    <button class="btn btn-primary" id="createGroup">
                        <i class="fas fa-check"></i> Create Group
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    const selectedMembers = new Set([currentUser.id]);

    // Close modal
    modal.querySelector('.close-modal').addEventListener('click', () => {
        modal.remove();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    // Search users for group
    const groupMemberSearch = modal.querySelector('#groupMemberSearch');
    groupMemberSearch.addEventListener('input', debounce(async (e) => {
        await searchUsersForGroup(e.target.value, selectedMembers);
    }, 300));

    // Create group button
    modal.querySelector('#createGroup').addEventListener('click', async () => {
        const groupName = modal.querySelector('#groupName').value.trim();
        if (!groupName) {
            alert('Please enter a group name');
            return;
        }

        if (selectedMembers.size < 2) {
            alert('Please add at least one other member');
            return;
        }

        try {
            // Create group conversation
            const { data: newConversation, error: convError } = await supabase
                .from('conversations')
                .insert({
                    is_group: true,
                    group_name: groupName
                })
                .select()
                .single();

            if (convError) throw convError;

            // Add all selected members
            const participants = Array.from(selectedMembers).map(userId => ({
                conversation_id: newConversation.id,
                user_id: userId
            }));

            await supabase
                .from('conversation_participants')
                .insert(participants);

            modal.remove();
            window.location.href = `chat.html?conversation=${newConversation.id}`;
        } catch (error) {
            console.error('Error creating group chat:', error);
            alert('Failed to create group chat. Please try again.');
        }
    });
}

async function searchUsersForGroup(searchTerm, selectedMembers) {
    if (!searchTerm.trim()) return;

    const { data: users, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('username', `%${searchTerm}%`)
        .neq('id', currentUser.id)
        .limit(10);

    if (error) {
        console.error('Error searching users:', error);
        return;
    }

    const groupUsersList = document.querySelector('#groupUsersList');
    const selectedMembersDiv = document.querySelector('#selectedMembers');
    
    groupUsersList.innerHTML = '';
    selectedMembersDiv.innerHTML = '';

    // Display selected members
    selectedMembers.forEach(async (userId) => {
        if (userId === currentUser.id) return;
        
        const { data: user } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (user) {
            const selectedItem = document.createElement('span');
            selectedItem.className = 'selected-member';
            selectedItem.innerHTML = `
                ${user.username}
                <button class="remove-member" data-user-id="${userId}">&times;</button>
            `;
            selectedMembersDiv.appendChild(selectedItem);
        }
    });

    // Add event listeners to remove buttons
    selectedMembersDiv.querySelectorAll('.remove-member').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const userId = e.target.dataset.userId;
            selectedMembers.delete(userId);
            searchUsersForGroup(searchTerm, selectedMembers);
        });
    });

    // Display search results
    users.forEach(user => {
        if (selectedMembers.has(user.id)) return;

        const userItem = document.createElement('div');
        userItem.className = 'user-item';
        userItem.innerHTML = `
            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&background=667eea&color=fff`}" 
                 alt="${user.username}">
            <span>${user.username}</span>
            <button class="add-member" data-user-id="${user.id}">+ Add</button>
        `;
        
        const addBtn = userItem.querySelector('.add-member');
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selectedMembers.add(user.id);
            searchUsersForGroup(searchTerm, selectedMembers);
        });

        groupUsersList.appendChild(userItem);
    });
}

// Utility functions
function formatTime(dateString) {
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

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

export { loadConversations };
