// Test file to demonstrate relationship extraction
import { Request, Response } from 'express';
import { UserService } from './services/UserService';
import { validateInput } from './utils/validation';
import type { User, UserProfile } from './types';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

class UserController {
  private userService: UserService;
  
  constructor() {
    this.userService = new UserService();
  }
  
  async getUser(req: Request, res: Response): Promise<void> {
    const userId = req.params.id;
    
    if (!validateInput(userId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid user ID'
      });
      return;
    }
    
    try {
      const user = await this.userService.findById(userId);
      const profile = await this.buildUserProfile(user);
      
      const response: ApiResponse<UserProfile> = {
        success: true,
        data: profile
      };
      
      res.json(response);
    } catch (error) {
      this.handleError(error, res);
    }
  }
  
  private async buildUserProfile(user: User): Promise<UserProfile> {
    const permissions = await this.userService.getPermissions(user.id);
    return {
      ...user,
      permissions
    };
  }
  
  private handleError(error: unknown, res: Response): void {
    console.error('Error in UserController:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
}

export function createUserController(): UserController {
  return new UserController();
}