import { supabase } from './supabase.js';

// Auth functions
export const signup = async (email, password, username, full_name) => {
    try {
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: {
                    username,
                    full_name,
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(full_name)}&background=667eea&color=fff`
                }
            }
        });

        if (authError) throw authError;
        return authData;
    } catch (error) {
        throw error;
    }
};

export const login = async (email, password) => {
    try {
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;
        return data;
    } catch (error) {
        throw error;
    }
};

export const logout = async () => {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    } catch (error) {
        throw error;
    }
};

export const getCurrentUser = async () => {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        return user;
    } catch (error) {
        throw error;
    }
};

export const updateProfile = async (userId, updates) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) throw error;
        return data;
    } catch (error) {
        throw error;
    }
};

export const getProfile = async (userId) => {
    try {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;
        return data;
    } catch (error) {
        throw error;
    }
};
