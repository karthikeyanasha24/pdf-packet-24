import { supabase } from '@/lib/supabaseClient'
import { hash, compare } from 'bcryptjs'

interface AdminUser {
  id: string
  email: string
  is_active: boolean
  created_at: string
  last_login: string | null
}

interface LoginResponse {
  success: boolean
  user?: AdminUser
  error?: string
}

class AdminAuthService {
  /**
   * Hash a password using bcryptjs
   */
  private async hashPassword(password: string): Promise<string> {
    return hash(password, 10)
  }

  /**
   * Compare password with hash
   */
  private async comparePassword(password: string, hash: string): Promise<boolean> {
    return compare(password, hash)
  }

  /**
   * Register a new admin user (admin only)
   */
  async registerAdmin(email: string, password: string): Promise<LoginResponse> {
    try {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return { success: false, error: 'Invalid email format' }
      }

      // Validate password strength
      if (password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' }
      }

      // Hash password
      const passwordHash = await this.hashPassword(password)

      // Create admin user
      const { data, error } = await supabase
        .from('admin_users')
        .insert([{ email, password_hash: passwordHash }])
        .select()
        .maybeSingle()

      if (error) {
        return { success: false, error: error.message }
      }

      if (!data) {
        return { success: false, error: 'Failed to create admin user' }
      }

      return {
        success: true,
        user: {
          id: data.id,
          email: data.email,
          is_active: data.is_active,
          created_at: data.created_at,
          last_login: data.last_login,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to register admin',
      }
    }
  }

  /**
   * Login admin user
   */
  async loginAdmin(email: string, password: string): Promise<LoginResponse> {
    try {
      // Get admin user by email
      const { data, error } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (error) {
        return { success: false, error: 'Invalid credentials' }
      }

      if (!data) {
        return { success: false, error: 'Invalid credentials' }
      }

      if (!data.is_active) {
        return { success: false, error: 'This admin account is inactive' }
      }

      // Compare password
      const passwordMatch = await this.comparePassword(password, data.password_hash)
      if (!passwordMatch) {
        return { success: false, error: 'Invalid credentials' }
      }

      // Update last login
      await supabase
        .from('admin_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id)

      // Store session token in localStorage
      const sessionToken = btoa(JSON.stringify({ userId: data.id, email: data.email, timestamp: Date.now() }))
      localStorage.setItem('admin_session', sessionToken)

      return {
        success: true,
        user: {
          id: data.id,
          email: data.email,
          is_active: data.is_active,
          created_at: data.created_at,
          last_login: data.last_login,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
      }
    }
  }

  /**
   * Logout admin user
   */
  logout(): void {
    localStorage.removeItem('admin_session')
  }

  /**
   * Get current logged in admin from session
   */
  getCurrentAdmin(): { userId: string; email: string } | null {
    try {
      const sessionToken = localStorage.getItem('admin_session')
      if (!sessionToken) return null

      const decoded = JSON.parse(atob(sessionToken))
      return { userId: decoded.userId, email: decoded.email }
    } catch {
      return null
    }
  }

  /**
   * Check if user is logged in
   */
  isLoggedIn(): boolean {
    return !!this.getCurrentAdmin()
  }

  /**
   * Change admin password
   */
  async changePassword(email: string, oldPassword: string, newPassword: string): Promise<LoginResponse> {
    try {
      // Validate new password
      if (newPassword.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' }
      }

      // Get admin user
      const { data: userData, error: userError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('email', email)
        .maybeSingle()

      if (userError || !userData) {
        return { success: false, error: 'User not found' }
      }

      // Verify old password
      const passwordMatch = await this.comparePassword(oldPassword, userData.password_hash)
      if (!passwordMatch) {
        return { success: false, error: 'Current password is incorrect' }
      }

      // Hash new password
      const newPasswordHash = await this.hashPassword(newPassword)

      // Update password
      const { error } = await supabase
        .from('admin_users')
        .update({ password_hash: newPasswordHash })
        .eq('id', userData.id)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to change password',
      }
    }
  }
}

export const adminAuthService = new AdminAuthService()
